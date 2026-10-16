import { resolve, extname } from "path";
import * as fs from "fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

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

  return {
    name: "serve-and-copy-addon",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ? req.url.split("?")[0] : "";
        if (rawUrl.startsWith("/addon/")) {
          const relPath = rawUrl.replace(/^\/addon\//, "");
          const filePath = resolve(addonDir, decodeURIComponent(relPath));
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = extname(filePath).toLowerCase();
            const mimeType = mimeTypes[ext] || "application/octet-stream";
            res.setHeader("Content-Type", mimeType);
            res.setHeader("Cache-Control", "no-cache");
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    },
    closeBundle() {
      const outDir = resolve(__dirname, "out/renderer/addon");
      if (fs.existsSync(addonDir)) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.cpSync(addonDir, outDir, { recursive: true });
        console.log(`[serveAndCopyAddonPlugin] Copied addon directory to ${outDir}`);
      }
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
      },
    },
  },

  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
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
      fs: {
        // Allow Vite dev server to serve files from both src/ and addon/
        allow: [
          resolve(__dirname, "src"),
          resolve(__dirname, "addon"),
        ],
      },
    },
    plugins: [react(), serveAndCopyAddonPlugin()],
  },
});
