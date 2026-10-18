/**
 * src/renderer/services/web-api-bridge.ts
 *
 * Browser-side bridge that exposes window.electronApi and window.electronAPI
 * identical to the former Electron preload script.
 * Calls /api/ipc/:action via HTTP POST so that all renderer and addon code
 * runs seamlessly in a standard web browser.
 */

import type {
  OrgProfile,
  SfSessionPayload,
  EnvType,
} from "../../shared/types/org";

export interface LoginOAuthPayload {
  loginUrl: string;
  alias: string;
  orgType: EnvType;
  color?: string;
  clientId?: string;
}

export interface LoginManualPayload {
  sfHost: string;
  sessionId: string;
  alias: string;
  orgType: EnvType;
  color?: string;
}

export interface GetSessionPayload {
  orgId?: string;
  sfHost?: string;
}

export type HostBrowserType = "chrome" | "edge" | "default";
export type IsolationMode = "incognito" | "isolated-profile";

export interface LoginAsUserPayload {
  orgId: string;
  targetUserId: string;
  networkId?: string;
  retUrl?: string;
  targetUrl?: string;
  isolationMode?: IsolationMode;
}

export function detectClientBrowser(): HostBrowserType {
  if (typeof navigator === "undefined") return "default";
  const uaData = (navigator as any).userAgentData;
  if (uaData?.brands && Array.isArray(uaData.brands)) {
    const brands = uaData.brands.map((b: any) => (b.brand || "").toLowerCase());
    if (brands.some((b: string) => b.includes("edge"))) return "edge";
    if (brands.some((b: string) => b.includes("google chrome"))) return "chrome";
  }
  const ua = navigator.userAgent || "";
  if (/\bEdg\//i.test(ua)) return "edge";
  if (/\bChrome\//i.test(ua)) return "chrome";
  return "default";
}

export interface ElectronApiBridge {
  loginWithOAuth: (payload: LoginOAuthPayload) => Promise<OrgProfile>;
  loginWithManualSession: (payload: LoginManualPayload) => Promise<OrgProfile>;
  loginManual: (payload: LoginManualPayload) => Promise<OrgProfile>;
  getSession: (payload: GetSessionPayload) => Promise<SfSessionPayload | null>;
  refreshSession: (payload: { orgId?: string; sfHost?: string }) => Promise<SfSessionPayload | null>;
  validateSession: (payload: { orgId?: string; sfHost?: string }) => Promise<SfSessionPayload | null>;
  listOrgs: () => Promise<OrgProfile[]>;
  removeOrg: (payload: { orgId: string }) => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  openOrgFrontdoor: (orgId: string, retUrl?: string) => Promise<void>;
  openIncognito: (
    url: string,
    isolationMode?: IsolationMode
  ) => Promise<void>;
  loginAsUser: (
    payload: LoginAsUserPayload
  ) => Promise<{ url: string }>;
  importSfdxOrgs: () => Promise<OrgProfile[]>;
  sfRestRequest: (args: {
    sfHost: string;
    path: string;
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  }) => Promise<any>;
  sfSoapRequest: (args: {
    sfHost: string;
    path: string;
    soapAction?: string;
    xmlBody: string;
    headers?: Record<string, string>;
  }) => Promise<{ status: number; data: string }>;
}

declare global {
  interface Window {
    electronApi: ElectronApiBridge;
    electronAPI: ElectronApiBridge;
  }
}

async function invokeIpc<T = any>(channel: string, payload?: unknown): Promise<T> {
  const res = await fetch(`/api/ipc/${encodeURIComponent(channel)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `IPC call ${channel} failed with status ${res.status}`);
  }
  return data?.result as T;
}

export const webApiBridge: ElectronApiBridge = {
  loginWithOAuth: (payload: LoginOAuthPayload): Promise<OrgProfile> =>
    invokeIpc<OrgProfile>("auth:login-oauth", payload),

  loginWithManualSession: (payload: LoginManualPayload): Promise<OrgProfile> =>
    invokeIpc<OrgProfile>("auth:login-manual", payload),

  loginManual: (payload: LoginManualPayload): Promise<OrgProfile> =>
    invokeIpc<OrgProfile>("auth:login-manual", payload),

  getSession: (payload: GetSessionPayload): Promise<SfSessionPayload | null> =>
    invokeIpc<SfSessionPayload | null>("auth:get-session", payload),

  refreshSession: (payload: {
    orgId?: string;
    sfHost?: string;
  }): Promise<SfSessionPayload | null> =>
    invokeIpc<SfSessionPayload | null>("auth:refresh-session", payload),

  validateSession: (payload: {
    orgId?: string;
    sfHost?: string;
  }): Promise<SfSessionPayload | null> =>
    invokeIpc<SfSessionPayload | null>("auth:validate-session", payload),

  listOrgs: (): Promise<OrgProfile[]> =>
    invokeIpc<OrgProfile[]>("auth:list-orgs"),

  removeOrg: (payload: { orgId: string }): Promise<boolean> =>
    invokeIpc<boolean>("auth:remove-org", payload),

  openExternal: (url: string): Promise<void> =>
    invokeIpc<void>("shell:open-external", typeof url === "string" ? { url } : url),

  openOrgFrontdoor: (orgId: string, retUrl?: string): Promise<void> =>
    invokeIpc<void>("auth:open-org-frontdoor", { orgId, retUrl }),

  openIncognito: (
    url: string,
    isolationMode: IsolationMode = "incognito"
  ): Promise<void> =>
    invokeIpc<void>("shell:open-incognito", {
      url,
      browserHint: detectClientBrowser(),
      isolationMode,
    }),

  loginAsUser: (payload: LoginAsUserPayload): Promise<{ url: string }> =>
    invokeIpc<{ url: string }>("auth:login-as-user", {
      ...payload,
      browserHint: detectClientBrowser(),
    }),

  importSfdxOrgs: (): Promise<OrgProfile[]> =>
    invokeIpc<OrgProfile[]>("auth:import-sfdx-orgs"),

  sfRestRequest: (args: {
    sfHost: string;
    path: string;
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  }): Promise<any> => invokeIpc("sf:rest-request", args),

  sfSoapRequest: (args: {
    sfHost: string;
    path: string;
    soapAction?: string;
    xmlBody: string;
    headers?: Record<string, string>;
  }): Promise<{ status: number; data: string }> =>
    invokeIpc<{ status: number; data: string }>("sf:soap-request", args),
};

// Expose on both window.electronApi and window.electronAPI
if (typeof window !== "undefined") {
  (window as any).electronApi = webApiBridge;
  (window as any).electronAPI = webApiBridge;
}
