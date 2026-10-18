// src/renderer/components/MainMenuTabsSection.tsx
import React, { useState } from "react";
import { PopupSearchBar } from "./PopupSearchBar";
import { PopupUsersTab } from "./PopupUsersTab";

export type MainMenuTab = "objects" | "users" | "org" | "shortcuts";

export interface MainMenuTabsSectionProps {
  orgId: string;
  sfHost: string;
  currentUserId?: string;
  onInspectRecord: (sobject: string, recordId: string) => void;
  onOpenToolTab: (toolPage: string) => void;
  onNavigate?: () => void;
}

export const MainMenuTabsSection: React.FC<MainMenuTabsSectionProps> = ({
  orgId,
  sfHost,
  currentUserId,
  onInspectRecord,
  onOpenToolTab,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<MainMenuTab>("objects");

  const electronApi =
    (window as any).electronApi || (window as any).electronAPI;

  const handleOpenBrowser = (relUrl: string) => {
    if (electronApi?.openOrgFrontdoor) {
      electronApi.openOrgFrontdoor(orgId, relUrl);
    } else {
      window.open(`https://${sfHost}${relUrl}`, "_blank");
    }
    onNavigate?.();
  };

  const setupShortcuts = [
    { label: "Setup Home", path: "/lightning/setup/SetupOneHome/home", icon: "⚙️" },
    { label: "Object Manager", path: "/lightning/setup/ObjectManager/home", icon: "📦" },
    { label: "Flows", path: "/lightning/o/FlowRecord/list?filterName=All_FlowRecords", icon: "⚡" },
    { label: "Apex Classes", path: "/lightning/setup/ApexClasses/home", icon: "📄" },
    { label: "Custom Metadata", path: "/lightning/setup/CustomMetadata/home", icon: "🏷️" },
    { label: "Deployment Status", path: "/lightning/setup/DeployStatus/home", icon: "🚀" },
    { label: "Developer Console", path: "/_ui/common/apex/debug/ApexCSIPage", icon: "💻" },
    { label: "Company Info", path: "/lightning/setup/CompanyProfileInfo/home", icon: "🏢" },
  ];

  const orgTools = [
    {
      title: "Org Limits",
      desc: "Real-time API and Governor Limits consumption",
      icon: "📈",
      action: () => onOpenToolTab("limits.html"),
    },
    {
      title: "Explore API",
      desc: "Execute REST, Tooling, and GraphQL queries",
      icon: "🔌",
      action: () => onOpenToolTab("explore-api.html"),
    },
    {
      title: "Event Monitor",
      desc: "Stream Platform Events & Change Data Capture",
      icon: "📡",
      action: () => onOpenToolTab("event-monitor.html"),
    },
    {
      title: "Field Manager",
      desc: "Create and inspect custom fields across objects",
      icon: "🛠️",
      action: () => onOpenToolTab("field-manager.html"),
    },
    {
      title: "Company Info & Edition",
      desc: "Org edition, fiscal year, instance & licenses",
      icon: "🏢",
      action: () => handleOpenBrowser("/lightning/setup/CompanyProfileInfo/home"),
    },
    {
      title: "Deployment Status",
      desc: "Check active metadata deployments and test runs",
      icon: "🚀",
      action: () => handleOpenBrowser("/lightning/setup/DeployStatus/home"),
    },
  ];

  return (
    <div style={styles.container}>
      {/* ── 4-Tab Header from addon/popup.js: Objects | Users | Org | Shortcuts ── */}
      <div style={styles.tabBar}>
        {(
          [
            { id: "objects", label: "📦 Objects", desc: "SObjects & Records" },
            { id: "users", label: "👤 Users", desc: "User Details & LoginAs" },
            { id: "org", label: "🌐 Org", desc: "Limits & Platform Tools" },
            { id: "shortcuts", label: "⚡ Shortcuts", desc: "Salesforce Setup Links" },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tabButton,
                ...(isActive ? styles.tabButtonActive : {}),
              }}
            >
              <span style={styles.tabLabel}>{tab.label}</span>
              <span style={styles.tabSub}>{tab.desc}</span>
            </button>
          );
        })}
      </div>

      {/* ── Active Tab View ── */}
      <div style={styles.tabBody}>
        {activeTab === "objects" && (
          <div style={styles.tabPane}>
            <PopupSearchBar
              orgId={orgId}
              sfHost={sfHost}
              autoFocus
              onNavigate={onNavigate}
            />
          </div>
        )}

        {activeTab === "users" && (
          <div style={styles.tabPane}>
            <PopupUsersTab
              orgId={orgId}
              sfHost={sfHost}
              currentUserId={currentUserId}
              onInspectRecord={onInspectRecord}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {activeTab === "org" && (
          <div style={styles.orgGrid}>
            {orgTools.map((tool) => (
              <div
                key={tool.title}
                style={styles.toolCard}
                onClick={tool.action}
              >
                <div style={styles.toolCardTop}>
                  <span style={{ fontSize: 20 }}>{tool.icon}</span>
                  <span style={styles.toolCardTitle}>{tool.title}</span>
                </div>
                <span style={styles.toolCardDesc}>{tool.desc}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "shortcuts" && (
          <div style={styles.shortcutsGrid}>
            {setupShortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                style={styles.shortcutBtn}
                onClick={() => handleOpenBrowser(s.path)}
              >
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <span style={styles.shortcutLabel}>{s.label}</span>
                <span style={styles.shortcutArrow}>↗</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Core popup.js Quick Tool Buttons Bar ── */}
      <div style={styles.quickBar}>
        <button
          type="button"
          style={styles.quickToolBtn}
          onClick={() => onOpenToolTab("data-export.html")}
        >
          📊 Data Export
        </button>
        <button
          type="button"
          style={styles.quickToolBtn}
          onClick={() => onOpenToolTab("data-import.html")}
        >
          📥 Data Import
        </button>
        <button
          type="button"
          style={styles.quickToolBtn}
          onClick={() => onOpenToolTab("limits.html")}
        >
          📈 Org Limits
        </button>
        <button
          type="button"
          style={styles.quickToolBtn}
          onClick={() => onOpenToolTab("explore-api.html")}
        >
          🔌 Explore API
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  tabBar: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    borderBottom: "2px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: "8px 8px 0 0",
    overflow: "hidden",
  },
  tabButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 12px",
    border: "none",
    borderBottom: "2px solid transparent",
    backgroundColor: "transparent",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  tabButtonActive: {
    backgroundColor: "#ffffff",
    borderBottom: "2px solid #2563eb",
    boxShadow: "0 -2px 4px rgba(0,0,0,0.02)",
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "#0f172a",
  },
  tabSub: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },
  tabBody: {
    minHeight: 180,
  },
  tabPane: {
    width: "100%",
  },
  orgGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 10,
    padding: "6px 0",
  },
  toolCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    cursor: "pointer",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  toolCardTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  toolCardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#0f172a",
  },
  toolCardDesc: {
    fontSize: 11.5,
    color: "#64748b",
  },
  shortcutsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 8,
    padding: "6px 0",
  },
  shortcutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s ease",
  },
  shortcutLabel: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "#1e293b",
    flex: 1,
  },
  shortcutArrow: {
    fontSize: 12,
    color: "#94a3b8",
  },
  quickBar: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
    paddingTop: 10,
    borderTop: "1px solid #e2e8f0",
  },
  quickToolBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 12px",
    backgroundColor: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "#1e293b",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
};
