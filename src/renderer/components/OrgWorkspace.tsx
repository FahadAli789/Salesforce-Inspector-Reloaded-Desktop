import React, { useState, useRef, useEffect } from "react";
import { MainOrgTab, useWorkspace } from "../state/workspace-store";
import { SubTabBar } from "./SubTabBar";
import { LegacyToolHost } from "./LegacyToolHost";
import { parseInternalToolLink } from "../services/navigation-interceptor";

export interface OrgWorkspaceProps {
  orgTab: MainOrgTab;
  isActive: boolean;
}

export function OrgWorkspace({ orgTab, isActive }: OrgWorkspaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const popupIframeRef = useRef<HTMLIFrameElement | null>(null);
  const { openSubTab } = useWorkspace();

  const isHomeActive =
    orgTab.activeSubTabId === "HOME" || orgTab.subTabs.length === 0;

  const cleanHost = (orgTab.sfHost || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");

  // Listen for messages from popup.html and tool iframes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 1. Respond to popup.html's initialization request
      if (event.data?.insextInitRequest) {
        if (popupIframeRef.current?.contentWindow) {
          popupIframeRef.current.contentWindow.postMessage(
            {
              insextLoaded: true,
              insextInitResponse: true,
              sfHost: cleanHost,
              inDevConsole: false,
              inLightning: true,
              inInspector: true,
            },
            "*"
          );
        }
      }

      // 2. Intercept internal tool navigation (e.g. clicking Data Export, Show All Data in popup)
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

      // 3. Intercept lightningNavigate from popup.js
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
    return () => window.removeEventListener("message", handleMessage);
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
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
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
          backgroundColor: isHomeActive ? "#090d16" : "#ffffff",
        }}
      >
        {/* 
          Left/Centered Popup Container:
          In HOME mode: expands to fill workspace and centers the popup card
          In SUB-TAB mode: docks as a left 300px side-panel
          The <iframe> is NEVER unmounted or reloaded during mode transitions!
        */}
        <div
          className="org-popup-container"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: isHomeActive ? "center" : "stretch",
            justifyContent: isHomeActive ? "center" : "flex-start",
            width: isHomeActive ? "100%" : isSidebarOpen ? 300 : 0,
            minWidth: isHomeActive ? "100%" : isSidebarOpen ? 300 : 0,
            height: "100%",
            backgroundColor: isHomeActive ? "#090d16" : "#ffffff",
            borderRight:
              !isHomeActive && isSidebarOpen ? "1px solid #1e293b" : "none",
            transition: "width 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            overflow: "hidden",
            position: "relative",
            zIndex: 10,
          }}
        >
          <div
            className="popup-frame-wrapper"
            style={{
              width: isHomeActive ? 380 : 300,
              maxWidth: "100%",
              height: isHomeActive ? "92%" : "100%",
              maxHeight: isHomeActive ? 720 : "none",
              borderRadius: isHomeActive ? 12 : 0,
              boxShadow: isHomeActive
                ? "0 20px 48px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)"
                : "none",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#ffffff",
              transition:
                "width 0.2s ease, border-radius 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <iframe
              ref={popupIframeRef}
              src={`/addon/popup.html?host=${encodeURIComponent(
                cleanHost
              )}&orgId=${encodeURIComponent(orgTab.orgId)}`}
              title="Salesforce Inspector Popup"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                backgroundColor: "#ffffff",
              }}
            />
          </div>
        </div>

        {/* 
          Right Sub-Tab Viewport:
          Hidden when HOME is active; visible when working inside subtabs
          All subtabs remain mounted persistently
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
          {orgTab.subTabs.map(subTab => (
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
