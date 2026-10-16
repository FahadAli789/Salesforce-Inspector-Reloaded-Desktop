export interface SObjectDescribeItem {
  name: string;          // e.g. "Account" or "Custom_Obj__c"
  label: string;         // e.g. "Account"
  labelPlural: string;   // e.g. "Accounts"
  keyPrefix: string | null; // e.g. "001", "a0B"
  custom: boolean;
  queryable: boolean;
  retrieveable: boolean;
  urls?: Record<string, string>;
}

export interface ResolvedRecordId {
  rawInput: string;
  id15: string;
  id18: string;
  keyPrefix: string;
  matchedObjects: SObjectDescribeItem[];
}

// Strict 15 or 18 char Salesforce ID regex
const SF_ID_REGEX = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;

// Extract a 15/18-char ID even if the user pastes a full Lightning/Classic URL
const URL_ID_EXTRACT_REGEX = /(?:\/|^)([a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?)(?:\/|\?|$)/;

/**
 * Converts a 15-character case-sensitive Salesforce ID to an 18-character case-safe ID.
 */
export function to18CharId(id: string): string {
  const clean = id.trim();
  if (clean.length === 18) return clean;
  if (clean.length !== 15) return clean;

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
  let suffix = "";
  for (let block = 0; block < 3; block++) {
    let flags = 0;
    for (let bit = 0; bit < 5; bit++) {
      const c = clean.charAt(block * 5 + bit);
      if (c >= "A" && c <= "Z") {
        flags += 1 << bit;
      }
    }
    suffix += chars.charAt(flags);
  }
  return clean + suffix;
}

/**
 * Detects if the search query is a 15 or 18 character Salesforce ID (or URL containing one)
 * and maps its first 3 characters (keyPrefix) against the Global Describe prefix map.
 */
export function resolveSalesforceId(
  input: string,
  prefixMap: Map<string, SObjectDescribeItem[]>
): ResolvedRecordId | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidateId: string | null = null;

  if (SF_ID_REGEX.test(trimmed)) {
    candidateId = trimmed;
  } else if (trimmed.includes("/") || trimmed.startsWith("http")) {
    const match = trimmed.match(URL_ID_EXTRACT_REGEX);
    if (match && match[1]) {
      candidateId = match[1];
    }
  }

  if (!candidateId) return null;

  const keyPrefix = candidateId.substring(0, 3);
  const id15 = candidateId.substring(0, 15);
  const id18 = candidateId.length === 18 ? candidateId : to18CharId(id15);

  // Case-sensitive lookup first (Salesforce keyPrefixes are case-sensitive: e.g. a0A vs a0a)
  let matchedObjects = prefixMap.get(keyPrefix) || [];

  // Fallback case-insensitive check if user typed lowercase ID
  if (matchedObjects.length === 0) {
    for (const [prefix, objs] of prefixMap.entries()) {
      if (prefix.toLowerCase() === keyPrefix.toLowerCase()) {
        matchedObjects = objs;
        break;
      }
    }
  }

  // Only classify a random 15-char word as a Salesforce ID if it either:
  // 1. Matches a known keyPrefix in Global Describe, OR
  // 2. Contains at least one digit (all real Salesforce IDs contain digits, e.g., '001...').
  if (matchedObjects.length === 0 && !/\d/.test(candidateId)) {
    return null;
  }

  return {
    rawInput: trimmed,
    id15,
    id18,
    keyPrefix,
    matchedObjects,
  };
}

/**
 * Builds an O(1) map of keyPrefix -> SObjectDescribeItem[] from Global Describe
 */
export function buildKeyPrefixMap(
  sobjects: SObjectDescribeItem[]
): Map<string, SObjectDescribeItem[]> {
  const map = new Map<string, SObjectDescribeItem[]>();
  for (const obj of sobjects) {
    if (obj.keyPrefix) {
      const existing = map.get(obj.keyPrefix) || [];
      existing.push(obj);
      map.set(obj.keyPrefix, existing);
    }
  }
  return map;
}
