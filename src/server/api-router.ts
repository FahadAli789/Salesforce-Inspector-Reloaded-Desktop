/**
 * src/server/api-router.ts
 *
 * Node.js HTTP router for Salesforce Inspector Reloaded:
 * 1. IPC API endpoints: POST /api/ipc/:action
 * 2. Reverse proxy for Salesforce endpoints: /sf-proxy/:sfHost/*
 *
 * Replaces Electron IPC Main handlers and provides zero-CORS Salesforce forwarding.
 */

import type { IncomingMessage, ServerResponse } from "http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  loginWithOAuth,
  loginWithManualSession,
  getValidSession,
  openExternalInOs,
  type LoginWithOAuthOptions,
  type ManualSessionOptions,
} from "../main/auth/oauth-service";
import {
  getVaultRecord,
  getDecryptedAccessToken,
  normalizeSfHost,
  listOrgProfiles,
  removeOrg,
  saveOrgSession,
} from "../main/auth/session-vault";
import {
  openIsolatedBrowserSession,
  type HostBrowserType,
  type IsolationMode,
} from "../main/auth/browser-launcher";
import type { OrgProfile } from "../shared/types/org";

export { openExternalInOs };

async function buildLoginAsFrontdoorUrl(params: {
  sfHost: string;
  accessToken: string;
  orgId: string;
  targetUserId: string;
  networkId?: string;
  retUrl?: string;
  targetUrl?: string;
}): Promise<string> {
  const {
    sfHost,
    accessToken,
    orgId,
    targetUserId,
    networkId,
    retUrl = "/lightning/page/home",
    targetUrl = "/lightning/page/home",
  } = params;

  // 1. Construct the relative /servlet/servlet.su path
  const servletSuPath = networkId
    ? `/servlet/servlet.su?oid=${encodeURIComponent(
        orgId
      )}&retURL=${encodeURIComponent(retUrl)}&sunetworkid=${encodeURIComponent(
        networkId
      )}&sunetworkuserid=${encodeURIComponent(targetUserId)}`
    : `/servlet/servlet.su?oid=${encodeURIComponent(
        orgId
      )}&suorgadminid=${encodeURIComponent(
        targetUserId
      )}&retURL=${encodeURIComponent(retUrl)}&targetURL=${encodeURIComponent(
        targetUrl
      )}`;

  // 2. Attempt Salesforce Single Access UI Bridge first to prevent session hijacking flags
  try {
    const cleanRedirectUri = servletSuPath.replace(/^\//, "");
    const singleAccessEndpoint = `https://${sfHost}/services/oauth2/singleaccess?redirect_uri=${encodeURIComponent(
      cleanRedirectUri
    )}`;
    const response = await fetch(singleAccessEndpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const payload = (await response.json()) as { frontdoor_uri?: string };
      if (payload?.frontdoor_uri) {
        return payload.frontdoor_uri;
      }
    }
  } catch (err) {
    console.warn(
      "[auth:login-as-user] Single Access bridge unavailable, falling back to frontdoor.jsp:",
      err
    );
  }

  // 3. Fallback: Standard frontdoor.jsp wrapping the relative servlet.su path
  return `https://${sfHost}/secur/frontdoor.jsp?sid=${encodeURIComponent(
    accessToken
  )}&retURL=${encodeURIComponent(servletSuPath)}`;
}

function readRequestBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readRequestBodyJson(req: IncomingMessage): Promise<any> {
  const buf = await readRequestBodyBuffer(req);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString("utf-8"));
  } catch {
    return {};
  }
}

function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.end(JSON.stringify(data));
}

// ── SFDX / Salesforce CLI Orgs Import ────────────────────────────────────────

function importSfdxOrgs(): OrgProfile[] {
  const sfdxDir = path.join(os.homedir(), ".sfdx");
  if (!fs.existsSync(sfdxDir)) {
    return listOrgProfiles();
  }

  // Read alias.json if exists
  const aliasMap: Record<string, string> = {};
  const aliasPath = path.join(sfdxDir, "alias.json");
  if (fs.existsSync(aliasPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(aliasPath, "utf-8"));
      if (raw.orgs && typeof raw.orgs === "object") {
        for (const [alias, username] of Object.entries(raw.orgs)) {
          if (typeof username === "string") {
            aliasMap[username] = alias;
          }
        }
      }
    } catch {}
  }

  const files = fs.readdirSync(sfdxDir);
  for (const f of files) {
    if (!f.endsWith(".json") || f === "alias.json" || f === "sfdx-config.json") {
      continue;
    }
    try {
      const filePath = path.join(sfdxDir, f);
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (data.orgId && data.instanceUrl) {
        const sfHost = normalizeSfHost(String(data.instanceUrl));
        const username = data.username || f.replace(/\.json$/, "");
        const alias = aliasMap[username] || data.name || username;
        const isSandbox = Boolean(data.isSandbox || data.isScratch);

        const profile: OrgProfile = {
          orgId: data.orgId,
          alias,
          sfHost,
          loginUrl:
            data.loginUrl ||
            (isSandbox
              ? "https://test.salesforce.com"
              : "https://login.salesforce.com"),
          username,
          orgType: isSandbox ? "SANDBOX" : "DEV",
          color: isSandbox ? "#d97706" : "#2563eb",
          isConnected: true,
        };

        saveOrgSession(
          profile,
          data.accessToken || "",
          data.refreshToken || ""
        );
      }
    } catch {
      /* ignore corrupted single org file */
    }
  }

  return listOrgProfiles();
}

// ── Salesforce REST & SOAP Direct Request Handlers ───────────────────────────

async function handleSfRestRequest(args: {
  sfHost: string;
  path: string;
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}): Promise<any> {
  const { sfHost, path: reqPath, method = "GET", body, headers = {} } = args;
  if (!sfHost) {
    throw new Error("Missing sfHost in sf:rest-request");
  }

  let session = await getValidSession({ sfHost }, false);
  if (!session || !session.key) {
    throw new Error(`No valid session found for host: ${sfHost}`);
  }

  const bareHost = normalizeSfHost(session.hostname || sfHost);
  const cleanPath = reqPath.startsWith("/") ? reqPath : `/${reqPath}`;
  const url = `https://${bareHost}${cleanPath}`;

  const makeRequest = async (token: string) => {
    const reqHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    };

    const fetchInit: RequestInit = {
      method: method.toUpperCase(),
      headers: reqHeaders,
    };

    if (
      body &&
      (fetchInit.method === "POST" ||
        fetchInit.method === "PATCH" ||
        fetchInit.method === "PUT")
    ) {
      fetchInit.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    return await fetch(url, fetchInit);
  };

  let response = await makeRequest(session.key);

  // If 401 Unauthorized, refresh the session once and retry
  if (response.status === 401) {
    console.warn(
      `[sf:rest-request] 401 received for ${bareHost}${cleanPath}, refreshing session...`
    );
    const refreshed = await getValidSession({ sfHost }, true);
    if (refreshed && refreshed.key) {
      response = await makeRequest(refreshed.key);
    }
  }

  if (!response.ok) {
    let errMessage = `Salesforce REST error: HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson: any = await response.json();
      if (Array.isArray(errJson) && errJson[0]?.message) {
        errMessage = errJson[0].message;
      } else if (errJson?.message) {
        errMessage = errJson.message;
      }
    } catch {}
    throw new Error(errMessage);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  return await response.text();
}

async function handleSfSoapRequest(args: {
  sfHost: string;
  path: string;
  soapAction?: string;
  xmlBody: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; data: string }> {
  const {
    sfHost,
    path: reqPath,
    soapAction = '""',
    xmlBody,
    headers = {},
  } = args;
  if (!sfHost) {
    throw new Error("Missing sfHost in sf:soap-request");
  }

  let session = await getValidSession({ sfHost }, false);
  if (!session || !session.key) {
    throw new Error(`No valid session found for host: ${sfHost}`);
  }

  const bareHost = normalizeSfHost(session.hostname || sfHost);
  const cleanPath = reqPath.startsWith("/") ? reqPath : `/${reqPath}`;
  const url = `https://${bareHost}${cleanPath}`;

  const makeSoapRequest = async (token: string, bodyText: string) => {
    let finalBody = bodyText;
    if (finalBody.includes("<sessionId>")) {
      finalBody = finalBody.replace(
        /<sessionId>[^<]*<\/sessionId>/g,
        `<sessionId>${token}</sessionId>`
      );
    }

    const reqHeaders: Record<string, string> = {
      "Content-Type": "text/xml; charset=UTF-8",
      SOAPAction: soapAction,
      ...headers,
    };

    return await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body: finalBody,
    });
  };

  let response = await makeSoapRequest(session.key, xmlBody);

  // If 401 Unauthorized, refresh the session once and retry
  if (response.status === 401) {
    console.warn(
      `[sf:soap-request] 401 received for ${bareHost}${cleanPath}, refreshing session...`
    );
    const refreshed = await getValidSession({ sfHost }, true);
    if (refreshed && refreshed.key) {
      response = await makeSoapRequest(refreshed.key, xmlBody);
    }
  }

  let responseText = await response.text();

  // If status 500 with INVALID_SESSION_ID in SOAP fault, try refreshing once
  if (
    response.status >= 400 &&
    (responseText.includes("INVALID_SESSION_ID") ||
      responseText.includes("Session expired or invalid"))
  ) {
    console.warn(
      `[sf:soap-request] SOAP fault with INVALID_SESSION_ID for ${bareHost}${cleanPath}, refreshing...`
    );
    const refreshed = await getValidSession({ sfHost }, true);
    if (refreshed && refreshed.key) {
      response = await makeSoapRequest(refreshed.key, xmlBody);
      responseText = await response.text();
    }
  }

  return { status: response.status, data: responseText };
}

// ── Reverse Proxy Handler (/sf-proxy/:sfHost/*) ──────────────────────────────

async function handleReverseProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || "";
  const match = url.match(/^\/sf-proxy\/([^/?#]+)(\/.*)?$/);
  if (!match) {
    res.statusCode = 400;
    res.end("Bad sf-proxy request");
    return;
  }

  const sfHost = match[1];
  const sfPath = match[2] || "/";

  // Preflight OPTIONS: answer immediately with permissive CORS
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept, SOAPAction, CallOptions, Sforce-Call-Options, Sforce-Auto-Assign, Sforce-Duplicate-Rule-Header, Sforce-Query-Options, X-SFDC-Session, X-PrettyPrint, Range, Cache-Control, Pragma, Priority, *"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    res.end();
    return;
  }

  const bodyBuffer = await readRequestBodyBuffer(req);

  // Forward request headers, stripping Origin, Referer, and Host
  const forwardedHeaders: Record<string, string> = {};
  for (const [key, val] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (
      lower === "host" ||
      lower === "origin" ||
      lower === "referer" ||
      lower === "connection" ||
      lower === "content-length"
    ) {
      continue;
    }
    if (val) {
      forwardedHeaders[key] = Array.isArray(val) ? val.join(", ") : val;
    }
  }

  if (sfPath.includes("/services/Soap/") && !forwardedHeaders["soapaction"] && !forwardedHeaders["SOAPAction"]) {
    forwardedHeaders["SOAPAction"] = '""';
  }

  const targetUrl = `https://${sfHost}${sfPath}`;

  try {
    const fetchRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardedHeaders,
      body:
        req.method !== "GET" && req.method !== "HEAD" && bodyBuffer.length > 0
          ? bodyBuffer
          : undefined,
    });

    res.statusCode = fetchRes.status;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
    res.setHeader("Access-Control-Expose-Headers", "*");

    const contentType = fetchRes.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const arrayBuffer = await fetchRes.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error(`[sf-proxy] Error forwarding request to ${targetUrl}:`, err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ error: `Proxy forwarding error: ${err.message}` }));
  }
}

// ── Main API Request Dispatcher ──────────────────────────────────────────────

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || "";

  // 1. Check Reverse Proxy
  if (url.startsWith("/sf-proxy/")) {
    await handleReverseProxy(req, res);
    return true;
  }

  // 2. Check IPC API Router
  if (url.startsWith("/api/ipc/")) {
    const action = decodeURIComponent(url.slice("/api/ipc/".length).split("?")[0]);

    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.end();
      return true;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method Not Allowed. Use POST." });
      return true;
    }

    const body = await readRequestBodyJson(req);

    try {
      switch (action) {
        case "auth:login-oauth": {
          const result = await loginWithOAuth(body as LoginWithOAuthOptions);
          sendJson(res, 200, { success: true, result: result.profile });
          return true;
        }

        case "auth:login-manual": {
          const result = await loginWithManualSession(body as ManualSessionOptions);
          sendJson(res, 200, { success: true, result: result.profile });
          return true;
        }

        case "auth:get-session": {
          const session = await getValidSession(body);
          sendJson(res, 200, {
            success: true,
            result: session
              ? { ...session, hostname: normalizeSfHost(session.hostname) }
              : null,
          });
          return true;
        }

        case "auth:validate-session": {
          const session = await getValidSession(body, false);
          sendJson(res, 200, {
            success: true,
            result: session
              ? { ...session, hostname: normalizeSfHost(session.hostname) }
              : null,
          });
          return true;
        }

        case "auth:refresh-session": {
          const session = await getValidSession(body, true);
          sendJson(res, 200, {
            success: true,
            result: session
              ? { ...session, hostname: normalizeSfHost(session.hostname) }
              : null,
          });
          return true;
        }

        case "auth:list-orgs": {
          const orgs = listOrgProfiles();
          sendJson(res, 200, { success: true, result: orgs });
          return true;
        }

        case "auth:remove-org": {
          const ok = removeOrg(body.orgId);
          sendJson(res, 200, { success: true, result: ok });
          return true;
        }

        case "auth:open-org-frontdoor": {
          const record = getVaultRecord(body.orgId);
          if (!record) {
            throw new Error(`Org not found in vault: ${body.orgId}`);
          }
          const accessToken = getDecryptedAccessToken(body.orgId);
          if (!accessToken) {
            throw new Error(`No access token found for org: ${body.orgId}`);
          }
          const sfHost = normalizeSfHost(record.sfHost);
          const targetRetUrl = body.retUrl || "/lightning/page/home";
          const frontdoorUrl = `https://${sfHost}/secur/frontdoor.jsp?sid=${encodeURIComponent(
            accessToken
          )}&retURL=${encodeURIComponent(targetRetUrl)}`;
          await openExternalInOs(frontdoorUrl);
          sendJson(res, 200, { success: true, result: null });
          return true;
        }

        case "shell:open-external": {
          const targetUrl = typeof body === "string" ? body : body?.url;
          if (
            targetUrl &&
            (targetUrl.startsWith("https://") ||
              targetUrl.startsWith("http://") ||
              targetUrl.startsWith("mailto:"))
          ) {
            await openExternalInOs(targetUrl);
          }
          sendJson(res, 200, { success: true, result: null });
          return true;
        }

        case "auth:login-as-user": {
          const {
            orgId,
            targetUserId,
            networkId,
            retUrl,
            targetUrl,
            browserHint,
            isolationMode = "incognito",
          } = body as {
            orgId: string;
            targetUserId: string;
            networkId?: string;
            retUrl?: string;
            targetUrl?: string;
            browserHint?: HostBrowserType;
            isolationMode?: IsolationMode;
          };

          const record = getVaultRecord(orgId);
          if (!record) {
            throw new Error(`Org not found in vault: ${orgId}`);
          }
          const accessToken = getDecryptedAccessToken(orgId);
          if (!accessToken) {
            throw new Error(`No access token found for org: ${orgId}`);
          }

          const sfHost = normalizeSfHost(record.sfHost);
          const finalUrl = await buildLoginAsFrontdoorUrl({
            sfHost,
            accessToken,
            orgId: record.orgId || orgId,
            targetUserId,
            networkId,
            retUrl,
            targetUrl,
          });

          await openIsolatedBrowserSession({
            url: finalUrl,
            browserHint,
            userAgent: req.headers["user-agent"],
            isolationMode,
            profileTag: `${orgId}_${targetUserId}`,
          });

          sendJson(res, 200, { success: true, result: { url: finalUrl } });
          return true;
        }

        case "shell:open-incognito": {
          const targetUrl = typeof body === "string" ? body : body?.url;
          if (
            targetUrl &&
            (targetUrl.startsWith("https://") || targetUrl.startsWith("http://"))
          ) {
            await openIsolatedBrowserSession({
              url: targetUrl,
              browserHint: body?.browserHint,
              userAgent: req.headers["user-agent"],
              isolationMode: body?.isolationMode || "incognito",
            });
          }
          sendJson(res, 200, { success: true, result: null });
          return true;
        }

        case "auth:import-sfdx-orgs": {
          const orgs = importSfdxOrgs();
          sendJson(res, 200, { success: true, result: orgs });
          return true;
        }

        case "sf:rest-request": {
          const result = await handleSfRestRequest(body);
          sendJson(res, 200, { success: true, result });
          return true;
        }

        case "sf:soap-request": {
          const result = await handleSfSoapRequest(body);
          sendJson(res, 200, { success: true, result });
          return true;
        }

        default:
          sendJson(res, 404, { success: false, error: `Unknown IPC action: ${action}` });
          return true;
      }
    } catch (err: any) {
      console.error(`[api-router] Error processing action '${action}':`, err);
      sendJson(res, 500, { success: false, error: err.message || String(err) });
      return true;
    }
  }

  return false;
}
