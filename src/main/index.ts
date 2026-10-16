import { app, BrowserWindow, shell, session } from "electron";
import { join } from "path";
import { registerAuthHandlers } from "./ipc/auth-handlers";
import { installSalesforceCorsBypass } from "./network/salesforce-cors-bypass";

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links in the default browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // In development, load from the Vite dev server; in production load the built file
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Install the Salesforce CORS bypass before any window is opened so every
  // XHR / fetch the renderer makes to Salesforce APIs passes CORS checks.
  installSalesforceCorsBypass(session.defaultSession);

  // Register all IPC handlers before any window is created
  registerAuthHandlers();

  createWindow();

  app.on("activate", () => {
    // On macOS re-create the window if the dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
