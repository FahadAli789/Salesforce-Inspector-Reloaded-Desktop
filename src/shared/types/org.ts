/**
 * shared/types/org.ts
 *
 * Type definitions shared between the Electron main process and the renderer.
 * Keep this file free of Node.js / DOM imports so it can be imported anywhere.
 */

// ── Environment classification ───────────────────────────────────────────────

export type EnvType = "DEV" | "UAT" | "SIT" | "PROD" | "SANDBOX";

// ── Org profile (stored in the vault, safe to send to renderer) ─────────────

export interface OrgProfile {
  /** 18-character Salesforce Org ID */
  orgId: string;
  /** Human-readable label (e.g. "My Dev Org") */
  alias: string;
  /** e.g. "myinstance.salesforce.com" – no protocol */
  sfHost: string;
  /** OAuth / login URL used to obtain tokens, e.g. "https://login.salesforce.com" */
  loginUrl: string;
  /** Salesforce username, populated after a successful OAuth flow */
  username?: string;
  /** Organisational environment classification */
  orgType: EnvType;
  /** Hex colour string used to visually tag this org in the UI, e.g. "#3B82F6" */
  color: string;
  /** Whether a valid (possibly refreshed) access token is currently held */
  isConnected: boolean;
}

// ── Vault record (superset of OrgProfile, NEVER leaves main process) ────────

export interface VaultRecord extends OrgProfile {
  /** safeStorage-encrypted access token (base64 string) */
  encryptedAccessToken: string;
  /** safeStorage-encrypted refresh token (base64 string) */
  encryptedRefreshToken: string;
  /** ISO timestamp of when the token was last refreshed */
  lastRefreshed: string;
}

// ── Session payload returned to the renderer ─────────────────────────────────
//
// Shape required by legacy addon/inspector.js:
//   { key: string, hostname: string }
// We add orgId so callers can identify which org the session belongs to.

export interface SfSessionPayload {
  /** Salesforce session / access token */
  key: string;
  /** Salesforce instance hostname, e.g. "myinstance.salesforce.com" */
  hostname: string;
  /** 18-character Org ID */
  orgId: string;
  /** API version string, e.g. "v62.0" (optional) */
  apiVersion?: string;
}
