/**
 * setup-globals.ts
 *
 * Exposes React and ReactDOM as browser globals so that legacy addon/*.js
 * files that call `React.createElement(...)` or `ReactDOM.render(...)` without
 * an explicit import continue to work inside the Electron renderer.
 *
 * This file must be imported BEFORE any addon script is executed.
 */

import React from "react";
import ReactDOM from "react-dom";

// Attach to window so UMD/global-style addon code can find them
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;
