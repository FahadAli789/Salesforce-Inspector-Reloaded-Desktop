import { resolve, extname } from "path";
import * as fs from "fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./src/server/api-router";

function serveAndCopyAddonPlugin(): Plugin {
  const addonDir = resolve(__dirname, "addon");
  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".json": "application/json; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };

  const setupMiddlewares = (middlewares: any) => {
    // 1. API router and Salesforce reverse proxy
    middlewares.use(async (req: any, res: any, next: any) => {
      try {
        const handled = await handleApiRequest(req, res);
        if (!handled) {
          next();
        }
      } catch (err) {
        console.error("[api-router] Uncaught middleware error:", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      }
    });

    // 2. Addon static files with chrome-shim.js injection for HTML
    middlewares.use((req: any, res: any, next: any) => {
      const rawUrl = req.url ? req.url.split("?")[0] : "";
      if (rawUrl.startsWith("/addon/")) {
        const relPath = rawUrl.replace(/^\/addon\//, "");
        const filePath = resolve(addonDir, decodeURIComponent(relPath));
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = extname(filePath).toLowerCase();
          const mimeType = mimeTypes[ext] || "application/octet-stream";
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Cache-Control", "no-cache");

          if (ext === ".html") {
            let html = fs.readFileSync(filePath, "utf-8");
            if (!html.includes("chrome-shim.js")) {
              if (html.includes("<head>")) {
                html = html.replace("<head>", '<head>\n  <script src="chrome-shim.js"></script>');
              } else {
                html = '<script src="chrome-shim.js"></script>\n' + html;
              }
            }
            res.end(html);
            return;
          }

          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
      next();
    });
  };

  return {
    name: "serve-and-copy-addon",
    configureServer(server) {
      setupMiddlewares(server.middlewares);
    },
    configurePreviewServer(previewServer) {
      setupMiddlewares(previewServer.middlewares);
    },
    closeBundle() {
      const outDir = resolve(__dirname, "dist/addon");
      if (fs.existsSync(addonDir)) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.cpSync(addonDir, outDir, { recursive: true });

        // Ensure all HTML files in outDir include chrome-shim.js
        try {
          const files = fs.readdirSync(outDir);
          for (const f of files) {
            if (f.endsWith(".html")) {
              const fullPath = resolve(outDir, f);
              let content = fs.readFileSync(fullPath, "utf-8");
              if (!content.includes("chrome-shim.js")) {
                if (content.includes("<head>")) {
                  content = content.replace("<head>", '<head>\n  <script src="chrome-shim.js"></script>');
                } else {
                  content = '<script src="chrome-shim.js"></script>\n' + content;
                }
                fs.writeFileSync(fullPath, content, "utf-8");
              }
            }
          }
        } catch {}

        console.log(`[serveAndCopyAddonPlugin] Copied and verified addon directory at ${outDir}`);
      }
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@addon": resolve(__dirname, "addon"),
      "@renderer": resolve(__dirname, "src/renderer"),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [
        resolve(__dirname, "src"),
        resolve(__dirname, "addon"),
      ],
    },
  },
  plugins: [react(), serveAndCopyAddonPlugin()],
});
