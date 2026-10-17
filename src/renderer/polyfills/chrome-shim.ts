/**
 * chrome-shim.ts
 *
 * Provides a minimal window.chrome polyfill so that addon/*.js files that
 * call chrome.runtime.*, chrome.storage.local.*, chrome.storage.sync.*, and
 * chrome.i18n.* continue to work inside the Electron renderer without modification.
 *
 * This file must be imported before any addon script is executed.
 */

import { normalizeSfHost } from "../utils/normalize-host";

function rewriteSfUrlToLocalProxy(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return urlStr;
  if (urlStr.startsWith("/sf-proxy/")) return urlStr;
  try {
    const parsed = new URL(urlStr, window.location.origin);
    const host = parsed.hostname.toLowerCase();
    const isSfDomain =
      host.endsWith(".salesforce.com") ||
      host.endsWith(".force.com") ||
      host.endsWith(".cloudforce.com") ||
      host.endsWith(".visualforce.com") ||
      parsed.pathname.startsWith("/services/");

    if (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      host !== window.location.hostname &&
      isSfDomain
    ) {
      return `${window.location.origin}/sf-proxy/${parsed.hostname}${parsed.pathname}${parsed.search}`;
    }
  } catch {}
  return urlStr;
}

if (typeof window !== "undefined" && !window.chrome?.runtime) {
  const getElectronApi = () => {
    if ((window as any).electronApi) return (window as any).electronApi;
    try {
      if (window.parent && (window.parent as any).electronApi) return (window.parent as any).electronApi;
    } catch {}
    try {
      if (window.top && (window.top as any).electronApi) return (window.top as any).electronApi;
    } catch {}
    return null;
  };

  const detectedApi = getElectronApi();
  if (detectedApi) {
    try {
      (window as any).electronApi = (window as any).electronApi || detectedApi;
      (window as any).electronAPI = (window as any).electronAPI || detectedApi;
    } catch {}
  }

  const urlParams = new URLSearchParams(window.location.search || "");
  const currentOrgId = urlParams.get("orgId") || "";
  const currentSfHost = normalizeSfHost(urlParams.get("host") || "");

  const messageListeners = new Set<(msg: any) => void>();

  // ── chrome.runtime ───────────────────────────────────────────────────────
  const runtime = {
    id: "salesforce-inspector-reloaded-desktop",
    lastError: undefined,

    getURL(path: string): string {
      const clean = (path || "").replace(/^\//, "");
      return `/addon/${clean}`;
    },

    getManifest(): any {
      return {
        name: "Salesforce Inspector Reloaded Desktop",
        version: "2.1.0",
        version_name: "2.1.0",
        manifest_version: 3,
      };
    },

    onMessage: {
      addListener: (fn: (msg: any) => void) => {
        if (typeof fn === "function") messageListeners.add(fn);
      },
      removeListener: (fn: (msg: any) => void) => {
        messageListeners.delete(fn);
      },
      hasListener: (fn: (msg: any) => void) => messageListeners.has(fn),
    },

    async sendMessage(
      msg: any,
      callback?: (response: any) => void,
    ): Promise<any> {
      let result: any;
      const electronApi = getElectronApi();

      if (msg?.message === "getSession") {
        const targetHost = normalizeSfHost(msg.sfHost || currentSfHost);
        if (electronApi?.getSession) {
          try {
            const session = await electronApi.getSession({
              orgId: currentOrgId,
              sfHost: targetHost,
            });
            if (session) {
              result = {
                key: session.key,
                hostname: normalizeSfHost(session.hostname || targetHost),
                orgId: session.orgId || currentOrgId,
              };
            } else {
              result = null;
            }
          } catch (err) {
            console.error("[chrome-shim] Error in getSession:", err);
            result = null;
          }
        } else {
          result = null;
        }
      } else if (msg?.message === "getSfHost" || msg?.msg === "getSfHost") {
        result = currentSfHost;
      } else {
        result = undefined;
      }

      if (typeof callback === "function") {
        try {
          callback(result);
        } catch (err) {
          console.error("[chrome-shim] Callback error in sendMessage:", err);
        }
      }

      return result;
    },
  };

  // ── chrome.tabs ───────────────────────────────────────────────────────────
  const tabs = {
    query(
      _queryInfo: any,
      callback?: (result: any[]) => void,
    ): Promise<any[]> {
      const tabList = [
        {
          id: 1,
          active: true,
          currentWindow: true,
          url: window.location.href,
          title: document.title,
        },
      ];
      if (typeof callback === "function") {
        callback(tabList);
      }
      return Promise.resolve(tabList);
    },

    create(
      createProperties: { url?: string },
      callback?: (tab: any) => void,
    ): Promise<any> {
      if (createProperties?.url) {
        window.open(createProperties.url, "_blank");
      }
      if (typeof callback === "function") {
        callback({});
      }
      return Promise.resolve({});
    },
  };

  // ── chrome.storage ────────────────────────────────────────────────────────
  const createStorageArea = (prefix = "") => ({
    get(
      keys: string | string[] | Record<string, any> | null,
      callback?: (items: Record<string, any>) => void,
    ): Promise<Record<string, any>> {
      const result: Record<string, any> = {};

      if (keys === null) {
        for (let i = 0; i < localStorage.length; i++) {
          const rawKey = localStorage.key(i);
          if (rawKey) {
            if (!prefix || rawKey.startsWith(prefix)) {
              const k = prefix ? rawKey.slice(prefix.length) : rawKey;
              const raw = localStorage.getItem(rawKey);
              try {
                result[k] = raw !== null ? JSON.parse(raw) : undefined;
              } catch {
                result[k] = raw;
              }
            }
          }
        }
      } else {
        const list = Array.isArray(keys)
          ? keys
          : typeof keys === "string"
          ? [keys]
          : Object.keys(keys || {});

        list.forEach((k) => {
          const storageKey = prefix ? `${prefix}${k}` : k;
          let raw = localStorage.getItem(storageKey);
          if (raw === null && prefix) {
            raw = localStorage.getItem(k);
          }
          if (raw !== null) {
            try {
              result[k] = JSON.parse(raw);
            } catch {
              result[k] = raw;
            }
          } else if (
            typeof keys === "object" &&
            !Array.isArray(keys) &&
            keys !== null &&
            k in keys
          ) {
            result[k] = (keys as any)[k];
          }
        });
      }

      callback?.(result);
      return Promise.resolve(result);
    },

    set(items: Record<string, any>, callback?: () => void): Promise<void> {
      if (items && typeof items === "object") {
        Object.entries(items).forEach(([key, value]) => {
          const val = typeof value === "string" ? value : JSON.stringify(value);
          localStorage.setItem(prefix ? `${prefix}${key}` : key, val);
          if (prefix) {
            localStorage.setItem(key, val);
          }
        });
      }
      callback?.();
      return Promise.resolve();
    },

    remove(keys: string | string[], callback?: () => void): Promise<void> {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((k) => {
        localStorage.removeItem(prefix ? `${prefix}${k}` : k);
        if (prefix) localStorage.removeItem(k);
      });
      callback?.();
      return Promise.resolve();
    },

    clear(callback?: () => void): Promise<void> {
      if (prefix) {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            localStorage.removeItem(k);
          }
        }
      } else {
        localStorage.clear();
      }
      callback?.();
      return Promise.resolve();
    },
  });

  const storage = {
    local: createStorageArea(""),
    sync: createStorageArea(""),
    onChanged: {
      addListener: () => {},
      removeListener: () => {},
      hasListener: () => false,
    },
  };

  // ── chrome.i18n ──────────────────────────────────────────────────────────
  const i18n = {
    getMessage(key: string): string {
      if (key === "@@extension_id") return "salesforce-inspector-reloaded";
      return key || "";
    },
  };

  // ── Attach to window ─────────────────────────────────────────────────────
  (window as any).chrome = {
    runtime,
    tabs,
    storage,
    i18n,
  };

  if (typeof (window as any).browser === "undefined") {
    (window as any).browser = (window as any).chrome;
  }

  // ── Layer 3: Self-Healing Reactive 401 & Token Refresh Interceptors ──────────
  let activeRefreshPromise: Promise<any> | null = null;

  async function performSessionRefresh(): Promise<any> {
    if (activeRefreshPromise) return activeRefreshPromise;

    activeRefreshPromise = (async () => {
      const electronApi = getElectronApi();
      if (!electronApi) {
        console.warn("[chrome-shim] Cannot refresh session: electronApi unavailable");
        return null;
      }

      try {
        let refreshed: any = null;
        if (typeof electronApi.refreshSession === "function") {
          refreshed = await electronApi.refreshSession({
            orgId: currentOrgId || undefined,
            sfHost: currentSfHost || undefined,
          });
        }
        if (!refreshed && typeof electronApi.getSession === "function") {
          refreshed = await electronApi.getSession({
            orgId: currentOrgId || undefined,
            sfHost: currentSfHost || undefined,
          });
        }

        if (refreshed && refreshed.key) {
          const newHost = normalizeSfHost(refreshed.hostname || currentSfHost);
          const newToken = refreshed.key;

          // 1. Update localStorage
          try {
            if (newHost) {
              localStorage.setItem(newHost + "_access_token", newToken);
            }
            if (currentSfHost && currentSfHost !== newHost) {
              localStorage.setItem(currentSfHost + "_access_token", newToken);
            }
          } catch {}

          // 2. Update window.sfConn if present
          try {
            if ((window as any).sfConn) {
              (window as any).sfConn.sessionId = newToken;
              if (newHost) (window as any).sfConn.instanceHostname = newHost;
            }
          } catch {}

          // 3. Dispatch tokenUpdated message locally and via chrome.runtime
          try {
            runtime.sendMessage({
              message: "tokenUpdated",
              sfHost: newHost || currentSfHost,
            });
          } catch {}

          for (const listener of messageListeners) {
            try {
              listener({
                message: "tokenUpdated",
                sfHost: newHost || currentSfHost,
              });
            } catch {}
          }

          // 4. Also postMessage to parent
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(
                {
                  type: "INSPECTOR_TOKEN_UPDATED",
                  orgId: currentOrgId,
                  sfHost: newHost || currentSfHost,
                  token: newToken,
                },
                "*"
              );
            }
          } catch {}

          return refreshed;
        }
      } catch (err) {
        console.error("[chrome-shim] Error during session refresh:", err);
      } finally {
        activeRefreshPromise = null;
      }
      return null;
    })();

    return activeRefreshPromise;
  }

  function installXhrInterceptor() {
    const RealXMLHttpRequest = window.XMLHttpRequest;
    if (!RealXMLHttpRequest || (RealXMLHttpRequest as any).__isShimmed) return;

    class ShimmedXMLHttpRequest extends EventTarget {
      private _real: XMLHttpRequest;
      private _retried = false;
      private _method = "GET";
      private _url = "";
      private _async = true;
      private _user?: string | null;
      private _password?: string | null;
      private _headers: Array<{ name: string; value: string }> = [];
      private _body: any = null;
      private _responseType: XMLHttpRequestResponseType = "";
      private _timeout = 0;
      private _withCredentials = false;
      private _customListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

      public onreadystatechange: ((this: XMLHttpRequest, ev: Event) => any) | null = null;
      public onload: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;
      public onerror: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;
      public onabort: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;
      public onloadstart: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;
      public onloadend: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;
      public onprogress: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;
      public ontimeout: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;

      constructor() {
        super();
        this._real = new RealXMLHttpRequest();
      }

      get readyState(): number {
        return this._real.readyState;
      }
      get status(): number {
        return this._real.status;
      }
      get statusText(): string {
        return this._real.statusText;
      }
      get response(): any {
        return this._real.response;
      }
      get responseURL(): string {
        return this._real.responseURL;
      }
      get responseXML(): Document | null {
        return this._real.responseXML;
      }
      get responseText(): string {
        try {
          return this._real.responseText;
        } catch {
          return "";
        }
      }
      get upload(): XMLHttpRequestUpload {
        return this._real.upload;
      }

      get responseType(): XMLHttpRequestResponseType {
        return this._responseType;
      }
      set responseType(val: XMLHttpRequestResponseType) {
        this._responseType = val;
        try {
          this._real.responseType = val;
        } catch {}
      }

      get timeout(): number {
        return this._timeout;
      }
      set timeout(val: number) {
        this._timeout = val;
        try {
          this._real.timeout = val;
        } catch {}
      }

      get withCredentials(): boolean {
        return this._withCredentials;
      }
      set withCredentials(val: boolean) {
        this._withCredentials = val;
        try {
          this._real.withCredentials = val;
        } catch {}
      }

      open(method: string, url: string | URL, async = true, user?: string | null, password?: string | null): void {
        const proxiedUrl = rewriteSfUrlToLocalProxy(url ? url.toString() : "");
        this._method = method;
        this._url = proxiedUrl;
        this._async = async;
        this._user = user;
        this._password = password;
        this._headers = [];
        return this._real.open(method, proxiedUrl, async, user, password);
      }

      setRequestHeader(name: string, value: string): void {
        this._headers.push({ name, value });
        return this._real.setRequestHeader(name, value);
      }

      getResponseHeader(name: string): string | null {
        return this._real.getResponseHeader(name);
      }

      getAllResponseHeaders(): string {
        return this._real.getAllResponseHeaders();
      }

      overrideMimeType(mime: string): void {
        return this._real.overrideMimeType(mime);
      }

      abort(): void {
        return this._real.abort();
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
        if (!this._customListeners.has(type)) {
          this._customListeners.set(type, new Set());
        }
        this._customListeners.get(type)!.add(listener);
        super.addEventListener(type, listener, options);
      }

      removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void {
        const set = this._customListeners.get(type);
        if (set) set.delete(listener);
        super.removeEventListener(type, listener, options);
      }

      private _dispatchEventToHandlers(type: string, event: Event): void {
        const handlerName = ("on" + type) as keyof ShimmedXMLHttpRequest;
        const handler = this[handlerName];
        if (typeof handler === "function") {
          try {
            (handler as Function).call(this, event);
          } catch (err) {
            console.error(`[chrome-shim] Error in ${handlerName}:`, err);
          }
        }
        try {
          this.dispatchEvent(event);
        } catch (err) {
          console.error(`[chrome-shim] Error dispatching ${type} event:`, err);
        }
      }

      send(body?: Document | XMLHttpRequestBodyInit | null): void {
        this._body = body;
        this._bindAndSend(this._real, body);
      }

      private _bindAndSend(targetXhr: XMLHttpRequest, body: any): void {
        const self = this;

        try {
          if (targetXhr.upload) {
            const forwardUpload = (e: ProgressEvent) => {
              if (self.upload) {
                const evt = new CustomEvent(e.type, { detail: e }) as any;
                evt.loaded = e.loaded;
                evt.total = e.total;
                evt.lengthComputable = e.lengthComputable;
                self.upload.dispatchEvent(evt);
              }
            };
            for (const ev of [
              "progress",
              "load",
              "error",
              "abort",
              "timeout",
              "loadstart",
              "loadend",
            ]) {
              targetXhr.upload.addEventListener(ev, forwardUpload as EventListener);
            }
          }
        } catch {}

        const forwardEvent = (e: Event) => {
          const evt = new Event(e.type);
          self._dispatchEventToHandlers(e.type, evt);
        };

        for (const ev of ["loadstart", "progress", "abort", "timeout"]) {
          targetXhr.addEventListener(ev, forwardEvent);
        }

        targetXhr.onreadystatechange = function () {
          if (targetXhr.readyState < 4) {
            const evt = new Event("readystatechange");
            self._dispatchEventToHandlers("readystatechange", evt);
            return;
          }

          // readyState === 4 (DONE)
          const status = targetXhr.status;
          let isSessionExpired = status === 401;

          if (!isSessionExpired && status >= 400 && status < 600) {
            try {
              if (
                targetXhr.responseType === "" ||
                targetXhr.responseType === "text"
              ) {
                const respText = targetXhr.responseText || "";
                if (
                  respText.includes("INVALID_SESSION_ID") ||
                  respText.includes("Session expired or invalid")
                ) {
                  isSessionExpired = true;
                }
              } else if (
                targetXhr.responseType === "json" &&
                targetXhr.response
              ) {
                const respStr = JSON.stringify(targetXhr.response);
                if (
                  respStr.includes("INVALID_SESSION_ID") ||
                  respStr.includes("Session expired or invalid")
                ) {
                  isSessionExpired = true;
                }
              }
            } catch {}
          }

          if (isSessionExpired && !self._retried && self._async) {
            self._retried = true;
            console.warn(
              "[chrome-shim] 401/INVALID_SESSION_ID detected in XHR, auto-refreshing session..."
            );

            performSessionRefresh()
              .then((refreshed) => {
                if (refreshed && refreshed.key) {
                  console.log(
                    "[chrome-shim] Session refreshed successfully, retrying XHR request..."
                  );
                  const replay = new RealXMLHttpRequest();
                  self._real = replay;

                  if (self._responseType) {
                    try {
                      replay.responseType = self._responseType;
                    } catch {}
                  }
                  if (self._timeout) {
                    try {
                      replay.timeout = self._timeout;
                    } catch {}
                  }
                  if (self._withCredentials) {
                    try {
                      replay.withCredentials = self._withCredentials;
                    } catch {}
                  }

                  replay.open(
                    self._method,
                    self._url,
                    self._async,
                    self._user,
                    self._password
                  );

                  const newToken = refreshed.key;
                  for (const h of self._headers) {
                    const lower = h.name.toLowerCase();
                    if (lower === "authorization") {
                      replay.setRequestHeader(h.name, "Bearer " + newToken);
                    } else if (lower === "x-sfdc-session") {
                      replay.setRequestHeader(h.name, newToken);
                    } else {
                      replay.setRequestHeader(h.name, h.value);
                    }
                  }

                  let replayBody = self._body;
                  if (
                    typeof replayBody === "string" &&
                    replayBody.includes("<sessionId>")
                  ) {
                    replayBody = replayBody.replace(
                      /<sessionId>[^<]*<\/sessionId>/g,
                      `<sessionId>${newToken}</sessionId>`
                    );
                  }

                  self._bindAndSend(replay, replayBody);
                } else {
                  forwardTerminalEvents();
                }
              })
              .catch((err) => {
                console.error("[chrome-shim] XHR retry error:", err);
                forwardTerminalEvents();
              });
            return;
          }

          forwardTerminalEvents();

          function forwardTerminalEvents() {
            const readyEvt = new Event("readystatechange");
            self._dispatchEventToHandlers("readystatechange", readyEvt);

            if (targetXhr.status >= 200 && targetXhr.status < 400) {
              const loadEvt = new Event("load");
              self._dispatchEventToHandlers("load", loadEvt);
            } else {
              const errorEvt = new Event("error");
              self._dispatchEventToHandlers("error", errorEvt);
            }

            const loadEndEvt = new Event("loadend");
            self._dispatchEventToHandlers("loadend", loadEndEvt);
          }
        };

        try {
          targetXhr.send(body);
        } catch (err) {
          throw err;
        }
      }
    }

    (ShimmedXMLHttpRequest as any).UNSENT = 0;
    (ShimmedXMLHttpRequest as any).OPENED = 1;
    (ShimmedXMLHttpRequest as any).HEADERS_RECEIVED = 2;
    (ShimmedXMLHttpRequest as any).LOADING = 3;
    (ShimmedXMLHttpRequest as any).DONE = 4;
    (ShimmedXMLHttpRequest as any).__isShimmed = true;

    (window as any).XMLHttpRequest = ShimmedXMLHttpRequest;
  }

  function installFetchInterceptor() {
    const origFetch = window.fetch;
    if (!origFetch || (origFetch as any).__isShimmed) return;

    const shimmedFetch = async function (
      this: any,
      resource: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const proxiedResource: RequestInfo | URL =
        typeof resource === "string"
          ? rewriteSfUrlToLocalProxy(resource)
          : resource instanceof URL
          ? rewriteSfUrlToLocalProxy(resource.toString())
          : resource;

      let response = await origFetch.call(this, proxiedResource, init);
      if (response.status === 401) {
        console.warn("[chrome-shim] fetch returned 401, auto-refreshing session...");
        const refreshed = await performSessionRefresh();
        if (refreshed && refreshed.key) {
          const newToken = refreshed.key;
          const newInit = init ? { ...init } : {};
          const newHeaders: Record<string, string> = {};

          if (newInit.headers) {
            if (typeof (newInit.headers as any).forEach === "function") {
              (newInit.headers as any).forEach((val: string, key: string) => {
                newHeaders[key] = val;
              });
            } else if (Array.isArray(newInit.headers)) {
              for (const [k, v] of newInit.headers) {
                newHeaders[k] = v;
              }
            } else {
              Object.assign(newHeaders, newInit.headers);
            }
          }

          let hasAuth = false;
          for (const k of Object.keys(newHeaders)) {
            if (k.toLowerCase() === "authorization") {
              newHeaders[k] = "Bearer " + newToken;
              hasAuth = true;
            } else if (k.toLowerCase() === "x-sfdc-session") {
              newHeaders[k] = newToken;
              hasAuth = true;
            }
          }
          if (!hasAuth && resource && resource.toString().includes("/services/")) {
            newHeaders["Authorization"] = "Bearer " + newToken;
          }

          newInit.headers = newHeaders;
          return origFetch.call(this, proxiedResource, newInit);
        }
      }
      return response;
    };

    (shimmedFetch as any).__isShimmed = true;
    window.fetch = shimmedFetch;
  }

  installXhrInterceptor();
  installFetchInterceptor();
}
