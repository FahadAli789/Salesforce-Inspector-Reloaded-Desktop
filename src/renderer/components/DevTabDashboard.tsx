import React, { useState, useEffect } from "react";
import { useWorkspace, MainOrgTab } from "../state/workspace-store";
import { toolDefinitions, ToolType } from "../services/tool-registry";
import { PopupSearchBar } from "./PopupSearchBar";

interface DevTabDashboardProps {
  orgTab: MainOrgTab;
}

export function DevTabDashboard({ orgTab }: DevTabDashboardProps) {
  const { openSubTab } = useWorkspace();
  const [limitsSummary, setLimitsSummary] = useState<{
    dailyApiRemaining?: number;
    dailyApiMax?: number;
  }>({});

  const envColor =
    orgTab.envType === "PROD"
      ? "#dc2626"
      : orgTab.envType === "SANDBOX"
      ? "#d97706"
      : "#2563eb";

  // Fetch quick API limits snapshot
  useEffect(() => {
    let active = true;
    const fetchLimits = async () => {
      const electronApi =
        (window as any).electronApi || (window as any).electronAPI;
      if (!electronApi?.sfRestRequest) return;

      try {
        const data = await electronApi.sfRestRequest({
          sfHost: orgTab.sfHost,
          path: "/services/data/v60.0/limits/",
          method: "GET",
        });
        if (active && data?.DailyApiRequests) {
          setLimitsSummary({
            dailyApiRemaining: data.DailyApiRequests.Remaining,
            dailyApiMax: data.DailyApiRequests.Max,
          });
        }
      } catch {
        /* non-fatal limits fetch */
      }
    };

    fetchLimits();
    return () => {
      active = false;
    };
  }, [orgTab.sfHost]);

  const handleOpenBrowser = (relUrl = "/lightning/page/home") => {
    const electronApi =
      (window as any).electronApi || (window as any).electronAPI;
    if (electronApi?.openOrgFrontdoor) {
      electronApi.openOrgFrontdoor(orgTab.orgId, relUrl);
    } else {
      window.open(`https://${orgTab.sfHost}${relUrl}`, "_blank");
    }
  };

  const setupShortcuts = [
    { label: "Object Manager", path: "/lightning/setup/ObjectManager/home", icon: "📦" },
    { label: "Flows", path: "/lightning/setup/Flows/home", icon: "⚡" },
    { label: "Apex Classes", path: "/lightning/setup/ApexClasses/home", icon: "📄" },
    { label: "Users", path: "/lightning/setup/ManageUsers/home", icon: "👤" },
    { label: "Custom Metadata", path: "/lightning/setup/CustomMetadata/home", icon: "🏷️" },
    { label: "Deployment Status", path: "/lightning/setup/DeployStatus/home", icon: "🚀" },
    { label: "Developer Console", path: "/_ui/common/apex/debug/ApexCSIPage", icon: "💻" },
    { label: "Company Info", path: "/lightning/setup/CompanyProfileInfo/home", icon: "🏢" },
  ];

  return (
    <div style={styles.dashboardContainer}>
      {/* ── Top Hero / Org Context Bar ── */}
      <div style={styles.heroSection}>
        <div style={styles.heroLeft}>
          <div style={styles.aliasRow}>
            <span style={{ ...styles.envBadge, backgroundColor: envColor }}>
              {orgTab.envType}
            </span>
            <h1 style={styles.orgAlias}>{orgTab.alias}</h1>
            <span style={styles.sfHostBadge}>{orgTab.sfHost}</span>
          </div>

          <div style={styles.orgMetaRow}>
            <span style={styles.metaItem}>
              Org ID: <code style={styles.code}>{orgTab.orgId}</code>
            </span>
            {orgTab.username && (
              <span style={styles.metaItem}>
                User: <strong>{orgTab.username}</strong>
              </span>
            )}
            {limitsSummary.dailyApiMax !== undefined && (
              <span style={styles.metaItem}>
                Daily API:{" "}
                <strong>
                  {limitsSummary.dailyApiRemaining?.toLocaleString()} /{" "}
                  {limitsSummary.dailyApiMax?.toLocaleString()}
                </strong>
              </span>
            )}
          </div>
        </div>

        <div style={styles.heroRight}>
          <button
            type="button"
            style={styles.openSalesforceBtn}
            onClick={() => handleOpenBrowser("/lightning/page/home")}
          >
            ↗ Open Salesforce in Browser
          </button>
        </div>
      </div>

      {/* ── Main Scrollable Body ── */}
      <div style={styles.scrollableContent}>
        {/* ── Smart Popup Search Bar (Primary Tool) ── */}
        <div style={styles.searchSection}>
          <div style={styles.searchSectionHeader}>
            <h2 style={styles.sectionHeaderTitle}>Smart Popup & Record Resolver</h2>
            <span style={styles.sectionHeaderSubtitle}>
              Instantly resolve 15/18-char record IDs, search SObjects by 3-char prefix, query users, or launch tools
            </span>
          </div>
          <PopupSearchBar orgId={orgTab.orgId} sfHost={orgTab.sfHost} autoFocus />
        </div>

        {/* ── Inspector Tools Grid ── */}
        <div style={styles.toolsSection}>
          <h2 style={styles.sectionHeaderTitle}>Inspector Reloaded Tools</h2>
          <div style={styles.toolsGrid}>
            {Object.values(toolDefinitions).map((tool) => (
              <div
                key={tool.id}
                style={styles.toolCard}
                onClick={() => openSubTab(orgTab.orgId, tool.id, {}, tool.title)}
              >
                <div style={styles.toolCardHeader}>
                  <span style={styles.toolIcon}>
                    {tool.id === "data-export" && "⚡"}
                    {tool.id === "data-import" && "📥"}
                    {tool.id === "inspect" && "🔍"}
                    {tool.id === "limits" && "📊"}
                    {tool.id === "explore-api" && "🌐"}
                    {tool.id === "event-monitor" && "📡"}
                    {tool.id === "field-creator" && "🛠"}
                  </span>
                  <span style={styles.toolName}>{tool.title}</span>
                </div>
                <p style={styles.toolDescription}>{tool.description}</p>
                <div style={styles.toolCardFooter}>
                  <span style={styles.launchLink}>Launch Tool →</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Salesforce Setup Shortcuts ── */}
        <div style={styles.setupSection}>
          <h2 style={styles.sectionHeaderTitle}>Quick Salesforce Setup Navigation</h2>
          <div style={styles.setupGrid}>
            {setupShortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                style={styles.setupBtn}
                onClick={() => handleOpenBrowser(s.path)}
              >
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <span>{s.label}</span>
                <span style={{ marginLeft: "auto", opacity: 0.5 }}>↗</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  dashboardContainer: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    width: "100%",
    height: "100%",
    minHeight: 0,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  heroSection: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 32px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
    flexShrink: 0,
  },
  heroLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  aliasRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  envBadge: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 800,
    padding: "3px 8px",
    borderRadius: 6,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  orgAlias: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "-0.02em",
  },
  sfHostBadge: {
    fontSize: 12,
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    padding: "3px 10px",
    borderRadius: 6,
    fontFamily: "monospace",
  },
  orgMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    fontSize: 12.5,
    color: "#475569",
  },
  metaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  code: {
    fontFamily: "monospace",
    backgroundColor: "#f1f5f9",
    padding: "1px 5px",
    borderRadius: 4,
    color: "#0f172a",
  },
  heroRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  openSalesforceBtn: {
    backgroundColor: "#0ea5e9",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(14, 165, 233, 0.3)",
    transition: "background-color 0.15s ease",
  },
  scrollableContent: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "28px 32px 48px",
    display: "flex",
    flexDirection: "column",
    gap: 36,
  },
  searchSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    backgroundColor: "#ffffff",
    padding: "24px 28px",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.04)",
  },
  searchSectionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginBottom: 6,
  },
  sectionHeaderTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#1e293b",
    letterSpacing: "-0.01em",
  },
  sectionHeaderSubtitle: {
    fontSize: 12.5,
    color: "#64748b",
  },
  toolsSection: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  toolsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  },
  toolCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    cursor: "pointer",
    transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
  },
  toolCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  toolIcon: {
    fontSize: 20,
  },
  toolName: {
    fontSize: 15,
    fontWeight: 700,
    color: "#0f172a",
  },
  toolDescription: {
    margin: 0,
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 1.5,
    flex: 1,
    marginBottom: 14,
  },
  toolCardFooter: {
    display: "flex",
    justifyContent: "flex-end",
  },
  launchLink: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0ea5e9",
  },
  setupSection: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  setupGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
  },
  setupBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 0.15s ease, background-color 0.15s ease",
  },
};
