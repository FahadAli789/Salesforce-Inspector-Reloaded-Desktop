// ── Polyfills, globals & web bridge – must be the very first imports ────────
import "./services/web-api-bridge";
import "./setup-globals";
import "./polyfills/chrome-shim";
// ────────────────────────────────────────────────────────────────────────────

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found in index.html");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
