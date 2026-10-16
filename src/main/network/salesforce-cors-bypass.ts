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

// ── URL filter ────────────────────────────────────────────────────────────────
//
// This list mirrors the host_permissions in addon/manifest.json so we intercept
// exactly the same set of domains that the browser extension has access to.

const SF_URL_FILTER: Electron.WebRequestFilter = {
  urls: [
    "*://*.salesforce.com/*",
    "*://*.force.com/*",
    "*://*.cloudforce.com/*",
    "*://*.visual.force.com/*",
    "*://*.visualforce.com/*",
    "*://*.sfcrmapps.cn/*",
    "*://*.sfcrmproducts.cn/*",
    "*://*.salesforce.mil/*",
    "*://*.force.mil/*",
    "*://*.crmforce.mil/*",
    "*://*.builder.salesforce-experience.com/*",
  ],
};

// Headers that Salesforce SOAP / REST need to accept from the renderer
const ALLOWED_REQUEST_HEADERS = [
  "Authorization",
  "Content-Type",
  "Accept",
  "SOAPAction",
  "Sforce-Call-Options",
  "Sforce-Auto-Assign",
  "Sforce-Duplicate-Rule-Header",
  "Sforce-Query-Options",
  "X-SFDC-Session",
  "X-PrettyPrint",
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
  // ── Request side ───────────────────────────────────────────────────────────
  //
  // Remove Origin and Referer before the request leaves Electron.
  // Salesforce SOAP endpoints will reject requests that arrive with an
  // Origin header that doesn't match an allow-listed domain, and REST
  // endpoints may return 403 / CORS rejection for the same reason.

  session.webRequest.onBeforeSendHeaders(
    SF_URL_FILTER,
    (details, callback) => {
      const requestHeaders: Record<string, string | string[]> = {
        ...details.requestHeaders,
      };

      // Delete both capitalised and lowercase variants defensively
      deleteHeader(requestHeaders, "Origin");
      deleteHeader(requestHeaders, "Referer");

      callback({ requestHeaders });
    }
  );

  // ── Response side ──────────────────────────────────────────────────────────
  //
  // The browser's CORS implementation checks response headers before letting
  // the renderer see the body.  We inject the permissive set here so all
  // Salesforce API responses (REST, Tooling, Bulk, Composite, SOAP) pass the
  // CORS check regardless of what the server actually returned.

  session.webRequest.onHeadersReceived(SF_URL_FILTER, (details, callback) => {
    const responseHeaders: Record<string, string | string[]> = {
      ...details.responseHeaders,
    };

    // ── Wipe existing CORS headers (prevents "multiple values" errors) ────────
    deleteHeader(responseHeaders, "access-control-allow-origin");
    deleteHeader(responseHeaders, "access-control-allow-headers");
    deleteHeader(responseHeaders, "access-control-allow-methods");
    deleteHeader(responseHeaders, "access-control-expose-headers");
    deleteHeader(responseHeaders, "access-control-allow-credentials");

    // ── Inject permissive CORS headers ────────────────────────────────────────
    responseHeaders["Access-Control-Allow-Origin"] = ["*"];
    responseHeaders["Access-Control-Allow-Methods"] = [
      "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    ];
    responseHeaders["Access-Control-Allow-Headers"] = [
      ALLOWED_REQUEST_HEADERS,
    ];
    // Expose all response headers to JS (e.g. Sforce-Limit-Info)
    responseHeaders["Access-Control-Expose-Headers"] = ["*"];

    // ── OPTIONS preflight: force 200 so the browser completes immediately ─────
    if (details.method === "OPTIONS") {
      callback({
        responseHeaders,
        statusLine: "HTTP/1.1 200 OK",
      });
      return;
    }

    callback({ responseHeaders });
  });

  console.log(
    "[salesforce-cors-bypass] webRequest hooks installed on",
    SF_URL_FILTER.urls.length,
    "URL patterns."
  );
}
