/**
 * src/main/auth/session-vault.ts
 *
 * Encrypted on-disk session vault.
 *
 * Tokens are encrypted with Electron's safeStorage (OS keychain / libsecret /
 * kwallet) before being written to disk. The file at `org-vault.json` only ever
 * contains cipher-text for the token fields; profiles are stored in plaintext
 * because they contain no secrets.
 *
 * File format (org-vault.json):
 * {
 *   "records": VaultRecord[]
 * }
 */

import { app, safeStorage } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { OrgProfile, VaultRecord, SfSessionPayload } from "../../shared/types/org";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalises a Salesforce instance URL or host into a clean domain name without
 * protocol (https://), paths, or query params.
 * e.g. "https://my-org.sandbox.my.salesforce.com/" -> "my-org.sandbox.my.salesforce.com"
 */
export function normalizeSfHost(urlOrHost: string): string {
  if (!urlOrHost || typeof urlOrHost !== "string") return "";
  try {
    const withProtocol = urlOrHost.startsWith("http")
      ? urlOrHost
      : `https://${urlOrHost}`;
    return new URL(withProtocol).hostname;
  } catch {
    return urlOrHost.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
  }
}

function vaultPath(): string {
  return path.join(app.getPath("userData"), "org-vault.json");
}

interface VaultFile {
  records: VaultRecord[];
}

function readVault(): VaultFile {
  const p = vaultPath();
  if (!fs.existsSync(p)) {
    return { records: [] };
  }
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as VaultFile;
  } catch {
    // Corrupted file – start fresh rather than crash
    return { records: [] };
  }
}

function writeVault(vault: VaultFile): void {
  const p = vaultPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(vault, null, 2), "utf-8");
}

function encrypt(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: base64-encode so we never store raw tokens in plain text,
    // but warn loudly in the logs.
    console.warn(
      "[session-vault] safeStorage encryption unavailable – falling back to base64."
    );
    return Buffer.from(plaintext).toString("base64");
  }
  return safeStorage.encryptString(plaintext).toString("base64");
}

function decrypt(cipherBase64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(cipherBase64, "base64").toString("utf-8");
  }
  const buf = Buffer.from(cipherBase64, "base64");
  return safeStorage.decryptString(buf);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Persist (or overwrite) a full org session including encrypted tokens.
 */
export function saveOrgSession(
  profile: OrgProfile,
  accessToken: string,
  refreshToken: string
): void {
  const vault = readVault();
  const normalizedHost = normalizeSfHost(profile.sfHost);

  const record: VaultRecord = {
    ...profile,
    sfHost: normalizedHost,
    encryptedAccessToken: encrypt(accessToken),
    encryptedRefreshToken: encrypt(refreshToken),
    lastRefreshed: new Date().toISOString(),
  };

  const idx = vault.records.findIndex((r) => r.orgId === profile.orgId);
  if (idx >= 0) {
    vault.records[idx] = record;
  } else {
    vault.records.push(record);
  }

  writeVault(vault);
}

/**
 * Retrieve the decrypted session payload for a given org, or `null` if not found.
 */
export function getOrgSession(orgId: string): SfSessionPayload | null {
  const vault = readVault();
  const record = vault.records.find((r) => r.orgId === orgId);
  if (!record) return null;

  return {
    key: decrypt(record.encryptedAccessToken),
    hostname: normalizeSfHost(record.sfHost),
    orgId: record.orgId,
  };
}

/**
 * Look up a session by Salesforce instance hostname (e.g. "myinstance.salesforce.com").
 * Falls back gracefully if multiple orgs share a host by returning the most-recently
 * refreshed one.
 */
export function getOrgSessionByHost(sfHost: string): SfSessionPayload | null {
  const vault = readVault();
  const targetHost = normalizeSfHost(sfHost);
  const matches = vault.records.filter((r) => normalizeSfHost(r.sfHost) === targetHost);
  if (matches.length === 0) return null;

  // Prefer the most recently refreshed record
  matches.sort(
    (a, b) =>
      new Date(b.lastRefreshed).getTime() - new Date(a.lastRefreshed).getTime()
  );

  const record = matches[0];
  return {
    key: decrypt(record.encryptedAccessToken),
    hostname: normalizeSfHost(record.sfHost),
    orgId: record.orgId,
  };
}

/**
 * Return all stored org profiles (no secrets – tokens are NOT included).
 */
export function listOrgProfiles(): OrgProfile[] {
  const vault = readVault();
  return vault.records.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ encryptedAccessToken, encryptedRefreshToken, lastRefreshed, ...profile }) => ({
      ...profile,
      sfHost: normalizeSfHost(profile.sfHost),
    })
  );
}

/**
 * Delete a stored org and its tokens.
 */
export function removeOrg(orgId: string): boolean {
  const vault = readVault();
  const before = vault.records.length;
  vault.records = vault.records.filter((r) => r.orgId !== orgId);
  if (vault.records.length === before) return false;
  writeVault(vault);
  return true;
}

/**
 * Read the encrypted refresh token for an org (used internally by oauth-service).
 */
export function getRefreshToken(orgId: string): string | null {
  const vault = readVault();
  const record = vault.records.find((r) => r.orgId === orgId);
  if (!record) return null;
  return decrypt(record.encryptedRefreshToken);
}

/**
 * Read the decrypted access token for an org.
 */
export function getDecryptedAccessToken(orgId: string): string | null {
  const vault = readVault();
  const record = vault.records.find((r) => r.orgId === orgId);
  if (!record) return null;
  return decrypt(record.encryptedAccessToken);
}

/**
 * Read the stored OrgProfile (with vault metadata) for a given org ID.
 */
export function getVaultRecord(orgId: string): VaultRecord | null {
  const vault = readVault();
  const record = vault.records.find((r) => r.orgId === orgId);
  if (!record) return null;
  return {
    ...record,
    sfHost: normalizeSfHost(record.sfHost),
  };
}
