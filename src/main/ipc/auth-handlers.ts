/**
 * src/main/ipc/auth-handlers.ts
 *
 * Registers all IPC handlers for the authentication subsystem.
 *
 * Channel catalogue:
 *   auth:login-oauth       – Full OAuth 2.0 PKCE login (opens modal window)
 *   auth:login-manual      – Import an existing Salesforce session key
 *   auth:get-session       – Look up a live session by orgId or sfHost
 *   auth:refresh-session   – Force-refresh the access token via refresh_token
 *   auth:list-orgs         – Return all stored OrgProfile records (no secrets)
 *   auth:remove-org        – Delete an org and its tokens from the vault
 *   auth:open-org-frontdoor – Open authenticated Salesforce frontdoor in browser
 */

import { ipcMain, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  loginWithOAuth,
  loginWithManualSession,
  refreshAccessToken,
  type LoginWithOAuthOptions,
  type ManualSessionOptions,
} from "../auth/oauth-service";
import {
  getOrgSession,
  getOrgSessionByHost,
  getDecryptedAccessToken,
  getVaultRecord,
  normalizeSfHost,
  listOrgProfiles,
  removeOrg,
  saveOrgSession,
} from "../auth/session-vault";
import type { SfSessionPayload, OrgProfile } from "../../shared/types/org";

// ── IPC payload types (inbound from renderer) ────────────────────────────────

interface GetSessionPayload {
  orgId?: string;
  sfHost?: string;
}

// ── Handler registration ─────────────────────────────────────────────────────

export function registerAuthHandlers(): void {
  // ── auth:login-oauth ───────────────────────────────────────────────────────
  ipcMain.handle(
    "auth:login-oauth",
    async (_event, opts: LoginWithOAuthOptions) => {
      const result = await loginWithOAuth(opts);
      return result.profile satisfies OrgProfile;
    }
  );

  // ── auth:login-manual ──────────────────────────────────────────────────────
  ipcMain.handle(
    "auth:login-manual",
    async (_event, opts: ManualSessionOptions) => {
      const result = await loginWithManualSession(opts);
      return result.profile satisfies OrgProfile;
    }
  );

  // ── auth:get-session ───────────────────────────────────────────────────────
  // Accepts { orgId?, sfHost? }. Looks up by orgId first; falls back to normalized sfHost.
  // ALWAYS returns { key: sessionId, hostname: normalizeSfHost(hostname) }.
  ipcMain.handle(
    "auth:get-session",
    async (_event, payload: GetSessionPayload): Promise<SfSessionPayload | null> => {
      let session: SfSessionPayload | null = null;
      if (payload.orgId) {
        session = getOrgSession(payload.orgId);
      }
      if (!session && payload.sfHost) {
        session = getOrgSessionByHost(normalizeSfHost(payload.sfHost));
      }
      if (session) {
        return {
          ...session,
          hostname: normalizeSfHost(session.hostname),
        };
      }
      return null;
    }
  );

  // ── auth:refresh-session ───────────────────────────────────────────────────
  ipcMain.handle(
    "auth:refresh-session",
    async (_event, { orgId }: { orgId: string }): Promise<SfSessionPayload | null> => {
      await refreshAccessToken(orgId);
      // Return the fresh session payload
      return getOrgSession(orgId);
    }
  );

  // ── auth:list-orgs ─────────────────────────────────────────────────────────
  ipcMain.handle("auth:list-orgs", async (): Promise<OrgProfile[]> => {
    return listOrgProfiles();
  });

  // ── auth:remove-org ────────────────────────────────────────────────────────
  ipcMain.handle(
    "auth:remove-org",
    async (_event, { orgId }: { orgId: string }): Promise<boolean> => {
      return removeOrg(orgId);
    }
  );

  // ── auth:open-org-frontdoor ────────────────────────────────────────────────
  ipcMain.handle(
    "auth:open-org-frontdoor",
    async (
      _event,
      { orgId, retUrl }: { orgId: string; retUrl?: string }
    ): Promise<void> => {
      const record = getVaultRecord(orgId);
      if (!record) {
        throw new Error(`Org not found in vault: ${orgId}`);
      }
      const accessToken = getDecryptedAccessToken(orgId);
      if (!accessToken) {
        throw new Error(`No access token found for org: ${orgId}`);
      }
      const sfHost = normalizeSfHost(record.sfHost);
      const targetRetUrl = retUrl || "/lightning/page/home";
      const frontdoorUrl = `https://${sfHost}/secur/frontdoor.jsp?sid=${encodeURIComponent(
        accessToken
      )}&retURL=${encodeURIComponent(targetRetUrl)}`;
      await shell.openExternal(frontdoorUrl);
    }
  );

  // ── shell:open-external ────────────────────────────────────────────────────
  ipcMain.handle(
    "shell:open-external",
    async (_event, url: string): Promise<void> => {
      if (
        url &&
        (url.startsWith("https://") ||
          url.startsWith("http://") ||
          url.startsWith("mailto:"))
      ) {
        await shell.openExternal(url);
      }
    }
  );

  // ── auth:import-sfdx-orgs ──────────────────────────────────────────────────
  ipcMain.handle("auth:import-sfdx-orgs", async (): Promise<OrgProfile[]> => {
    const sfdxDir = path.join(os.homedir(), ".sfdx");
    if (!fs.existsSync(sfdxDir)) {
      return listOrgProfiles();
    }

    // Read alias.json if exists
    let aliasMap: Record<string, string> = {};
    const aliasPath = path.join(sfdxDir, "alias.json");
    if (fs.existsSync(aliasPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(aliasPath, "utf-8"));
        if (raw.orgs && typeof raw.orgs === "object") {
          // aliasMap: username -> alias
          for (const [alias, username] of Object.entries(raw.orgs)) {
            if (typeof username === "string") {
              aliasMap[username] = alias;
            }
          }
        }
      } catch {
        /* ignore */
      }
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
  });
}
