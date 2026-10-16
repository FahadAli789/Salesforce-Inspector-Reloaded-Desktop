import React, { useEffect } from "react";
import "./styles/desktop-shell.css";

import { WorkspaceProvider, useWorkspace } from "./state/workspace-store";
import { MainTabBar } from "./components/MainTabBar";
import { OrgLaunchpad } from "./components/OrgLaunchpad";
import { OrgWorkspace } from "./components/OrgWorkspace";
import { parseInternalToolLink } from "./services/navigation-interceptor";

function WorkspaceView() {
  const { state, openSubTab, closeSubTab, showLaunchpad } = useWorkspace();
  const { activeOrgId, mainTabs } = state;

  // Listen for internal tool navigation messages from addon iframes
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "SFIR_OPEN_SUBTAB") {
        const { orgId, href } = e.data;
        if (!orgId || !href) return;
        const parsed = parseInternalToolLink(href);
        if (parsed) {
          openSubTab(orgId, parsed.toolType, parsed.params, parsed.title);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [openSubTab]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      const key = e.key.toLowerCase();

      // Cmd/Ctrl + Shift + N: Switches to OrgLaunchpad
      if (e.shiftKey && key === "n") {
        e.preventDefault();
        showLaunchpad();
        return;
      }

      // If Shift or Alt is pressed, ignore subsequent shortcuts
      if (e.shiftKey || e.altKey) return;

      // Cmd/Ctrl + T: Opens a new 'data-export' Sub-Tab in the active Org
      if (key === "t") {
        if (activeOrgId && activeOrgId !== "LAUNCHPAD") {
          e.preventDefault();
          openSubTab(activeOrgId, "data-export");
        }
        return;
      }

      // Cmd/Ctrl + W: Closes the active Sub-Tab in the active Org
      if (key === "w") {
        if (activeOrgId && activeOrgId !== "LAUNCHPAD") {
          const currentOrg = mainTabs.find(t => t.orgId === activeOrgId);
          if (currentOrg && currentOrg.activeSubTabId) {
            e.preventDefault();
            closeSubTab(currentOrg.orgId, currentOrg.activeSubTabId);
          }
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeOrgId, mainTabs, openSubTab, closeSubTab, showLaunchpad]);

  return (
    <div
      id="app-root"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "#090d16",
      }}
    >
      {/* Top 40px Horizontal Multi-Org Tab Bar */}
      <MainTabBar />

      {/* Main Multi-Tenant Viewport Body */}
      <div
        className="main-content-area"
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          width: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Landing Page: Org Launchpad */}
        <OrgLaunchpad />

        {/* 
          Main Org Workspaces:
          STRICT CONSTRAINT: NEVER unmount open Main Org Tabs when switching tabs.
          Always keep all open Main Org Tabs mounted in the DOM and toggle visibility
          strictly with style={{ display: isActive ? 'flex' : 'none' }}.
        */}
        {mainTabs.map(orgTab => (
          <OrgWorkspace
            key={orgTab.orgId}
            orgTab={orgTab}
            isActive={activeOrgId === orgTab.orgId}
          />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <WorkspaceView />
    </WorkspaceProvider>
  );
}
