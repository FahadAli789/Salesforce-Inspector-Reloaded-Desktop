/**
 * chrome-shim.js
 *
 * Provides a window.chrome polyfill for legacy Salesforce Inspector Reloaded
 * pages running inside Electron iframes and windows.
 *
 * This file must execute inside addon/popup.html BEFORE popup.js or inspector.js.
 */
(function () {
  if (typeof window === "undefined") return;

  // Defensive guard for document.location.ancestorOrigins when opened outside standard extension iframe
  try {
    if (
      window.document &&
      window.document.location &&
      (!window.document.location.ancestorOrigins ||
        window.document.location.ancestorOrigins.length === 0)
    ) {
      Object.defineProperty(window.document.location, "ancestorOrigins", {
        value: [window.location.origin || "http://localhost"],
        configurable: true,
        enumerable: true,
      });
    }
  } catch (e) {
    // Ignore if browser restricts overriding ancestorOrigins
  }

  function normalizeSfHost(inputUrlOrHost) {
    if (!inputUrlOrHost || typeof inputUrlOrHost !== "string") return "";
    try {
      const withProtocol = inputUrlOrHost.startsWith("http")
        ? inputUrlOrHost
        : `https://${inputUrlOrHost}`;
      return new URL(withProtocol).hostname;
    } catch {
      return inputUrlOrHost
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .trim();
    }
  }

  function rewriteSfUrlToLocalProxy(urlStr) {
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
    } catch (e) {}
    return urlStr;
  }

  function getElectronApi() {
    if (window.electronApi) return window.electronApi;
    try {
      if (window.parent && window.parent.electronApi) return window.parent.electronApi;
    } catch (e) {}
    try {
      if (window.top && window.top.electronApi) return window.top.electronApi;
    } catch (e) {}
    return null;
  }

  const _detectedApi = getElectronApi();
  if (_detectedApi) {
    try {
      window.electronApi = window.electronApi || _detectedApi;
      window.electronAPI = window.electronAPI || _detectedApi;
    } catch (e) {}
  }

  const urlParams = new URLSearchParams(window.location.search || "");
  const currentOrgId = urlParams.get("orgId") || "";
  const currentSfHost = normalizeSfHost(urlParams.get("host") || "");

  const messageListeners = new Set();

  // ── chrome.runtime ────────────────────────────────────────────────────────
  const runtime = {
    id: "salesforce-inspector-reloaded-desktop",
    lastError: undefined,
    getURL(path) {
      const clean = (path || "").replace(/^\//, "");
      return `/addon/${clean}`;
    },
    getManifest() {
      return {
        name: "Salesforce Inspector Reloaded Desktop",
        version: "2.1.0",
        version_name: "2.1.0",
        manifest_version: 3,
      };
    },
    onMessage: {
      addListener(fn) {
        if (typeof fn === "function") messageListeners.add(fn);
      },
      removeListener(fn) {
        messageListeners.delete(fn);
      },
      hasListener(fn) {
        return messageListeners.has(fn);
      },
    },
    async sendMessage(msg, callback) {
      let result;
      const electronApi = getElectronApi();

      if (msg && msg.message === "getSession") {
        const targetHost = normalizeSfHost(msg.sfHost || currentSfHost);
        if (electronApi && typeof electronApi.getSession === "function") {
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
            console.error("[chrome-shim] Error getting session:", err);
            result = null;
          }
        } else {
          result = null;
        }
      } else if (
        msg &&
        (msg.message === "getSfHost" || msg.msg === "getSfHost")
      ) {
        result = currentSfHost;
      } else if (msg && msg.message === "createWindow" && msg.url) {
        if (msg.incognito && electronApi && typeof electronApi.openIncognito === "function") {
          await electronApi.openIncognito(msg.url, "incognito");
        } else if (electronApi && typeof electronApi.openExternal === "function") {
          await electronApi.openExternal(msg.url);
        } else {
          window.open(msg.url, "_blank", "noopener,noreferrer");
        }
        result = { created: true };
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
    query(queryInfo, callback) {
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
    create(createProperties, callback) {
      if (createProperties && createProperties.url) {
        window.open(createProperties.url, "_blank");
      }
      if (typeof callback === "function") {
        callback({});
      }
      return Promise.resolve({});
    },
  };

  // ── chrome.storage ────────────────────────────────────────────────────────
  function createStorageArea(prefix) {
    return {
      get(keys, callback) {
        const res = {};
        if (keys === null) {
          for (let i = 0; i < localStorage.length; i++) {
            const rawKey = localStorage.key(i);
            if (rawKey) {
              if (!prefix || rawKey.startsWith(prefix)) {
                const k = prefix ? rawKey.slice(prefix.length) : rawKey;
                const raw = localStorage.getItem(rawKey);
                try {
                  res[k] = JSON.parse(raw);
                } catch {
                  res[k] = raw;
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
                res[k] = JSON.parse(raw);
              } catch {
                res[k] = raw;
              }
            } else if (
              typeof keys === "object" &&
              !Array.isArray(keys) &&
              keys !== null &&
              k in keys
            ) {
              res[k] = keys[k];
            }
          });
        }

        if (typeof callback === "function") {
          callback(res);
        }
        return Promise.resolve(res);
      },
      set(items, callback) {
        if (items && typeof items === "object") {
          Object.entries(items).forEach(([k, v]) => {
            const val = typeof v === "string" ? v : JSON.stringify(v);
            localStorage.setItem(prefix ? `${prefix}${k}` : k, val);
            if (prefix) {
              localStorage.setItem(k, val);
            }
          });
        }
        if (typeof callback === "function") {
          callback();
        }
        return Promise.resolve();
      },
      remove(keys, callback) {
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach((k) => {
          localStorage.removeItem(prefix ? `${prefix}${k}` : k);
          if (prefix) localStorage.removeItem(k);
        });
        if (typeof callback === "function") {
          callback();
        }
        return Promise.resolve();
      },
      clear(callback) {
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
        if (typeof callback === "function") {
          callback();
        }
        return Promise.resolve();
      },
    };
  }

  const storage = {
    local: createStorageArea(""),
    sync: createStorageArea(""),
    onChanged: {
      addListener() {},
      removeListener() {},
      hasListener() {
        return false;
      },
    },
  };

  // ── chrome.i18n ───────────────────────────────────────────────────────────
  const i18n = {
    getMessage(key) {
      if (key === "@@extension_id") return "salesforce-inspector-reloaded";
      return key || "";
    },
  };

  // ── Assign to window.chrome ───────────────────────────────────────────────
  window.chrome = window.chrome || {};
  window.chrome.runtime = Object.assign(window.chrome.runtime || {}, runtime);
  window.chrome.tabs = Object.assign(window.chrome.tabs || {}, tabs);
  window.chrome.storage = Object.assign(window.chrome.storage || {}, storage);
  window.chrome.i18n = Object.assign(window.chrome.i18n || {}, i18n);

  if (typeof window.browser === "undefined") {
    window.browser = window.chrome;
  }

  // ── Layer 3: Self-Healing Reactive 401 & Token Refresh Interceptors ──────────
  let activeRefreshPromise = null;

  async function performSessionRefresh() {
    if (activeRefreshPromise) return activeRefreshPromise;

    activeRefreshPromise = (async () => {
      const electronApi = getElectronApi();
      if (!electronApi) {
        console.warn("[chrome-shim] Cannot refresh session: electronApi unavailable");
        return null;
      }

      try {
        let refreshed = null;
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
          } catch (e) {}

          // 2. Update window.sfConn if present
          try {
            if (window.sfConn) {
              window.sfConn.sessionId = newToken;
              if (newHost) window.sfConn.instanceHostname = newHost;
            }
          } catch (e) {}

          // 3. Dispatch tokenUpdated message locally and via chrome.runtime
          try {
            runtime.sendMessage({
              message: "tokenUpdated",
              sfHost: newHost || currentSfHost,
            });
          } catch (e) {}

          for (const listener of messageListeners) {
            try {
              listener({
                message: "tokenUpdated",
                sfHost: newHost || currentSfHost,
              });
            } catch (e) {}
          }

          // 4. Also postMessage to parent in case host container needs to sync
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
          } catch (e) {}

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
    if (!RealXMLHttpRequest || RealXMLHttpRequest.__isShimmed) return;

    class ShimmedXMLHttpRequest extends EventTarget {
      constructor() {
        super();
        this._real = new RealXMLHttpRequest();
        this._retried = false;
        this._method = "GET";
        this._url = "";
        this._async = true;
        this._user = undefined;
        this._password = undefined;
        this._headers = [];
        this._body = null;
        this._responseType = "";
        this._timeout = 0;
        this._withCredentials = false;

        this.onreadystatechange = null;
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        this.onloadstart = null;
        this.onloadend = null;
        this.onprogress = null;
        this.ontimeout = null;

        this._customListeners = new Map();
      }

      get readyState() {
        return this._real.readyState;
      }
      get status() {
        return this._real.status;
      }
      get statusText() {
        return this._real.statusText;
      }
      get response() {
        return this._real.response;
      }
      get responseURL() {
        return this._real.responseURL;
      }
      get responseXML() {
        return this._real.responseXML;
      }
      get responseText() {
        try {
          return this._real.responseText;
        } catch (e) {
          return "";
        }
      }
      get upload() {
        return this._real.upload;
      }

      get responseType() {
        return this._responseType;
      }
      set responseType(val) {
        this._responseType = val;
        try {
          this._real.responseType = val;
        } catch (e) {}
      }

      get timeout() {
        return this._timeout;
      }
      set timeout(val) {
        this._timeout = val;
        try {
          this._real.timeout = val;
        } catch (e) {}
      }

      get withCredentials() {
        return this._withCredentials;
      }
      set withCredentials(val) {
        this._withCredentials = val;
        try {
          this._real.withCredentials = val;
        } catch (e) {}
      }

      open(method, url, async = true, user, password) {
        const proxiedUrl = rewriteSfUrlToLocalProxy(url ? url.toString() : "");
        this._method = method;
        this._url = proxiedUrl;
        this._async = async;
        this._user = user;
        this._password = password;
        this._headers = [];
        return this._real.open(method, proxiedUrl, async, user, password);
      }

      setRequestHeader(name, value) {
        this._headers.push({ name, value });
        return this._real.setRequestHeader(name, value);
      }

      getResponseHeader(name) {
        return this._real.getResponseHeader(name);
      }

      getAllResponseHeaders() {
        return this._real.getAllResponseHeaders();
      }

      overrideMimeType(mime) {
        return this._real.overrideMimeType(mime);
      }

      abort() {
        return this._real.abort();
      }

      addEventListener(type, listener, options) {
        if (!this._customListeners.has(type)) {
          this._customListeners.set(type, new Set());
        }
        this._customListeners.get(type).add(listener);
        super.addEventListener(type, listener, options);
      }

      removeEventListener(type, listener, options) {
        const set = this._customListeners.get(type);
        if (set) set.delete(listener);
        super.removeEventListener(type, listener, options);
      }

      _dispatchEventToHandlers(type, event) {
        const handlerName = "on" + type;
        if (typeof this[handlerName] === "function") {
          try {
            this[handlerName].call(this, event);
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

      send(body) {
        this._body = body;
        this._bindAndSend(this._real, body);
      }

      _bindAndSend(targetXhr, body) {
        const self = this;

        try {
          if (targetXhr.upload) {
            const forwardUpload = (e) => {
              if (self.upload) {
                const evt = new CustomEvent(e.type, { detail: e });
                Object.assign(evt, {
                  loaded: e.loaded,
                  total: e.total,
                  lengthComputable: e.lengthComputable,
                });
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
              targetXhr.upload.addEventListener(ev, forwardUpload);
            }
          }
        } catch (e) {}

        const forwardEvent = (e) => {
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
            } catch (err) {}
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
                    } catch (err) {}
                  }
                  if (self._timeout) {
                    try {
                      replay.timeout = self._timeout;
                    } catch (err) {}
                  }
                  if (self._withCredentials) {
                    try {
                      replay.withCredentials = self._withCredentials;
                    } catch (err) {}
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

    ShimmedXMLHttpRequest.UNSENT = 0;
    ShimmedXMLHttpRequest.OPENED = 1;
    ShimmedXMLHttpRequest.HEADERS_RECEIVED = 2;
    ShimmedXMLHttpRequest.LOADING = 3;
    ShimmedXMLHttpRequest.DONE = 4;
    ShimmedXMLHttpRequest.__isShimmed = true;

    window.XMLHttpRequest = ShimmedXMLHttpRequest;
  }

  function installFetchInterceptor() {
    const origFetch = window.fetch;
    if (!origFetch || origFetch.__isShimmed) return;

    const shimmedFetch = async function (resource, init) {
      const proxiedResource =
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
          const newHeaders = {};

          if (newInit.headers) {
            if (typeof newInit.headers.forEach === "function") {
              newInit.headers.forEach((val, key) => {
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

    shimmedFetch.__isShimmed = true;
    window.fetch = shimmedFetch;
  }

  installXhrInterceptor();
  installFetchInterceptor();
})();
