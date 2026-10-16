import React from "react";
import { useWorkspace, MainOrgTab } from "../state/workspace-store";
import { EnvType } from "../../shared/types/org";

const ENV_COLORS: Record<EnvType, { bg: string; text: string }> = {
  PROD: { bg: "#dc2626", text: "#ffffff" },
  UAT: { bg: "#d97706", text: "#ffffff" },
  SIT: { bg: "#7c3aed", text: "#ffffff" },
  DEV: { bg: "#2563eb", text: "#ffffff" },
  SANDBOX: { bg: "#d97706", text: "#ffffff" },
};

export function MainTabBar() {
  const { state, switchOrgTab, closeOrgTab, showLaunchpad } = useWorkspace();
  const isLaunchpadActive = state.activeOrgId === "LAUNCHPAD";
  const isMac = typeof window !== "undefined" && window.navigator.userAgent.includes("Mac");

  return (
    <header style={styles.tabBar} className="app-drag-region">
      {/* macOS window controls spacer */}
      {isMac && <div className="mac-traffic-lights-spacer" />}

      {/* Brand logo & title (Clicking also navigates to launchpad) */}
      <div
        style={styles.brand}
        className="app-no-drag"
        onClick={showLaunchpad}
        title="Go to Org Launchpad"
      >
        <img src="/addon/icon128.png" alt="SFIR" style={styles.logo} />
        <span style={styles.brandText}>SFIR</span>
      </div>

      {/* Scrollable list of open Main Org Tabs */}
      <div style={styles.tabsContainer} className="app-no-drag">
        {state.mainTabs.map((tab: MainOrgTab) => {
          const isActive = tab.orgId === state.activeOrgId;
          const envStyle = ENV_COLORS[tab.envType] || ENV_COLORS.DEV;

          return (
            <div
              key={tab.orgId}
              onClick={() => switchOrgTab(tab.orgId)}
              onAuxClick={(e) => {
                // Middle click closes the tab
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  closeOrgTab(tab.orgId);
                }
              }}
              title={`${tab.alias} (${tab.sfHost})\nMiddle-click to close`}
              style={{
                ...styles.tabItem,
                ...(isActive ? styles.activeTabItem : {}),
                borderTop: isActive ? `2px solid ${tab.color || envStyle.bg}` : "2px solid transparent",
              }}
            >
              {/* Environment badge */}
              <span
                style={{
                  ...styles.envBadge,
                  backgroundColor: envStyle.bg,
                  color: envStyle.text,
                }}
              >
                {tab.envType}
              </span>

              {/* Org Alias */}
              <span style={styles.tabTitle}>{tab.alias}</span>

              {/* Close button */}
              <button
                type="button"
                style={styles.closeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  closeOrgTab(tab.orgId);
                }}
                title="Close Tab"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Right Action: Launchpad / Connect Org Button */}
      <div style={styles.actions} className="app-no-drag">
        <button
          type="button"
          onClick={showLaunchpad}
          title="Open Org Launchpad & Add Connections"
          style={{
            ...styles.launchpadBtn,
            ...(isLaunchpadActive ? styles.activeLaunchpadBtn : {}),
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>+</span>
          <span>Orgs / Connect</span>
        </button>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    height: 40,
    background: "#0f172a",
    borderBottom: "1px solid #1e293b",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    gap: 8,
    userSelect: "none",
    flexShrink: 0,
    zIndex: 100,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    paddingRight: 10,
    borderRight: "1px solid #1e293b",
    flexShrink: 0,
    cursor: "pointer",
  },
  logo: {
    width: 18,
    height: 18,
  },
  brandText: {
    fontSize: 12.5,
    fontWeight: 800,
    letterSpacing: "-0.01em",
    color: "#f8fafc",
  },
  tabsContainer: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flex: 1,
    overflowX: "auto",
    height: "100%",
    paddingTop: 3,
  },
  tabItem: {
    height: 34,
    padding: "0 8px 0 8px",
    background: "#131c31",
    borderRadius: "6px 6px 0 0",
    display: "flex",
    alignItems: "center",
    gap: 7,
    cursor: "pointer",
    fontSize: 12.5,
    color: "#94a3b8",
    maxWidth: 220,
    minWidth: 110,
    transition: "background 0.12s ease, color 0.12s ease",
    border: "1px solid #1e2a44",
    borderBottom: "none",
    boxSizing: "border-box",
  },
  activeTabItem: {
    background: "#1e293b",
    color: "#ffffff",
    fontWeight: 600,
    border: "1px solid #2d3f60",
    borderBottom: "1px solid #1e293b",
    boxShadow: "0 -2px 6px rgba(0,0,0,0.15)",
  },
  envBadge: {
    fontSize: 9.5,
    fontWeight: 800,
    padding: "2px 5px",
    borderRadius: 3.5,
    letterSpacing: "0.04em",
    lineHeight: 1,
    flexShrink: 0,
  },
  tabTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
    fontSize: 12,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: 11,
    padding: "2px 4px",
    borderRadius: 3,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    paddingLeft: 6,
    flexShrink: 0,
  },
  launchpadBtn: {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 6,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "all 0.12s ease",
  },
  activeLaunchpadBtn: {
    background: "#2563eb",
    borderColor: "#3b82f6",
    color: "#ffffff",
    boxShadow: "0 0 10px rgba(37,99,235,0.4)",
  },
};
