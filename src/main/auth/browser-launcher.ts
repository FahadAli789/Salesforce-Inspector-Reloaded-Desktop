// src/main/auth/browser-launcher.ts
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openExternalInOs } from "./oauth-service";

export type HostBrowserType = "chrome" | "edge" | "default";
export type IsolationMode = "incognito" | "isolated-profile";

export interface LaunchIsolatedOptions {
  url: string;
  browserHint?: HostBrowserType;
  userAgent?: string;
  isolationMode?: IsolationMode;
  profileTag?: string; // e.g., target Salesforce User Id for multi-user isolation
}

/**
 * Determines whether the request originated from Microsoft Edge or Google Chrome.
 * Always check Edge first because Edge's User-Agent also contains "Chrome/".
 */
export function resolveBrowserType(
  browserHint?: HostBrowserType,
  userAgent?: string
): HostBrowserType {
  if (browserHint === "edge" || browserHint === "chrome") {
    return browserHint;
  }
  const ua = userAgent || "";
  if (/\bEdg\//i.test(ua)) {
    return "edge";
  }
  if (/\bChrome\//i.test(ua) && !/\bChromium\//i.test(ua)) {
    return "chrome";
  }
  return "chrome"; // Default to Chrome for Chromium localhost environments
}

function findWindowsBinary(browser: "chrome" | "edge"): string | null {
  const prefixes = [
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
    process.env.LOCALAPPDATA,
  ].filter(Boolean) as string[];

  const subPath =
    browser === "edge"
      ? join("Microsoft", "Edge", "Application", "msedge.exe")
      : join("Google", "Chrome", "Application", "chrome.exe");

  for (const prefix of prefixes) {
    const candidate = join(prefix, subPath);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findMacAppBundle(browser: "chrome" | "edge"): string | null {
  const appName =
    browser === "edge" ? "Microsoft Edge.app" : "Google Chrome.app";
  const candidates = [
    join("/Applications", appName),
    join(process.env.HOME || "", "Applications", appName),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Launches a URL in an isolated browser session (Incognito/InPrivate or ephemeral profile)
 * using child_process.spawn with an argument array to prevent URL "&" truncation.
 */
export async function openIsolatedBrowserSession(
  options: LaunchIsolatedOptions
): Promise<void> {
  const {
    url,
    browserHint,
    userAgent,
    isolationMode = "incognito",
    profileTag,
  } = options;

  const browser = resolveBrowserType(browserHint, userAgent);
  if (browser === "default") {
    await openExternalInOs(url);
    return;
  }

  const browserArgs: string[] = [];

  if (isolationMode === "isolated-profile") {
    const safeTag = (profileTag || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");
    const tempProfileDir = join(tmpdir(), `sird-profile-${safeTag}`);
    try {
      mkdirSync(tempProfileDir, { recursive: true });
    } catch {
      // Directory already exists
    }
    browserArgs.push(
      `--user-data-dir=${tempProfileDir}`,
      "--no-first-run",
      "--no-default-browser-check"
    );
  } else {
    browserArgs.push(browser === "edge" ? "--inprivate" : "--incognito");
  }

  browserArgs.push("--new-window", url);

  const platform = process.platform;

  try {
    if (platform === "darwin") {
      const appBundle = findMacAppBundle(browser);
      const appTarget =
        appBundle ||
        (browser === "edge" ? "Microsoft Edge" : "Google Chrome");

      // On macOS, `open -na <App> --args ...` spawns a clean instance and passes
      // the URL directly via argv without shell evaluation.
      const child = spawn("open", ["-na", appTarget, "--args", ...browserArgs], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return;
    }

    if (platform === "win32") {
      const binaryPath = findWindowsBinary(browser);
      if (binaryPath) {
        const child = spawn(binaryPath, browserArgs, {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });
        child.unref();
        return;
      }

      // Fallback if installed in non-standard path registered only in App Paths
      const exeName = browser === "edge" ? "msedge" : "chrome";
      const child = spawn(
        "cmd.exe",
        ["/d", "/s", "/c", "start", "", exeName, ...browserArgs],
        {
          detached: true,
          stdio: "ignore",
          windowsVerbatimArguments: false,
        }
      );
      child.unref();
      return;
    }

    // Linux fallback
    const linuxBin =
      browser === "edge" ? "microsoft-edge" : "google-chrome";
    const child = spawn(linuxBin, browserArgs, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    console.error("[browser-launcher] Isolated launch failed, falling back:", err);
    await openExternalInOs(url);
  }
}
