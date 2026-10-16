/**
 * src/main/network/salesforce-cors-bypass.ts
 *
 * Installs Electron webRequest hooks that allow the renderer to make direct
 * XMLHttpRequest / fetch calls to the Salesforce REST, Tooling, Bulk,
 * Composite, and SOAP APIs without any modifications to addon/sfConn.
 *
 * Strategy (NO contextIsolation changes, NO IPC serialisation of payloads):
 *
 *  onBeforeSendHeaders – strip Origin / Referer so the Salesforce servers
 *    never see a cross-origin request and therefore never reject it at the
 *    network layer (SOAP /services/Soap/* endpoints are especially strict).
 *
 *  onHeadersReceived  – inject permissive CORS response headers so the
 *    browser's CORS enforcement inside the renderer is satisfied.  Also
 *    clears any existing CORS headers first to prevent Electron from
 *    encountering "multiple values" and rejecting the response.
 *    For OPTIONS preflight requests the status line is forced to "200 OK"
 *    so the browser completes the preflight immediately.
 */

import type { Session } from "electron";

// ── Known Salesforce host domains ─────────────────────────────────────────────
const SF_DOMAINS = [
  "salesforce.com",
  "force.com",
  "cloudforce.com",
  "visual.force.com",
  "visualforce.com",
  "sfcrmapps.cn",
  "sfcrmproducts.cn",
  "salesforce.mil",
  "force.mil",
  "crmforce.mil",
  "salesforce-setup.com",
  "salesforce-communities.com",
  "site.com",
  "builder.salesforce-experience.com",
];

/**
 * Checks whether a URL targets a Salesforce API endpoint or domain.
 * Captures all SOAP (/services/Soap/*) and REST (/services/data/*) endpoints
 * regardless of host, plus any known Salesforce domain.
 */
export function isSalesforceOrSoapUrl(urlStr: string): boolean {
  if (
    urlStr.includes("/services/Soap/") ||
    urlStr.includes("/services/data/") ||
    urlStr.includes("/services/apexrest/") ||
    urlStr.includes("/services/oauth2/") ||
    urlStr.includes("/services/async/")
  ) {
    return true;
  }
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return SF_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return urlStr.includes("salesforce.com") || urlStr.includes("force.com");
  }
}

// Headers that Salesforce SOAP / REST need to accept from the renderer
const ALLOWED_REQUEST_HEADERS = [
  "Authorization",
  "Content-Type",
  "Accept",
  "SOAPAction",
  "CallOptions",
  "Sforce-Call-Options",
  "Sforce-Auto-Assign",
  "Sforce-Duplicate-Rule-Header",
  "Sforce-Query-Options",
  "X-SFDC-Session",
  "X-PrettyPrint",
  "Origin",
  "User-Agent",
  "X-Requested-With",
  "Range",
  "Cache-Control",
  "Pragma",
  "Priority",
  "*",
].join(", ");

// ── Helper: case-insensitive header deletion ──────────────────────────────────

function deleteHeader(
  headers: Record<string, string | string[]>,
  name: string
): void {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key];
    }
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function installSalesforceCorsBypass(session: Session): void {
  const ALL_FILTER: Electron.WebRequestFilter = { urls: ["*://*/*"] };
  const requestOriginMap = new Map<number, string>();

  // ── Request side ───────────────────────────────────────────────────────────
  session.webRequest.onBeforeSendHeaders(ALL_FILTER, (details, callback) => {
    if (!isSalesforceOrSoapUrl(details.url)) {
      callback({ cancel: false });
      return;
    }

    const requestHeaders: Record<string, string | string[]> = {
      ...details.requestHeaders,
    };

    // Store requesting Origin so onHeadersReceived can mirror it if needed
    const origin = requestHeaders["Origin"] || requestHeaders["origin"];
    if (origin) {
      requestOriginMap.set(
        details.id,
        Array.isArray(origin) ? origin[0] : origin
      );
    }

    // Crucial: DO NOT delete Origin on OPTIONS preflight!
    // Chromium's CORS preflight mechanism requires the Origin header.
    // For actual requests (POST, GET, etc.), strip Origin and Referer so Salesforce
    // servers never reject the request due to CORS un-whitelisted domains.
    if (details.method !== "OPTIONS") {
      deleteHeader(requestHeaders, "Origin");
      deleteHeader(requestHeaders, "Referer");
    }

    // Ensure SOAPAction header is preserved for SOAP endpoints
    if (details.url.includes("/services/Soap/")) {
      if (
        requestHeaders["SOAPAction"] === undefined &&
        requestHeaders["soapaction"] === undefined
      ) {
        requestHeaders["SOAPAction"] = '""';
      }
    }

    callback({ cancel: false, requestHeaders });
  });

  // ── Response side ──────────────────────────────────────────────────────────
  session.webRequest.onHeadersReceived(ALL_FILTER, (details, callback) => {
    if (!isSalesforceOrSoapUrl(details.url)) {
      callback({ cancel: false });
      return;
    }

    const responseHeaders: Record<string, string | string[]> = {
      ...details.responseHeaders,
    };

    // Wipe existing CORS headers to prevent duplicate values
    deleteHeader(responseHeaders, "access-control-allow-origin");
    deleteHeader(responseHeaders, "access-control-allow-headers");
    deleteHeader(responseHeaders, "access-control-allow-methods");
    deleteHeader(responseHeaders, "access-control-expose-headers");
    deleteHeader(responseHeaders, "access-control-allow-credentials");
    deleteHeader(responseHeaders, "access-control-max-age");

    // Retrieve requesting Origin if captured, or fallback to referrer origin or wildcard
    const storedOrigin = requestOriginMap.get(details.id);
    requestOriginMap.delete(details.id);

    let allowOrigin = "*";
    if (storedOrigin && storedOrigin !== "null") {
      allowOrigin = storedOrigin;
    } else if (details.referrer) {
      try {
        const parsed = new URL(details.referrer);
        if (parsed.origin && parsed.origin !== "null") {
          allowOrigin = parsed.origin;
        }
      } catch {}
    }

    responseHeaders["Access-Control-Allow-Origin"] = [allowOrigin];
    if (allowOrigin !== "*") {
      responseHeaders["Access-Control-Allow-Credentials"] = ["true"];
    }

    responseHeaders["Access-Control-Allow-Methods"] = [
      "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    ];
    responseHeaders["Access-Control-Allow-Headers"] = [ALLOWED_REQUEST_HEADERS];
    responseHeaders["Access-Control-Expose-Headers"] = ["*"];
    responseHeaders["Access-Control-Max-Age"] = ["86400"];

    // ── OPTIONS preflight: force 200 OK so the browser completes immediately ──
    if (details.method === "OPTIONS") {
      callback({
        cancel: false,
        responseHeaders,
        statusLine: "HTTP/1.1 200 OK",
      });
      return;
    }

    callback({ cancel: false, responseHeaders });
  });

  // Clean up origin map on error or completion
  session.webRequest.onErrorOccurred(ALL_FILTER, (details) => {
    requestOriginMap.delete(details.id);
  });
  session.webRequest.onCompleted(ALL_FILTER, (details) => {
    requestOriginMap.delete(details.id);
  });

  console.log(
    "[salesforce-cors-bypass] webRequest hooks installed for Salesforce SOAP/REST endpoints."
  );
}
