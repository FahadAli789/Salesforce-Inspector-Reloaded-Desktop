import React, { useState, useEffect, useMemo } from "react";
import { MainOrgTab, useWorkspace } from "../state/workspace-store";
import { SubTabBar } from "./SubTabBar";
import { LegacyToolHost } from "./LegacyToolHost";
import { parseInternalToolLink } from "../services/navigation-interceptor";
import { normalizeSfHost } from "../utils/normalize-host";
import { DevTabDashboard } from "./DevTabDashboard";
import { PopupSearchBar } from "./PopupSearchBar";

export interface OrgWorkspaceProps {
  orgTab: MainOrgTab;
  isActive: boolean;
}

export function OrgWorkspace({ orgTab, isActive }: OrgWorkspaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { openSubTab } = useWorkspace();

  const isHomeActive =
    orgTab.activeSubTabId === "HOME" || orgTab.subTabs.length === 0;

  const cleanHost = useMemo(() => normalizeSfHost(orgTab.sfHost), [orgTab.sfHost]);

  // Layer 2: Proactive Startup & Tab Activation Check
  // Validates token against Salesforce APIs on mount/wake; auto-refreshes if expired
  useEffect(() => {
    if (!isActive) return;
    const electronApi = (window as any).electronApi;
    if (electronApi?.validateSession) {
      electronApi
        .validateSession({ orgId: orgTab.orgId, sfHost: cleanHost })
        .then((session: any) => {
          if (session?.key) {
            try {
              localStorage.setItem(`${cleanHost}_access_token`, session.key);
            } catch {}
          }
        })
        .catch((err: any) => {
          console.warn("[OrgWorkspace] Proactive session validation:", err);
        });
    }
  }, [cleanHost, orgTab.orgId, isActive]);

  // Listen for messages from tool iframes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 1. Intercept internal tool navigation (e.g. clicking Data Export, Show All Data)
      if (
        event.data?.type === "SFIR_OPEN_SUBTAB" &&
        (!event.data.orgId || event.data.orgId === orgTab.orgId)
      ) {
        const href = event.data.href;
        if (href) {
          const parsed = parseInternalToolLink(href);
          if (parsed) {
            openSubTab(orgTab.orgId, parsed.toolType, parsed.params, parsed.title);
          }
        }
      }

      // 2. Intercept lightningNavigate from tools
      if (event.data?.lightningNavigate) {
        const fallbackURL =
          event.data.lightningNavigate.fallbackURL ||
          event.data.lightningNavigate.url;
        if (fallbackURL) {
          try {
            const parsed = new URL(fallbackURL, `https://${cleanHost}`);
            const retUrl = parsed.pathname + parsed.search + parsed.hash;
            const electronApi = (window as any).electronApi;
            if (electronApi?.openOrgFrontdoor) {
              electronApi.openOrgFrontdoor(orgTab.orgId, retUrl);
            }
          } catch {
            // fallback
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [cleanHost, orgTab.orgId, openSubTab]);

  return (
    <div
      className="org-workspace"
      style={{
        display: isActive ? "flex" : "none",
        flexDirection: "column",
        flex: 1,
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        borderTop: orgTab.envType === "PROD" ? "3px solid #dc2626" : undefined,
      }}
    >
      {/* SubTabBar with Home tab and Sidebar Toggle */}
      <SubTabBar
        orgTab={orgTab}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
      />

      {/* Split horizontal workspace body */}
      <div
        className="org-workspace-body"
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          position: "relative",
          backgroundColor: "#ffffff",
        }}
      >
        {/* 
          1. Dedicated Native Dev Tab Dashboard (HOME mode):
          Renders the native React dashboard with Smart Popup Search Bar,
          15/18-char ID resolver, tools grid, and setup shortcuts.
        */}
        {isHomeActive && (
          <DevTabDashboard orgTab={orgTab} />
        )}

        {/* 
          2. Compact Quick Search Sidebar (SUB-TAB mode):
          Allows quick lookup without leaving the active subtab when toggled.
        */}
        {!isHomeActive && isSidebarOpen && (
          <div
            className="org-popup-sidebar"
            style={{
              width: 320,
              minWidth: 320,
              height: "100%",
              backgroundColor: "#ffffff",
              borderRight: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              padding: "16px",
              overflowY: "auto",
              boxShadow: "2px 0 8px rgba(0,0,0,0.03)",
              zIndex: 10,
            }}
          >
            <div
              style={{
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                Quick Search & ID Resolver
              </span>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#64748b",
                  fontSize: 14,
                }}
                title="Collapse sidebar"
              >
                ✕
              </button>
            </div>
            <PopupSearchBar
              orgId={orgTab.orgId}
              sfHost={cleanHost}
              autoFocus={false}
            />
          </div>
        )}

        {/* 
          3. Sub-Tab Viewport:
          Hidden when HOME is active; visible when working inside subtabs.
          All subtabs remain mounted persistently.
        */}
        <div
          className="org-subtab-viewport"
          style={{
            display: isHomeActive ? "none" : "flex",
            flex: 1,
            minHeight: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {orgTab.subTabs.map((subTab) => (
            <LegacyToolHost
              key={subTab.subTabId}
              orgId={orgTab.orgId}
              sfHost={cleanHost}
              envType={orgTab.envType}
              subTab={subTab}
              isVisible={subTab.subTabId === orgTab.activeSubTabId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
