import {
  SObjectDescribeItem,
  buildKeyPrefixMap,
} from "../utils/sfIdResolver";
import { normalizeSfHost } from "../utils/normalize-host";

interface GlobalDescribeCacheEntry {
  timestamp: number;
  sobjects: SObjectDescribeItem[];
}

const MEMORY_CACHE = new Map<string, GlobalDescribeCacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchGlobalDescribe(
  sfHost: string,
  forceRefresh = false
): Promise<{
  sobjects: SObjectDescribeItem[];
  prefixMap: Map<string, SObjectDescribeItem[]>;
}> {
  const cleanHost = normalizeSfHost(sfHost);
  const cacheKey = `sf_global_describe_v60_${cleanHost}`;

  // 1. Check in-memory cache
  if (!forceRefresh && MEMORY_CACHE.has(cleanHost)) {
    const entry = MEMORY_CACHE.get(cleanHost)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return {
        sobjects: entry.sobjects,
        prefixMap: buildKeyPrefixMap(entry.sobjects),
      };
    }
  }

  // 2. Check localStorage
  if (!forceRefresh) {
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const parsed: GlobalDescribeCacheEntry = JSON.parse(stored);
        if (
          parsed &&
          Array.isArray(parsed.sobjects) &&
          Date.now() - parsed.timestamp < CACHE_TTL_MS
        ) {
          MEMORY_CACHE.set(cleanHost, parsed);
          return {
            sobjects: parsed.sobjects,
            prefixMap: buildKeyPrefixMap(parsed.sobjects),
          };
        }
      }
    } catch {
      /* ignore cache read error */
    }
  }

  // 3. Fetch from Salesforce via Electron Main Process
  const electronApi =
    (window as any).electronApi || (window as any).electronAPI;
  if (!electronApi?.sfRestRequest) {
    throw new Error("electronApi.sfRestRequest is not available");
  }

  const response = await electronApi.sfRestRequest({
    sfHost: cleanHost,
    path: "/services/data/v60.0/sobjects/",
    method: "GET",
  });

  const sobjects: SObjectDescribeItem[] = (response?.sobjects || []).map(
    (item: any) => ({
      name: item.name,
      label: item.label,
      labelPlural: item.labelPlural,
      keyPrefix: item.keyPrefix || null,
      custom: Boolean(item.custom),
      queryable: Boolean(item.queryable),
      retrieveable: Boolean(item.retrieveable),
      urls: item.urls,
    })
  );

  const entry: GlobalDescribeCacheEntry = {
    timestamp: Date.now(),
    sobjects,
  };

  MEMORY_CACHE.set(cleanHost, entry);

  try {
    localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch {
    /* ignore storage quota errors */
  }

  return {
    sobjects,
    prefixMap: buildKeyPrefixMap(sobjects),
  };
}
