/**
 * src/main/auth/oauth-service.ts
 *
 * OAuth 2.0 PKCE login flow and manual session import for Salesforce.
 * Pure Node.js implementation without Electron dependencies.
 *
 * Key features:
 *  - PKCE S256 challenge/verifier generated fresh for every login attempt.
 *  - Temporary local HTTP server on 127.0.0.1:1717 intercepts the OAuth redirect.
 *  - Launches OS default browser to authenticate.
 *  - 3-minute timeout with graceful cleanup.
 *  - Native Node fetch() for token exchanges and identity queries.
 *  - Refresh tokens stored encrypted in ~/.sfir-desktop/org-vault.json.
 */

import * as http from "http";
import * as crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import type { EnvType, OrgProfile, SfSessionPayload } from "../../shared/types/org";
import {
  saveOrgSession,
  getRefreshToken,
  getVaultRecord,
  getOrgSession,
  getOrgSessionByHost,
  normalizeSfHost,
} from "./session-vault";

const execAsync = promisify(exec);

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CLIENT_ID = "PlatformCLI";
const REDIRECT_URI = "http://localhost:1717/OauthRedirect";

// ── Cross-platform OS browser launcher ───────────────────────────────────────

export function openExternalInOs(url: string): Promise<void> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd = "";
    if (platform === "win32") {
      cmd = `start "" "${url}"`;
    } else if (platform === "darwin") {
      cmd = `open "${url}"`;
    } else {
      cmd = `xdg-open "${url}"`;
    }
    exec(cmd, (err) => {
      if (err) {
        console.error("[openExternalInOs] Failed to open URL:", err);
      }
      resolve();
    });
  });
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ── HTTP helpers using native Node fetch ──────────────────────────────────────

async function httpPost(
  url: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const bodyStr = new URLSearchParams(body).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: bodyStr,
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse token response: ${text}`);
  }

  if (!res.ok) {
    throw new Error(
      `Token endpoint returned ${res.status}: ${json.error_description ?? json.error ?? text}`
    );
  }

  return json;
}

async function httpGet(
  url: string,
  accessToken: string
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse response: ${text}`);
  }

  if (!res.ok) {
    throw new Error(
      `Request returned ${res.status}: ${json.error_description ?? json.error ?? text}`
    );
  }

  return json;
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
  // Omitting 'scope' allows Salesforce to automatically assign all scopes
  // configured on the Connected App (including refresh_token and api).
  const authUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "login");

  // Spin up temporary local HTTP listener on port 1717
  const code = await new Promise<string>((resolve, reject) => {
    let server: http.Server | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (server) {
        try {
          server.close();
        } catch {}
        server = null;
      }
    };

    server = http.createServer((req, res) => {
      try {
        const reqUrl = req.url || "";
        if (reqUrl.startsWith("/OauthRedirect")) {
          const parsed = new URL(reqUrl, "http://localhost:1717");
          const authCode = parsed.searchParams.get("code");
          const error = parsed.searchParams.get("error");
          const errorDesc = parsed.searchParams.get("error_description");

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            Connection: "close",
          });
          res.end(
            `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Authentication Successful</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        background-color: #0f172a;
        color: #f8fafc;
      }
      .card {
        text-align: center;
        background: #1e293b;
        padding: 36px 48px;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
        border: 1px solid #334155;
      }
      h2 { color: #38bdf8; margin: 0 0 12px; }
      p { color: #94a3b8; margin: 0; font-size: 15px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Authentication Successful!</h2>
      <p>You can close this tab and return to Salesforce Inspector Reloaded.</p>
    </div>
    <script>
      setTimeout(() => { window.close(); }, 1500);
    </script>
  </body>
</html>`
          );

          cleanup();

          if (authCode) {
            resolve(authCode);
          } else {
            reject(
              new Error(
                `OAuth error: ${error ?? "unknown"} – ${errorDesc ?? ""}`
              )
            );
          }
          return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      } catch (e) {
        cleanup();
        reject(e);
      }
    });

    server.on("error", (err: any) => {
      cleanup();
      reject(new Error(`Failed to bind OAuth listener on port 1717: ${err.message}`));
    });

    // 3-minute timeout
    timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error("OAuth login timed out after 3 minutes."));
    }, 180000);

    server.listen(1717, "127.0.0.1", () => {
      console.log(`[oauth-service] Temporary listener active on http://127.0.0.1:1717. Opening browser...`);
      openExternalInOs(authUrl.toString());
    });
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
  const idParts = idUrl ? idUrl.split("/") : [];
  const orgId = idParts.length >= 2 ? idParts[idParts.length - 2] : "unknown";

  // Fetch username
  let username: string | undefined;
  if (idUrl) {
    try {
      const idInfo = await httpGet(idUrl, accessToken);
      username = idInfo.username as string;
    } catch {
      // Non-fatal
    }
  }

  const sfHost = normalizeSfHost(instanceUrl || loginUrl);

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

// ── Token refresh & Self-Healing ──────────────────────────────────────────────

export async function refreshAccessToken(orgId: string): Promise<string> {
  const record = getVaultRecord(orgId);
  if (!record) {
    throw new Error(`No vault record found for orgId: ${orgId}`);
  }

  // Strategy A: OAuth 2.0 refresh_token flow
  const refreshToken = getRefreshToken(orgId);
  if (refreshToken) {
    try {
      const tokenResponse = await httpPost(
        `${record.loginUrl}/services/oauth2/token`,
        {
          grant_type: "refresh_token",
          client_id: DEFAULT_CLIENT_ID,
          refresh_token: refreshToken,
        }
      );

      const newAccessToken = tokenResponse.access_token as string;
      if (newAccessToken) {
        const updatedProfile: OrgProfile = {
          orgId: record.orgId,
          alias: record.alias,
          sfHost: normalizeSfHost(record.sfHost),
          loginUrl: record.loginUrl,
          username: record.username,
          orgType: record.orgType,
          color: record.color,
          isConnected: true,
        };

        saveOrgSession(updatedProfile, newAccessToken, refreshToken);
        return newAccessToken;
      }
    } catch (oauthErr) {
      console.warn(
        `[refreshAccessToken] Strategy A (OAuth refresh) failed for ${record.alias || orgId}:`,
        oauthErr
      );
    }
  }

  // Strategy B: SFDX / SF CLI Re-Sync
  const targetOrg = record.username || record.alias || record.sfHost;
  if (targetOrg) {
    try {
      const cliToken = await refreshViaCli(targetOrg);
      if (cliToken) {
        const updatedProfile: OrgProfile = {
          orgId: record.orgId,
          alias: record.alias,
          sfHost: normalizeSfHost(record.sfHost),
          loginUrl: record.loginUrl,
          username: record.username,
          orgType: record.orgType,
          color: record.color,
          isConnected: true,
        };
        saveOrgSession(updatedProfile, cliToken, refreshToken || "");
        return cliToken;
      }
    } catch (cliErr) {
      console.warn(
        `[refreshAccessToken] Strategy B (CLI sync) failed for ${targetOrg}:`,
        cliErr
      );
    }
  }

  throw new Error(
    `Session refresh failed for ${record.alias || orgId}. Please re-authenticate.`
  );
}

async function refreshViaCli(targetOrg: string): Promise<string | null> {
  const commands = [
    `sf org display --target-org "${targetOrg}" --json`,
    `sf org auth show-access-token --target-org "${targetOrg}" --json`,
    `sfdx force:org:display --targetusername "${targetOrg}" --json`,
  ];

  const env = {
    ...process.env,
    PATH:
      process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:/usr/sbin:/sbin",
  };

  for (const cmd of commands) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 15000, env });
      const parsed = JSON.parse(stdout);
      if (parsed && (parsed.status === 0 || parsed.result)) {
        const token =
          parsed.result?.accessToken ||
          parsed.result?.access_token ||
          parsed.result?.token;
        if (token && typeof token === "string" && !token.includes("[REDACTED]")) {
          return token;
        }
      }
    } catch {
      // Continue to next command
    }
  }
  return null;
}

export async function validateSession(orgId: string): Promise<boolean> {
  const session = getOrgSession(orgId);
  if (!session || !session.key) return false;

  const sfHost = normalizeSfHost(session.hostname);
  const instanceUrl = `https://${sfHost}`;

  try {
    const probeResponse = await httpGet(
      `${instanceUrl}/services/oauth2/userinfo`,
      session.key
    );
    if (
      probeResponse &&
      (probeResponse.organization_id || probeResponse.user_id || probeResponse.sub)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function getValidSession(
  payload: { orgId?: string; sfHost?: string },
  forceRefresh = false
): Promise<SfSessionPayload | null> {
  let record = payload.orgId ? getVaultRecord(payload.orgId) : null;
  if (!record && payload.sfHost) {
    const target = normalizeSfHost(payload.sfHost);
    const session = getOrgSessionByHost(target);
    if (session?.orgId) {
      record = getVaultRecord(session.orgId);
    }
  }
  if (!record) return null;

  if (!forceRefresh) {
    const isValid = await validateSession(record.orgId);
    if (isValid) {
      return getOrgSession(record.orgId);
    }
  }

  // Token is expired or forceRefresh requested: trigger self-healing auto-refresh
  try {
    await refreshAccessToken(record.orgId);
    return getOrgSession(record.orgId);
  } catch (err) {
    console.warn(`[getValidSession] Auto-refresh failed for ${record.alias}:`, err);
    return getOrgSession(record.orgId);
  }
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

  // Verify the session is alive and discover the org ID by calling /services/oauth2/userinfo or /services/data
  const instanceUrl = `https://${sfHost}`;

  let orgId = `manual-${sfHost}`;
  let username: string | undefined;
  let loginUrl = `https://login.salesforce.com`;

  try {
    const idResponse = await httpGet(
      `${instanceUrl}/services/oauth2/userinfo`,
      sessionId
    );
    orgId = (idResponse.organization_id as string) ?? orgId;
    username = (idResponse.preferred_username as string) ?? (idResponse.username as string);
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
