import React from "react";
import { useWorkspace, MainOrgTab, SubTabInstance, ToolType } from "../state/workspace-store";
import { EnvType } from "../../shared/types/org";

interface SubTabBarProps {
  orgTab: MainOrgTab;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const ENV_COLORS: Record<EnvType, string> = {
  PROD: "#dc2626",
  UAT: "#d97706",
  SIT: "#7c3aed",
  DEV: "#2563eb",
  SANDBOX: "#d97706",
};

const TOOL_ICONS: Record<ToolType, string> = {
  "data-export": "⚡",
  "data-import": "📥",
  "inspect": "🔍",
  "limits": "📊",
  "explore-api": "🌐",
  "event-monitor": "📡",
  "field-creator": "🛠",
};

const TOOL_SHORTCUTS: { type: ToolType; label: string }[] = [
  { type: "data-export", label: "+ Export" },
  { type: "data-import", label: "+ Import" },
  { type: "inspect", label: "+ Inspect" },
  { type: "limits", label: "+ Limits" },
  { type: "explore-api", label: "+ Explore API" },
  { type: "event-monitor", label: "+ Events" },
  { type: "field-creator", label: "+ Field Creator" },
];

export function SubTabBar({
  orgTab,
  isSidebarOpen = true,
  onToggleSidebar,
}: SubTabBarProps) {
  const { switchSubTab, closeSubTab, openSubTab } = useWorkspace();
  const envColor = ENV_COLORS[orgTab.envType] || "#2563eb";

  const handleOpenInBrowser = () => {
    const electronApi = (window as any).electronApi;
    if (electronApi?.openOrgFrontdoor) {
      electronApi.openOrgFrontdoor(orgTab.orgId);
    } else if (electronApi?.openExternal) {
      electronApi.openExternal("https://" + orgTab.sfHost);
    } else {
      window.open("https://" + orgTab.sfHost, "_blank");
    }
  };

  return (
    <div
      style={{
        ...styles.subTabBar,
        borderTop: `3px solid ${envColor}`,
      }}
    >
      {/* ── Left Side: Org context & Open in Browser button ── */}
      <div style={styles.leftContext}>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={
              isSidebarOpen
                ? "Collapse Inspector Menu"
                : "Expand Inspector Menu"
            }
            style={{
              ...styles.openBrowserBtn,
              backgroundColor: isSidebarOpen ? "#1e293b" : "#334155",
              color: "#f8fafc",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {isSidebarOpen ? "◀ Inspector Menu" : "▶ Inspector Menu"}
          </button>
        )}
        <span
          style={{
            ...styles.envBadge,
            backgroundColor: envColor,
          }}
        >
          {orgTab.envType}
        </span>
        <span style={styles.orgLabel} title={`${orgTab.alias} (${orgTab.sfHost})`}>
          <strong>{orgTab.alias}</strong> <span style={{ opacity: 0.65, fontSize: 11.5 }}>({orgTab.sfHost})</span>
        </span>
        <button
          type="button"
          style={styles.openBrowserBtn}
          onClick={handleOpenInBrowser}
          title="Open Salesforce in external browser with Auto-Login"
        >
          ↗ Open in Browser
        </button>
      </div>

      {/* ── Center: Scrollable Sub-Tab Strip ── */}
      <div style={styles.tabStrip}>
        {/* Dedicated Home / Menu Tab */}
        <div
          onClick={() => switchSubTab(orgTab.orgId, "HOME")}
          title="Salesforce Inspector Home / Quick Actions"
          style={{
            ...styles.subTabItem,
            ...(orgTab.activeSubTabId === "HOME"
              ? {
                  ...styles.activeSubTabItem,
                  borderBottom: `2px solid ${envColor}`,
                }
              : {}),
          }}
        >
          <span style={{ fontSize: 12 }}>🏠</span>
          <span style={styles.subTabTitle}>Inspector Home</span>
        </div>
        {orgTab.subTabs.map((subTab: SubTabInstance) => {
          const isActive = subTab.subTabId === orgTab.activeSubTabId;
          const icon = TOOL_ICONS[subTab.toolType] || "📄";

          return (
            <div
              key={subTab.subTabId}
              onClick={() => switchSubTab(orgTab.orgId, subTab.subTabId)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  closeSubTab(orgTab.orgId, subTab.subTabId);
                }
              }}
              title={`${subTab.title}\nMiddle-click to close`}
              style={{
                ...styles.subTabItem,
                ...(isActive ? styles.activeSubTabItem : {}),
              }}
            >
              <span style={{ fontSize: 12 }}>{icon}</span>
              <span style={styles.subTabTitle}>{subTab.title}</span>
              <button
                type="button"
                style={styles.closeSubBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  closeSubTab(orgTab.orgId, subTab.subTabId);
                }}
                title="Close Sub-Tab"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Right Side: Quick Tool Launcher Strip ── */}
      <div style={styles.quickLaunchStrip}>
        {TOOL_SHORTCUTS.map(s => (
          <button
            key={s.type}
            type="button"
            style={styles.toolBtn}
            onClick={() => openSubTab(orgTab.orgId, s.type)}
            title={`Open new ${s.label.replace("+ ", "")} sub-tab`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  subTabBar: {
    height: 38,
    background: "#f8fafc",
    borderBottom: "1px solid #cbd5e1",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 8,
    userSelect: "none",
    flexShrink: 0,
    zIndex: 90,
    boxSizing: "border-box",
    color: "#0f172a",
  },
  leftContext: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    paddingRight: 10,
    borderRight: "1px solid #e2e8f0",
    flexShrink: 0,
    maxWidth: 290,
  },
  envBadge: {
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: 800,
    padding: "2px 5px",
    borderRadius: 3.5,
    letterSpacing: "0.05em",
    lineHeight: 1,
    flexShrink: 0,
  },
  orgLabel: {
    fontSize: 12,
    color: "#0f172a",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  openBrowserBtn: {
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    color: "#334155",
    fontSize: 10.5,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  tabStrip: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flex: 1,
    overflowX: "auto",
    height: "100%",
  },
  subTabItem: {
    height: 27,
    padding: "0 7px 0 9px",
    background: "#e2e8f0",
    borderRadius: 5,
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    fontSize: 12,
    color: "#334155",
    maxWidth: 180,
    minWidth: 90,
    border: "1px solid #cbd5e1",
    transition: "all 0.1s ease",
    boxSizing: "border-box",
  },
  activeSubTabItem: {
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 600,
    border: "1px solid #94a3b8",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  subTabTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  closeSubBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: 10,
    padding: "2px 3px",
    borderRadius: 3,
    cursor: "pointer",
    lineHeight: 1,
    marginLeft: 1,
  },
  quickLaunchStrip: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    paddingLeft: 6,
    borderLeft: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  toolBtn: {
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    color: "#0f172a",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 7px",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.1s ease",
  },
};
