/**
 * chrome-shim.ts
 *
 * Provides a minimal window.chrome polyfill so that addon/*.js files that
 * call chrome.runtime.*, chrome.storage.local.*, and chrome.i18n.* continue
 * to work inside the Electron renderer without modification.
 *
 * This file must be imported before any addon script is executed.
 */

// Only install the shim when the real extension runtime is absent (i.e. when
// running inside Electron rather than as an actual browser extension).
if (typeof window !== "undefined" && !window.chrome?.runtime) {
  // ── Type augmentation ────────────────────────────────────────────────────
  // We attach a plain object so TypeScript won't complain about unknown props.
  const chrome = {} as typeof window.chrome;

  // ── chrome.runtime ───────────────────────────────────────────────────────
  const runtime: typeof chrome.runtime = {
    /**
     * Maps extension-internal paths to renderer-accessible URLs.
     * In the Electron app, the addon/ directory is served at /addon/.
     */
    getURL(path: string): string {
      const clean = path.replace(/^\//, "");
      return `/addon/${clean}`;
    },

    /**
     * Emulates chrome.runtime.sendMessage.
     * Currently handles the 'getSession' message by delegating to the
     * contextBridge-exposed electronApi.
     */
    async sendMessage(
      msg: any,
      callback?: (response: any) => void,
    ): Promise<any> {
      let result: any;

      if (msg?.message === "getSession") {
        // Delegate to the IPC bridge exposed by the preload script.
        // The bridge returns SfSessionPayload { key, hostname, orgId } which
        // matches the shape addon/inspector.js expects: { key, hostname }.
        result = await (window as any).electronApi?.getSession({
          sfHost: msg.sfHost,
        });
      } else {
        // Unknown message – return undefined so callers can handle gracefully
        result = undefined;
      }

      if (typeof callback === "function") {
        callback(result);
      }

      return result;
    },

    // Stub out the remaining fields that addon code may reference
    id: "electron-app",
    lastError: undefined,
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
      hasListener: () => false,
    } as any,
  } as typeof chrome.runtime;

  // ── chrome.storage.local ─────────────────────────────────────────────────
  const STORAGE_PREFIX = "__chrome_storage__";

  const storageLocal = {
    get(
      keys: string | string[] | Record<string, any> | null,
      callback: (items: Record<string, any>) => void,
    ): void {
      const result: Record<string, any> = {};

      const resolve = (key: string, defaultVal?: any) => {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
        result[key] = raw !== null ? JSON.parse(raw) : defaultVal;
      };

      if (keys === null) {
        // Return everything stored under our prefix
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(STORAGE_PREFIX)) {
            const key = k.slice(STORAGE_PREFIX.length);
            resolve(key);
          }
        }
      } else if (typeof keys === "string") {
        resolve(keys);
      } else if (Array.isArray(keys)) {
        keys.forEach((k) => resolve(k));
      } else if (typeof keys === "object") {
        Object.entries(keys).forEach(([k, defaultVal]) => resolve(k, defaultVal));
      }

      callback(result);
    },

    set(items: Record<string, any>, callback?: () => void): void {
      Object.entries(items).forEach(([key, value]) => {
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
      });
      callback?.();
    },
  };

  // ── chrome.i18n ──────────────────────────────────────────────────────────
  const i18n = {
    /**
     * Returns the key itself as a fallback.  A proper implementation could
     * load _locales/en/messages.json via fetch in a later step.
     */
    getMessage(key: string): string {
      return key;
    },
  };

  // ── Attach to window ─────────────────────────────────────────────────────
  (window as any).chrome = {
    runtime,
    storage: { local: storageLocal },
    i18n,
  };
}
