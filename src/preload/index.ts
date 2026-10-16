/**
 * src/preload/index.ts
 *
 * Preload script – runs in a privileged Node.js context with
 * contextIsolation=true.  Exposes a narrow, typed API surface to the renderer
 * via contextBridge so no Node.js / Electron internals leak into the page.
 *
 * All six auth IPC channels are wrapped here.  The renderer (and the
 * chrome-shim polyfill) should use window.electronApi exclusively.
 */

import { contextBridge, ipcRenderer } from "electron";
import type {
  OrgProfile,
  SfSessionPayload,
  EnvType,
} from "../shared/types/org";

// ── Payload types mirrored from auth-handlers.ts ─────────────────────────────

export interface LoginOAuthPayload {
  loginUrl: string;
  alias: string;
  orgType: EnvType;
  color?: string;
  clientId?: string;
}

export interface LoginManualPayload {
  sfHost: string;
  sessionId: string;
  alias: string;
  orgType: EnvType;
  color?: string;
}

export interface GetSessionPayload {
  orgId?: string;
  sfHost?: string;
}

// ── Exposed API ───────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("electronApi", {
  /**
   * Open an OAuth 2.0 PKCE login window and connect a new org.
   * Returns the resulting OrgProfile on success.
   */
  loginWithOAuth: (payload: LoginOAuthPayload): Promise<OrgProfile> =>
    ipcRenderer.invoke("auth:login-oauth", payload),

  /**
   * Import an existing Salesforce session key without OAuth.
   * Returns the resulting OrgProfile on success.
   */
  loginWithManualSession: (payload: LoginManualPayload): Promise<OrgProfile> =>
    ipcRenderer.invoke("auth:login-manual", payload),

  /**
   * Retrieve the live session (key + hostname) for a given org.
   * Accepts `orgId` (preferred) or `sfHost` as lookup keys.
   * Returns SfSessionPayload | null.
   *
   * This is the method called by the chrome-shim's sendMessage('getSession')
   * handler, so its return shape MUST satisfy addon/inspector.js expectations:
   *   { key: string, hostname: string }
   */
  getSession: (payload: GetSessionPayload): Promise<SfSessionPayload | null> =>
    ipcRenderer.invoke("auth:get-session", payload),

  /**
   * Force-refresh the access token for an org using the stored refresh_token.
   * Returns the refreshed SfSessionPayload | null.
   */
  refreshSession: (payload: {
    orgId?: string;
    sfHost?: string;
  }): Promise<SfSessionPayload | null> =>
    ipcRenderer.invoke("auth:refresh-session", payload),

  /**
   * Validate session token validity against Salesforce APIs.
   * Auto-refreshes if expired.
   */
  validateSession: (payload: {
    orgId?: string;
    sfHost?: string;
  }): Promise<SfSessionPayload | null> =>
    ipcRenderer.invoke("auth:validate-session", payload),

  /**
   * List all connected orgs (no secrets – tokens are never included).
   */
  listOrgs: (): Promise<OrgProfile[]> =>
    ipcRenderer.invoke("auth:list-orgs"),

  /**
   * Remove an org and its encrypted tokens from the vault.
   * Returns true if the org was found and deleted, false otherwise.
   */
  removeOrg: (payload: { orgId: string }): Promise<boolean> =>
    ipcRenderer.invoke("auth:remove-org", payload),

  /**
   * Open an external link in the operating system's default browser.
   */
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("shell:open-external", url),

  /**
   * Open an authenticated Salesforce frontdoor session in the browser.
   */
  openOrgFrontdoor: (orgId: string, retUrl?: string): Promise<void> =>
    ipcRenderer.invoke("auth:open-org-frontdoor", { orgId, retUrl }),

  /**
   * Import Salesforce orgs authenticated via SFDX / Salesforce CLI (~/.sfdx).
   */
  importSfdxOrgs: (): Promise<OrgProfile[]> =>
    ipcRenderer.invoke("auth:import-sfdx-orgs"),

  /**
   * Perform an authenticated Salesforce REST request via Electron Main process.
   * Transparently injects the bearer token and handles session auto-refresh on 401.
   */
  sfRestRequest: (args: {
    sfHost: string;
    path: string;
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  }): Promise<any> => ipcRenderer.invoke("sf:rest-request", args),

  /**
   * Alias for loginWithManualSession
   */
  loginManual: (payload: LoginManualPayload): Promise<OrgProfile> =>
    ipcRenderer.invoke("auth:login-manual", payload),
});

// Also alias electronAPI (capitalized) for convenience
try {
  contextBridge.exposeInMainWorld("electronAPI", {
    sfRestRequest: (args: any) => ipcRenderer.invoke("sf:rest-request", args),
  });
} catch {}

