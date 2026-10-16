/**
 * src/main/auth/oauth-service.ts
 *
 * OAuth 2.0 PKCE login flow and manual session import for Salesforce.
 *
 * Key design choices:
 *  - PKCE S256 challenge/verifier generated fresh for every login attempt.
 *  - The OAuth modal window uses an isolated session partition so multiple
 *    orgs / logins never share browser cookies or cache.
 *  - The redirect is intercepted at the Electron layer (will-redirect /
 *    will-navigate) so we do NOT need a local HTTP listener on port 1717.
 *  - Refresh tokens are stored only in session-vault and never leave main.
 */

import { BrowserWindow, net } from "electron";
import * as crypto from "crypto";
import type { EnvType, OrgProfile } from "../../shared/types/org";
import {
  saveOrgSession,
  getRefreshToken,
  getVaultRecord,
  normalizeSfHost,
} from "./session-vault";

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CLIENT_ID = "PlatformCLI";
const REDIRECT_URI = "http://localhost:1717/OauthRedirect";

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ── HTTP helper (uses Electron's net module to respect proxy settings) ────────

async function httpPost(
  url: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: "POST",
      url,
    });

    request.setHeader("Content-Type", "application/x-www-form-urlencoded");
    request.setHeader("Accept", "application/json");

    const bodyStr = new URLSearchParams(body).toString();

    request.on("response", (response) => {
      let data = "";
      response.on("data", (chunk) => (data += chunk.toString()));
      response.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (response.statusCode && response.statusCode >= 400) {
            reject(
              new Error(
                `Token endpoint returned ${response.statusCode}: ${json.error_description ?? json.error ?? data}`
              )
            );
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Failed to parse token response: ${data}`));
        }
      });
      response.on("error", reject);
    });

    request.on("error", reject);
    request.write(bodyStr);
    request.end();
  });
}

async function httpGet(
  url: string,
  accessToken: string
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: "GET", url });
    request.setHeader("Authorization", `Bearer ${accessToken}`);
    request.setHeader("Accept", "application/json");

    request.on("response", (response) => {
      let data = "";
      response.on("data", (chunk) => (data += chunk.toString()));
      response.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
      response.on("error", reject);
    });

    request.on("error", reject);
    request.end();
  });
}

// ── OAuth PKCE login ─────────────────────────────────────────────────────────

export interface LoginWithOAuthOptions {
  loginUrl: string;
  alias: string;
  orgType: EnvType;
  color?: string;
  clientId?: string;
}

export interface OAuthLoginResult {
  profile: OrgProfile;
}

export async function loginWithOAuth(
  opts: LoginWithOAuthOptions
): Promise<OAuthLoginResult> {
  const {
    loginUrl,
    alias,
    orgType,
    color = "#3B82F6",
    clientId = DEFAULT_CLIENT_ID,
  } = opts;

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  // Build the authorisation URL
  const authUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "login");

  // Open a modal OAuth window with an isolated session partition so separate
  // org logins never bleed into each other.
  const partition = `persist:oauth-${Date.now()}`;

  const oauthWin = new BrowserWindow({
    width: 900,
    height: 700,
    modal: true,
    show: true,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: `Login – ${alias}`,
  });

  const code = await new Promise<string>((resolve, reject) => {
    // Intercept both navigation and redirect events so we never actually
    // let the browser try to open localhost:1717.
    const interceptUrl = (url: string): boolean => {
      if (url.startsWith(REDIRECT_URI)) {
        const parsed = new URL(url);
        const authCode = parsed.searchParams.get("code");
        const error = parsed.searchParams.get("error");

        if (authCode) {
          resolve(authCode);
        } else {
          reject(
            new Error(
              `OAuth error: ${error ?? "unknown"} – ${parsed.searchParams.get("error_description") ?? ""}`
            )
          );
        }

        oauthWin.close();
        return true; // handled
      }
      return false;
    };

    oauthWin.webContents.on("will-navigate", (_event, url) => {
      interceptUrl(url);
    });

    oauthWin.webContents.on("will-redirect", (_event, url) => {
      interceptUrl(url);
    });

    oauthWin.on("closed", () => {
      reject(new Error("OAuth window was closed before login completed."));
    });

    oauthWin.loadURL(authUrl.toString()).catch(reject);
  });

  // Exchange authorisation code for tokens
  const tokenResponse = await httpPost(
    `${loginUrl}/services/oauth2/token`,
    {
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: verifier,
    }
  );

  const accessToken = tokenResponse.access_token as string;
  const refreshToken = (tokenResponse.refresh_token as string) ?? "";
  const instanceUrl = tokenResponse.instance_url as string;
  const idUrl = tokenResponse.id as string;

  // Derive orgId from the ID URL: https://login.salesforce.com/id/<orgId>/<userId>
  const idParts = idUrl.split("/");
  const orgId = idParts[idParts.length - 2] ?? "unknown";

  // Fetch username
  let username: string | undefined;
  try {
    const idInfo = await httpGet(idUrl, accessToken);
    username = idInfo.username as string;
  } catch {
    // Non-fatal
  }

  const sfHost = normalizeSfHost(instanceUrl);

  const profile: OrgProfile = {
    orgId,
    alias,
    sfHost,
    loginUrl,
    username,
    orgType,
    color,
    isConnected: true,
  };

  saveOrgSession(profile, accessToken, refreshToken);

  return { profile };
}

// ── Token refresh ────────────────────────────────────────────────────────────

export async function refreshAccessToken(orgId: string): Promise<string> {
  const record = getVaultRecord(orgId);
  if (!record) {
    throw new Error(`No vault record found for orgId: ${orgId}`);
  }

  const refreshToken = getRefreshToken(orgId);
  if (!refreshToken) {
    throw new Error(`No refresh token stored for orgId: ${orgId}`);
  }

  const tokenResponse = await httpPost(
    `${record.loginUrl}/services/oauth2/token`,
    {
      grant_type: "refresh_token",
      client_id: DEFAULT_CLIENT_ID,
      refresh_token: refreshToken,
    }
  );

  const newAccessToken = tokenResponse.access_token as string;

  // Re-save with the new access token (refresh token is typically unchanged)
  const updatedProfile: OrgProfile = {
    orgId: record.orgId,
    alias: record.alias,
    sfHost: record.sfHost,
    loginUrl: record.loginUrl,
    username: record.username,
    orgType: record.orgType,
    color: record.color,
    isConnected: true,
  };

  saveOrgSession(updatedProfile, newAccessToken, refreshToken);

  return newAccessToken;
}

// ── Manual session import ────────────────────────────────────────────────────

export interface ManualSessionOptions {
  sfHost: string;
  sessionId: string;
  alias: string;
  orgType: EnvType;
  color?: string;
}

export async function loginWithManualSession(
  opts: ManualSessionOptions
): Promise<OAuthLoginResult> {
  const { sfHost: rawHost, sessionId, alias, orgType, color = "#6B7280" } = opts;
  const sfHost = normalizeSfHost(rawHost);

  // Verify the session is alive and discover the org ID by calling /services/data
  const instanceUrl = `https://${sfHost}`;

  // Get the identity URL to extract orgId and username
  let orgId = `manual-${sfHost}`;
  let username: string | undefined;
  let loginUrl = `https://login.salesforce.com`;

  try {
    const idResponse = await httpGet(
      `${instanceUrl}/services/oauth2/userinfo`,
      sessionId
    );
    orgId = (idResponse.organization_id as string) ?? orgId;
    username = idResponse.preferred_username as string | undefined;
  } catch {
    // If /userinfo fails, try /services/data just to check session validity
    try {
      await httpGet(`${instanceUrl}/services/data`, sessionId);
    } catch (err) {
      throw new Error(
        `Session verification failed for ${sfHost}: ${(err as Error).message}`
      );
    }
  }

  // Determine if this is a sandbox by the host naming convention
  if (
    sfHost.includes(".sandbox.") ||
    sfHost.includes(".scratch.") ||
    sfHost.endsWith(".cs.salesforce.com") ||
    (orgType === "SANDBOX" && !loginUrl.includes("test"))
  ) {
    loginUrl = "https://test.salesforce.com";
  }

  const profile: OrgProfile = {
    orgId,
    alias,
    sfHost,
    loginUrl,
    username,
    orgType,
    color,
    isConnected: true,
  };

  // No refresh token for manual sessions
  saveOrgSession(profile, sessionId, "");

  return { profile };
}
