import {getRedirectUri, getClientId, isSettingEnabled, Constants} from "./utils.js";
import {apiStatistics} from "./api-statistics.js";
import {DescribeInfo as DefaultDescribeInfo} from "./data-load.js";

export let defaultApiVersion = "67.0";
export let apiVersion = localStorage.getItem("apiVersion") == null ? defaultApiVersion : localStorage.getItem("apiVersion");
export { DefaultDescribeInfo as DescribeInfo };
export const h = (...args) => (window.React ? window.React.createElement(...args) : null);
export const initButton = () => {};

export let sessionError;
const clientId = "Salesforce Inspector Reloaded";
const qaInternalClientIdPrefix = "SfdcInternalQA/";

// Resolved on each call so toggling the option applies without reloading open pages
function getCallOptionsClientId() {
  return isSettingEnabled(Constants.QA_INTERNAL_MODE) ? qaInternalClientIdPrefix + clientId : clientId;
}

// ── Electron window.chrome polyfill & link navigation bridge ──────────────────
const _electronApi =
  window.electronApi ||
  (window.parent && window.parent.electronApi) ||
  (window.top && window.top.electronApi);
const _urlParams = new URLSearchParams(window.location.search.slice(1));
const _currentOrgId = _urlParams.get("orgId") || "";
const _currentSfHost = (_urlParams.get("host") || "")
  .replace(/^https?:\/\//i, "")
  .replace(/\/.*$/, "");

if (!window.chrome || !window.chrome.runtime || !window.chrome.runtime.sendMessage) {
  window.chrome = window.chrome || {};
  window.chrome.i18n = { getMessage: (k) => k };
  window.chrome.storage = {
    local: {
      get: (keys, cb) => {
        const res = {};
        const list = Array.isArray(keys)
          ? keys
          : typeof keys === "string"
          ? [keys]
          : Object.keys(keys || {});
        list.forEach((k) => {
          const raw = localStorage.getItem(k);
          if (raw !== null) {
            try {
              res[k] = JSON.parse(raw);
            } catch {
              res[k] = raw;
            }
          } else if (
            typeof keys === "object" &&
            !Array.isArray(keys) &&
            keys !== null
          ) {
            res[k] = keys[k];
          }
        });
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      set: (items, cb) => {
        Object.entries(items || {}).forEach(([k, v]) =>
          localStorage.setItem(k, JSON.stringify(v))
        );
        if (cb) cb();
        return Promise.resolve();
      },
    },
  };
  window.chrome.runtime = {
    getManifest: () => ({ version_name: "2.1.0", version: "2.1.0" }),
    onMessage: { addListener: () => {}, removeListener: () => {} },
    getURL: (path) => `/addon/${path.replace(/^\//, "")}`,
    sendMessage: (msg, cb) => {
      if (msg && msg.message === "getSession") {
        const cleanHost = (msg.sfHost || _currentSfHost)
          .replace(/^https?:\/\//i, "")
          .replace(/\/.*$/, "");
        if (_electronApi && _electronApi.getSession) {
          _electronApi
            .getSession({ orgId: _currentOrgId, sfHost: cleanHost })
            .then((session) => {
              const payload = session
                ? {
                    key: session.key,
                    hostname: (session.hostname || cleanHost)
                      .replace(/^https?:\/\//i, "")
                      .replace(/\/.*$/, ""),
                  }
                : null;
              if (cb) cb(payload);
            })
            .catch(() => {
              if (cb) cb(null);
            });
          return;
        }
      }
      if (msg && msg.message === "getSfHost") {
        if (cb) cb(_currentSfHost);
        return;
      }
      if (cb) cb(null);
    },
  };
}

// Global click & auxclick delegation for internal tabs and external Salesforce links
function _handleGlobalLinkClick(e) {
  const path = e.composedPath ? e.composedPath() : [];
  let anchor = null;
  for (const el of path) {
    if (el && el.tagName && el.tagName.toLowerCase() === "a") {
      anchor = el;
      break;
    }
  }
  if (!anchor && e.target) {
    anchor = e.target.closest ? e.target.closest("a") : null;
  }
  if (!anchor) return;

  const rawHref = anchor.getAttribute("href") || anchor.href;
  if (!rawHref || rawHref === "#" || rawHref.startsWith("javascript:")) return;

  const internalPages = [
    "data-export.html",
    "data-import.html",
    "inspect.html",
    "limits.html",
    "explore-api.html",
    "event-monitor.html",
    "field-creator.html",
    "field-manager.html",
    "options.html",
    "popup.html",
    "rest-explore.html",
    "metadata-retrieve.html",
    "flow-scanner.html",
    "dependencies-explorer.html",
  ];

  const lowerHref = rawHref.toLowerCase();
  const isInternal = internalPages.some((p) => lowerHref.includes(p));

  if (isInternal) {
    e.preventDefault();
    e.stopPropagation();
    if (window.top) {
      window.top.postMessage(
        {
          type: "SFIR_OPEN_SUBTAB",
          orgId: _currentOrgId,
          sfHost: _currentSfHost,
          href: rawHref,
        },
        "*"
      );
    }
    return;
  }

  // Intercept Salesforce links (relative paths or Salesforce domains)
  const isSalesforceRelative =
    rawHref.startsWith("/servlet/servlet.su") ||
    rawHref.startsWith("/lightning/") ||
    rawHref.startsWith("/secur/") ||
    rawHref.startsWith("/apex/") ||
    rawHref.startsWith("/_ui/");

  const isSalesforceAbsolute =
    anchor.href &&
    (anchor.href.includes(".salesforce.com") ||
      anchor.href.includes(".force.com") ||
      anchor.href.includes(".cloudforce.com"));

  if (isSalesforceRelative || isSalesforceAbsolute) {
    try {
      let retUrl = rawHref;
      if (isSalesforceAbsolute) {
        const parsedUrl = new URL(anchor.href);
        const host = parsedUrl.hostname.toLowerCase();
        const isSalesforceApp =
          (host.endsWith(".salesforce.com") ||
            host.endsWith(".force.com") ||
            host.endsWith(".cloudforce.com")) &&
          !host.startsWith("help.") &&
          !host.startsWith("developer.") &&
          !host.startsWith("trailhead.");

        if (isSalesforceApp) {
          retUrl = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
        } else {
          if (_electronApi && _electronApi.openExternal) {
            e.preventDefault();
            e.stopPropagation();
            _electronApi.openExternal(anchor.href);
            return;
          }
        }
      }

      e.preventDefault();
      e.stopPropagation();
      if (_electronApi && _electronApi.openOrgFrontdoor) {
        _electronApi.openOrgFrontdoor(_currentOrgId, retUrl);
      } else if (_electronApi && _electronApi.openExternal) {
        _electronApi.openExternal(`https://${_currentSfHost}${retUrl}`);
      } else {
        window.open(`https://${_currentSfHost}${retUrl}`, "_blank");
      }
      return;
    } catch {
      // Fall through
    }
  }

  if (
    anchor.href &&
    (anchor.href.startsWith("http://") || anchor.href.startsWith("https://"))
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (_electronApi && _electronApi.openExternal) {
      _electronApi.openExternal(anchor.href);
    } else {
      window.open(anchor.href, "_blank");
    }
  }
}

window.addEventListener("click", _handleGlobalLinkClick, true);
window.addEventListener("auxclick", _handleGlobalLinkClick, true);

// Wrap window.open to intercept script-driven tool and frontdoor navigation
const _origWindowOpen = window.open;
window.open = function (url, target, features) {
  if (url && typeof url === "string") {
    // 1. Check if internal inspector tool
    const internalPages = [
      "data-export.html",
      "data-import.html",
      "inspect.html",
      "limits.html",
      "explore-api.html",
      "event-monitor.html",
      "field-creator.html",
      "field-manager.html",
      "options.html",
    ];
    if (internalPages.some((p) => url.toLowerCase().includes(p))) {
      if (window.top) {
        window.top.postMessage(
          {
            type: "SFIR_OPEN_SUBTAB",
            orgId: _currentOrgId,
            sfHost: _currentSfHost,
            href: url,
          },
          "*"
        );
      }
      return null;
    }

    // 2. Check if Salesforce link
    const isRelative =
      url.startsWith("/servlet/servlet.su") ||
      url.startsWith("/lightning/") ||
      url.startsWith("/secur/") ||
      url.startsWith("/apex/") ||
      url.startsWith("/_ui/");

    const isAbsolute =
      url.includes(".salesforce.com") ||
      url.includes(".force.com") ||
      url.includes(".cloudforce.com");

    if (isRelative || isAbsolute) {
      let retUrl = url;
      if (isAbsolute) {
        try {
          const parsed = new URL(url);
          retUrl = parsed.pathname + parsed.search + parsed.hash;
        } catch {}
      }
      if (_electronApi && _electronApi.openOrgFrontdoor) {
        _electronApi.openOrgFrontdoor(_currentOrgId, retUrl);
        return null;
      }
    }

    if (
      _electronApi &&
      _electronApi.openExternal &&
      (url.startsWith("http://") || url.startsWith("https://"))
    ) {
      _electronApi.openExternal(url);
      return null;
    }
  }
  return _origWindowOpen ? _origWindowOpen.call(window, url, target, features) : null;
};

// ── sfConnPrototype ────────────────────────────────────────────────────────────
//
// All sfConn behaviour lives here.  Per-org instances are created via
// Object.create(sfConnPrototype) in createOrgScopedInspector so they carry
// their own orgId / instanceHostname / sessionId without any shared state.
//
// The exported `sfConn` below is the singleton used by pages that have not
// yet been migrated to the scoped factory (100% backwards-compatible).

const sfConnPrototype = {

  async getSession(sfHost) {
    const url = new URL(window.location.href);
    const searchParams = new URLSearchParams(url.search);
    const authorizationCode = searchParams.get("code");
    const state = searchParams.get("state");

    // If we have an authorization code, extract sfHost from state parameter
    if (authorizationCode && state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(state));
        sfHost = stateData.sfHost;
      } catch (error) {
        console.error("Error parsing state parameter:", error);
      }
    }

    sfHost = getMyDomain(sfHost);
    const oldToken = localStorage.getItem(sfHost + Constants.ACCESS_TOKEN);
    this.instanceHostname = sfHost;

    // Check if this is an OAuth callback with authorization code (PKCE flow)
    if (authorizationCode) {
      try {
        const codeVerifier = localStorage.getItem(sfHost + Constants.CODE_VERIFIER);
        if (!codeVerifier) {
          throw new Error("Code verifier not found. Please restart the authorization flow.");
        }

        // Exchange authorization code for access token
        const accessToken = await this.exchangeCodeForToken(sfHost, authorizationCode, codeVerifier);
        this.sessionId = accessToken;
        localStorage.setItem(sfHost + Constants.ACCESS_TOKEN, accessToken);

        //send message to popup so that it can update the token
        chrome.runtime.sendMessage({message: "tokenUpdated", sfHost});

        // Clean up code verifier
        localStorage.removeItem(sfHost + Constants.CODE_VERIFIER);

        // Clean up the URL by removing the code and state parameters
        const cleanUrl = url.origin + url.pathname + "?host=" + sfHost + url.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (error) {
        console.error("Error exchanging authorization code for token:", error);
        sessionError = {text: error.message, type: "error", icon: "error"};
        showToastBanner();
      }
    } else if (oldToken) {
      this.sessionId = oldToken;
    } else {
      // ── Electron path ────────────────────────────────────────────────────────
      // When running in Electron, electronApi.getSession is available on the
      // window object via the preload contextBridge.  Pass both orgId (for
      // vault lookup by key) and sfHost (fallback lookup) so the main process
      // can find the right session regardless of which was stored first.
      const api =
        window.electronApi ||
        (window.parent && window.parent.electronApi) ||
        (window.top && window.top.electronApi);
      if (api?.getSession) {
        const urlParams = new URLSearchParams(window.location.search || "");
        const res = await api.getSession({
          orgId: this.orgId || urlParams.get("orgId") || undefined,
          sfHost,
        });
        if (res) {
          this.instanceHostname = getMyDomain(res.hostname);
          this.sessionId = res.key;
        }
      } else {
        // ── Browser extension path ─────────────────────────────────────────────
        let message = await new Promise(resolve =>
          chrome.runtime.sendMessage({message: "getSession", sfHost}, resolve));
        if (message) {
          this.instanceHostname = getMyDomain(message.hostname);
          this.sessionId = message.key;
        }
      }
    }
    if (localStorage.getItem(sfHost + "_trialExpirationDate") == null) {
      this.rest("/services/data/v" + apiVersion + "/query/?q=SELECT+IsSandbox,+InstanceName+,TrialExpirationDate+FROM+Organization").then(res => {
        localStorage.setItem(sfHost + "_isSandbox", res.records[0].IsSandbox);
        localStorage.setItem(sfHost + "_orgInstance", res.records[0].InstanceName);
        localStorage.setItem(sfHost + "_trialExpirationDate", res.records[0].TrialExpirationDate);
      });
    }
    return this.sessionId;
  },

  async exchangeCodeForToken(sfHost, authorizationCode, codeVerifier) {
    const redirectUri = getRedirectUri("data-export.html");
    const clientId = getClientId(sfHost);

    // Validate redirect URI was successfully generated
    if (!redirectUri || !redirectUri.includes("-extension://")) {
      throw new Error("Failed to generate redirect URI. Extension context may be invalidated. Please reload this page and try again.");
    }

    const tokenUrl = `https://${sfHost}/services/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error_description || "Failed to exchange code for token");
    }

    const tokenData = await response.json();
    return tokenData.access_token;
  },

  async rest(url, {logErrors = true, method = "GET", api = "normal", body = undefined, bodyType = "json", responseType = "json", headers = {}, progressHandler = null, useCache = true, suppressSessionError = false} = {}, rawResponse) {
    if (!this.instanceHostname) {
      throw new Error("Instance Hostname not found");
    }

    // Track API call start time for statistics
    const startTime = performance.now();

    let xhr = new XMLHttpRequest();
    if (useCache) {
      url += (url.includes("?") ? "&" : "?") + "cache=" + Math.random();
    }
    const sfHost = "https://" + this.instanceHostname;
    const fullUrl = new URL(url, sfHost);
    xhr.open(method, fullUrl.toString(), true);

    if (api == "bulk") {
      xhr.setRequestHeader("X-SFDC-Session", this.sessionId);
    } else if (api == "normal") {
      xhr.setRequestHeader("Authorization", "Bearer " + this.sessionId);
    } else {
      throw new Error("Unknown api");
    }

    // Apply custom headers first (but filter out protected headers)
    const protectedHeaders = ["Sforce-Call-Options"];
    for (let [name, value] of Object.entries(headers)) {
      if (!protectedHeaders.includes(name)) {
        xhr.setRequestHeader(name, value);
      }
    }

    // Set default Content-Type header if body is present and Content-Type not provided by custom headers
    if (body !== undefined && !headers.hasOwnProperty("Content-Type")) {
      xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    }

    if (body !== undefined) {
      if (bodyType == "json") {
        body = JSON.stringify(body);
      } else if (bodyType == "raw") {
        // Do nothing
      } else {
        throw new Error("Unknown bodyType");
      }
    }

    // Set default Accept header if not provided by custom headers
    if (!headers.hasOwnProperty("Accept")) {
      xhr.setRequestHeader("Accept", "application/json; charset=UTF-8");
    }

    // Always set this header last to ensure it cannot be overridden
    xhr.setRequestHeader("Sforce-Call-Options", `client=${getCallOptionsClientId()}`);

    xhr.responseType = responseType;
    await new Promise((resolve, reject) => {
      if (progressHandler) {
        progressHandler.abort = () => {
          let err = new Error("The request was aborted.");
          err.name = "AbortError";
          reject(err);
          xhr.abort();
        };
      }

      xhr.onreadystatechange = () => {
        if (xhr.readyState == 4) {
          resolve();
        }
      };
      xhr.send(body);
    });

    // Calculate duration and track statistics
    const duration = performance.now() - startTime;
    let errorMessage = null;

    if (rawResponse){
      apiStatistics.trackApiCall("rest", url, method, duration, false);
      return xhr;
    } else if (xhr.status >= 200 && xhr.status < 400) {
      apiStatistics.trackApiCall("rest", url, method, duration, false);
      return xhr.response;
    } else if (xhr.status == 0) {
      if (!logErrors) { console.error("Received no response from Salesforce REST API", xhr); }
      errorMessage = "Network error, offline or timeout";
      apiStatistics.trackApiCall("rest", url, method, duration, true, errorMessage);
      let err = new Error();
      err.name = "SalesforceRestError";
      err.message = errorMessage;
      throw err;
    } else if (xhr.status == 401) {
      let error = xhr.response.length > 0 ? xhr.response[0].message : "New access token needed";
      errorMessage = `401 Unauthorized: ${error}`;
      //set sessionError only if user has already generated a token, which will prevent to display the error when the session is expired and api access control not configured
      if (!suppressSessionError && localStorage.getItem(this.instanceHostname + Constants.ACCESS_TOKEN)){
        sessionError = {text: "Access Token Expired", title: "Generate New Token", type: "warning", icon: "warning"};
        showToastBanner();
      }
      apiStatistics.trackApiCall("rest", url, method, duration, true, errorMessage);
      let err = new Error();
      err.name = "Unauthorized";
      err.message = error;
      throw err;
    } else if (xhr.status == 403) {
      let error = xhr.response.length > 0 ? xhr.response[0].message : "Error";
      errorMessage = `403 Forbidden: ${error}`;
      if (!suppressSessionError) {
        sessionError = {text: error, type: "error", icon: "error"};
        showToastBanner();
      }
      apiStatistics.trackApiCall("rest", url, method, duration, true, errorMessage);
      let err = new Error();
      err.name = "Forbidden";
      err.message = error;
      throw err;
    } else {
      if (!logErrors) { console.error("Received error response from Salesforce REST API", xhr); }
      let err = new Error();
      err.name = "SalesforceRestError";
      err.detail = xhr.response;
      try {
        errorMessage = err.detail.map(err => `${err.errorCode}: ${err.message}${err.fields && err.fields.length > 0 ? ` [${err.fields.join(", ")}]` : ""}`).join("\n");
        err.message = errorMessage;
      } catch (ex) {
        errorMessage = JSON.stringify(xhr.response);
        err.message = errorMessage;
      }
      if (!err.message) {
        errorMessage = `HTTP error ${xhr.status} ${xhr.statusText}`;
        err.message = errorMessage;
      }
      apiStatistics.trackApiCall("rest", url, method, duration, true, errorMessage);
      throw err;
    }
  },

  wsdl(apiVersion, apiName) {
    let wsdl = {
      Enterprise: {
        servicePortAddress: "/services/Soap/c/" + apiVersion,
        targetNamespaces: ' xmlns="urn:enterprise.soap.sforce.com" xmlns:sf="urn:sobject.enterprise.soap.sforce.com"',
        apiName: "Enterprise"
      },
      Partner: {
        servicePortAddress: "/services/Soap/u/" + apiVersion,
        targetNamespaces: ' xmlns="urn:partner.soap.sforce.com" xmlns:sf="urn:sobject.partner.soap.sforce.com"',
        apiName: "Partner"
      },
      Apex: {
        servicePortAddress: "/services/Soap/s/" + apiVersion,
        targetNamespaces: ' xmlns="http://soap.sforce.com/2006/08/apex"',
        apiName: "Apex"
      },
      Metadata: {
        servicePortAddress: "/services/Soap/m/" + apiVersion,
        targetNamespaces: ' xmlns="http://soap.sforce.com/2006/04/metadata"',
        apiName: "Metadata"
      },
      Tooling: {
        servicePortAddress: "/services/Soap/T/" + apiVersion,
        targetNamespaces: ' xmlns="urn:tooling.soap.sforce.com" xmlns:sf="urn:sobject.tooling.soap.sforce.com" xmlns:mns="urn:metadata.tooling.soap.sforce.com"',
        apiName: "Tooling"
      }
    };
    if (apiName) {
      wsdl = wsdl[apiName];
    }
    return wsdl;
  },

  async soap(wsdl, method, args, {headers} = {}) {
    if (!this.instanceHostname || !this.sessionId) {
      throw new Error("Session not found");
    }

    // Track API call start time for statistics
    const startTime = performance.now();

    let xhr = new XMLHttpRequest();
    xhr.open("POST", "https://" + this.instanceHostname + wsdl.servicePortAddress + "?cache=" + Math.random(), true);
    xhr.setRequestHeader("Content-Type", "text/xml");
    xhr.setRequestHeader("SOAPAction", '""');
    xhr.setRequestHeader("CallOptions", `client:${getCallOptionsClientId()}`);

    let sessionHeaderKey = wsdl.apiName == "Metadata" ? "met:SessionHeader" : "SessionHeader";
    let sessionIdKey = wsdl.apiName == "Metadata" ? "met:sessionId" : "sessionId";
    let requestMethod = wsdl.apiName == "Metadata" ? `met:${method}` : method;
    let requestAttributes = [
      'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"',
      'xmlns:xsd="http://www.w3.org/2001/XMLSchema"',
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    ];
    if (wsdl.apiName == "Metadata") {
      requestAttributes.push('xmlns:met="http://soap.sforce.com/2006/04/metadata"');
    }

    let requestBody = XML.stringify({
      name: "soapenv:Envelope",
      attributes: ` ${requestAttributes.join(" ")}${wsdl.targetNamespaces}`,
      value: {
        "soapenv:Header": Object.assign({}, {[sessionHeaderKey]: {[sessionIdKey]: this.sessionId}}, headers),
        "soapenv:Body": {[requestMethod]: args}
      }
    });

    xhr.responseType = "document";
    await new Promise(resolve => {
      xhr.onreadystatechange = () => {
        if (xhr.readyState == 4) {
          resolve(xhr);
        }
      };
      xhr.send(requestBody);
    });

    // Calculate duration and track statistics
    const duration = performance.now() - startTime;
    let errorMessage = null;

    if (xhr.status == 200) {
      apiStatistics.trackApiCall("soap", null, method, duration, false);
      let responseBody = xhr.response.querySelector(method + "Response");
      let parsed = XML.parse(responseBody).result;
      return parsed;
    }

    // Fallback: If XHR status is 0 (CORS preflight or network drop in renderer) and running in Electron
    const electronApi =
      (typeof window !== "undefined" && (window.electronApi || window.electronAPI)) ||
      (typeof window !== "undefined" && window.parent && (window.parent.electronApi || window.parent.electronAPI)) ||
      (typeof window !== "undefined" && window.top && (window.top.electronApi || window.top.electronAPI));

    if (xhr.status === 0 && electronApi?.sfSoapRequest) {
      try {
        console.warn("[sfConn.soap] XHR status 0 detected, retrying via Electron sfSoapRequest IPC bridge...");
        const res = await electronApi.sfSoapRequest({
          sfHost: this.instanceHostname,
          path: wsdl.servicePortAddress + "?cache=" + Math.random(),
          soapAction: '""',
          xmlBody: requestBody,
          headers: {
            CallOptions: `client:${getCallOptionsClientId()}`
          }
        });
        if (res && res.status === 200) {
          const doc = new DOMParser().parseFromString(res.data, "text/xml");
          const responseBody = doc.querySelector(method + "Response");
          if (responseBody) {
            apiStatistics.trackApiCall("soap", null, method, performance.now() - startTime, false);
            return XML.parse(responseBody).result;
          }
        } else if (res && res.data) {
          const doc = new DOMParser().parseFromString(res.data, "text/xml");
          const fault = doc.querySelector("faultstring");
          if (fault) {
            errorMessage = fault.textContent;
            let err = new Error(errorMessage);
            err.name = "SalesforceSoapError";
            apiStatistics.trackApiCall("soap", null, method, performance.now() - startTime, true, errorMessage);
            throw err;
          }
        }
      } catch (fallbackErr) {
        if (fallbackErr.name === "SalesforceSoapError") throw fallbackErr;
        console.error("[sfConn.soap] Fallback sfSoapRequest error:", fallbackErr);
      }
    }

    console.error("Received error response from Salesforce SOAP API", xhr);
    let err = new Error();
    err.name = "SalesforceSoapError";
    err.detail = xhr.response;
    try {
      errorMessage = xhr.response.querySelector("faultstring").textContent;
      err.message = errorMessage;
    } catch (ex) {
      errorMessage = `HTTP error ${xhr.status} ${xhr.statusText}`;
      err.message = errorMessage;
    }
    apiStatistics.trackApiCall("soap", null, method, duration, true, errorMessage);
    throw err;
  },

  asArray(x) {
    if (!x) return [];
    if (x instanceof Array) return x;
    return [x];
  },

};

// ── Backwards-compatible singleton export ─────────────────────────────────────
//
// Existing addon pages that do `import { sfConn } from "./inspector.js"` and
// call sfConn.getSession / sfConn.rest etc. continue to work unchanged because
// this singleton is an instance of sfConnPrototype.
export let sfConn = Object.create(sfConnPrototype);
if (typeof window !== "undefined") {
  window.sfConn = sfConn;
}

export class XML {
  static stringify({name, attributes, value}) {
    function buildRequest(el, params) {
      if (params == null) {
        el.setAttribute("xsi:nil", "true");
      } else if (typeof params == "object") {
        for (let [key, value] of Object.entries(params)) {
          if (key == "_") {
            if (value == null) {
              el.setAttribute("xsi:nil", "true");
            } else {
              el.textContent = value;
            }
          } else if (key == "$xsi:type") {
            el.setAttribute("xsi:type", value);
          } else if (value === undefined) {
            // ignore
          } else if (Array.isArray(value)) {
            for (let element of value) {
              let x = doc.createElement(key);
              buildRequest(x, element);
              el.appendChild(x);
            }
          } else {
            let x = doc.createElement(key);
            buildRequest(x, value);
            el.appendChild(x);
          }
        }
      } else {
        el.textContent = params;
      }
    }
    let doc = new DOMParser().parseFromString("<" + name + attributes + "/>", "text/xml");
    buildRequest(doc.documentElement, value);
    return '<?xml version="1.0" encoding="UTF-8"?>' + new XMLSerializer().serializeToString(doc).replace(/ xmlns=""/g, "");
  }

  static parse(element) {
    function parseResponse(element) {
      let str = ""; // XSD Simple Type value
      let obj = null; // XSD Complex Type value
      // If the element has child elements, it is a complex type. Otherwise we assume it is a simple type.
      if (element.getAttribute("xsi:nil") == "true") {
        return null;
      }
      let type = element.getAttribute("xsi:type");
      if (type) {
        // Salesforce never sets the xsi:type attribute on simple types. It is only used on sObjects.
        obj = {
          "$xsi:type": type
        };
      }
      for (let child = element.firstChild; child != null; child = child.nextSibling) {
        if (child instanceof CharacterData) {
          str += child.data;
        } else if (child instanceof Element) {
          if (obj == null) {
            obj = {};
          }
          let name = child.localName;
          let content = parseResponse(child);
          if (name in obj) {
            if (obj[name] instanceof Array) {
              obj[name].push(content);
            } else {
              obj[name] = [obj[name], content];
            }
          } else {
            obj[name] = content;
          }
        } else {
          throw new Error("Unknown child node type");
        }
      }
      return obj || str;
    }
    return parseResponse(element);
  }
}

function getMyDomain(host) {
  if (host) {
    const myDomain = host
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/\.lightning\.force\./, ".my.salesforce.") //avoid HTTP redirect (that would cause Authorization header to be dropped)
      .replace(/\.lightning\.([^.]+)\.force\.com$/, ".my.$1.salesforce.com") // handle hosts like *.lightning.xx-xxx.force.com
      .replace(/\.mcas\.ms$/, ""); //remove trailing .mcas.ms if the client uses Microsoft Defender for Cloud Apps
    return myDomain;
  }
  return host;
}

function showToastBanner(){
  const containerToShow = document.getElementById("toastBanner");
  if (containerToShow) { containerToShow.classList.remove("hide"); }
  const containerToMask = document.getElementById("mainTabs");
  if (containerToMask) { containerToMask.classList.add("mask"); }
}

// ── Per-org scoped inspector factory ─────────────────────────────────────────
//
// Used by the Electron renderer shell to give each connected org its own
// isolated sfConn instance and its own DescribeInfo cache.
//
// Keyed strictly by orgId so switching between orgs never leaks state.
//
// CIRCULAR-IMPORT NOTE: data-load.js imports inspector.js, so inspector.js
// cannot statically or dynamically import data-load.js at the module level.
// Instead, the factory accepts an optional DescribeInfoClass parameter.
// Callers that want the ScopedDescribeInfo sub-class should pass in the
// DescribeInfo they imported from data-load.js themselves:
//
//   import { createOrgScopedInspector } from "./inspector.js";
//   import { DescribeInfo } from "./data-load.js";
//   const { sfConn, DescribeInfo: ScopedDI } =
//       createOrgScopedInspector(orgId, sfHost, DescribeInfo);

const orgRegistry = new Map(); // Map<orgId, { sfConn, DescribeInfo, describeCache }>

/**
 * Return (or lazily create) an isolated { sfConn, DescribeInfo, describeCache }
 * bundle for the given orgId.
 *
 * @param {string}   orgId           - 18-char Salesforce Org ID (registry key).
 * @param {string}   sfHost          - Instance hostname, e.g. "myinstance.salesforce.com".
 * @param {Function} [DescribeInfoClass] - The DescribeInfo constructor from data-load.js.
 *                                        When provided, a ScopedDescribeInfo sub-class
 *                                        that pre-wires scopedContext is returned under
 *                                        the `DescribeInfo` key of the result.
 */
export function createOrgScopedInspector(orgId, sfHost, DescribeInfoClass = null) {
  if (!orgRegistry.has(orgId)) {
    // Create an isolated sfConn instance backed by sfConnPrototype
    const scopedSfConn = Object.create(sfConnPrototype);
    scopedSfConn.orgId = orgId;
    scopedSfConn.instanceHostname = sfHost;
    scopedSfConn.sessionId = null;

    // Shared describe cache so multiple Sub-Tabs for the same org reuse
    // already-fetched describe results.
    const describeCache = { normal: null, tooling: null };

    let ScopedDescribeInfoClass = null;
    const BaseDescribeInfo = DescribeInfoClass || DefaultDescribeInfo;
    if (BaseDescribeInfo) {
      ScopedDescribeInfoClass = function(spinFor, didUpdate) {
        return BaseDescribeInfo(spinFor, didUpdate, { sfConn: scopedSfConn, describeCache });
      };
    }

    orgRegistry.set(orgId, {
      sfConn: scopedSfConn,
      DescribeInfo: ScopedDescribeInfoClass,
      describeCache,
    });
  }
  return orgRegistry.get(orgId);
}

/**
 * Remove an org's scoped state from the registry, releasing all cached
 * describe data and allowing GC to reclaim the sfConn instance.
 *
 * @param {string} orgId
 */
export function destroyOrgScopedInspector(orgId) {
  orgRegistry.delete(orgId);
}

