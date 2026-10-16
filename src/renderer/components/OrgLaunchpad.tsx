import React, { useState, useMemo } from "react";
import { useWorkspace, ToolType } from "../state/workspace-store";
import { OrgProfile, EnvType } from "../../shared/types/org";
import { normalizeSfHost } from "../utils/normalize-host";

const ENV_COLORS: Record<EnvType, { bg: string; text: string }> = {
  PROD: { bg: "#dc2626", text: "#ffffff" },
  UAT: { bg: "#d97706", text: "#ffffff" },
  SIT: { bg: "#7c3aed", text: "#ffffff" },
  DEV: { bg: "#2563eb", text: "#ffffff" },
  SANDBOX: { bg: "#d97706", text: "#ffffff" },
};

const ENV_OPTIONS: EnvType[] = ["DEV", "UAT", "SIT", "PROD"];

export function OrgLaunchpad() {
  const { state, openOrgWorkspace, refreshSavedOrgs } = useWorkspace();
  const isVisible = state.activeOrgId === "LAUNCHPAD";

  // Left Column State
  const [searchQuery, setSearchQuery] = useState("");
  const [sfdxLoading, setSfdxLoading] = useState(false);
  const [activeMenuOrgId, setActiveMenuOrgId] = useState<string | null>(null);

  // Right Column State
  const [connectTab, setConnectTab] = useState<"oauth" | "manual">("oauth");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form 1: OAuth State
  const [oauthAlias, setOauthAlias] = useState("");
  const [loginPreset, setLoginPreset] = useState<"production" | "sandbox" | "custom">("production");
  const [customMyDomain, setCustomMyDomain] = useState("");
  const [oauthEnv, setOauthEnv] = useState<EnvType>("DEV");

  // Form 2: Manual Session State
  const [manualAlias, setManualAlias] = useState("");
  const [manualHost, setManualHost] = useState("");
  const [manualSessionId, setManualSessionId] = useState("");
  const [showSessionId, setShowSessionId] = useState(false);
  const [manualEnv, setManualEnv] = useState<EnvType>("DEV");

  const electronApi = (window as any).electronApi;

  // Filtered saved orgs
  const filteredOrgs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return state.savedOrgs;
    return state.savedOrgs.filter(
      o =>
        o.alias?.toLowerCase().includes(q) ||
        o.sfHost?.toLowerCase().includes(q) ||
        o.username?.toLowerCase().includes(q) ||
        o.orgType?.toLowerCase().includes(q)
    );
  }, [state.savedOrgs, searchQuery]);

  // Import from SFDX CLI
  const handleImportSfdx = async () => {
    if (!electronApi?.importSfdxOrgs) {
      alert("SFDX CLI integration is not supported on this platform.");
      return;
    }
    setSfdxLoading(true);
    try {
      await electronApi.importSfdxOrgs();
      await refreshSavedOrgs();
    } catch (err: any) {
      alert("Failed to import SFDX orgs: " + (err?.message || String(err)));
    } finally {
      setSfdxLoading(false);
    }
  };

  // Delete saved org
  const handleDeleteOrg = async (org: OrgProfile) => {
    if (!confirm(`Are you sure you want to remove "${org.alias || org.sfHost}" from your saved connections?`)) {
      return;
    }
    if (electronApi?.removeOrg) {
      await electronApi.removeOrg({ orgId: org.orgId });
      await refreshSavedOrgs();
    }
  };

  // Submit OAuth 2.0 PKCE
  const handleOAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!electronApi?.loginWithOAuth) {
      setErrorMsg("Electron OAuth API unavailable");
      return;
    }

    let loginUrl = "https://login.salesforce.com";
    if (loginPreset === "sandbox") {
      loginUrl = "https://test.salesforce.com";
    } else if (loginPreset === "custom") {
      let clean = customMyDomain.trim();
      if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
        clean = "https://" + clean;
      }
      loginUrl = clean;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const org = await electronApi.loginWithOAuth({
        loginUrl,
        alias: oauthAlias.trim() || "Salesforce Org",
        orgType: oauthEnv,
        color: ENV_COLORS[oauthEnv]?.bg || "#2563eb",
      });
      await refreshSavedOrgs();
      openOrgWorkspace(org);
    } catch (err: any) {
      setErrorMsg(err?.message || "OAuth authentication failed");
    } finally {
      setBusy(false);
    }
  };

  // Submit Manual Session ID
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const loginMethod = electronApi?.loginWithManualSession || electronApi?.loginManual;
    if (!loginMethod) {
      setErrorMsg("Manual login API unavailable");
      return;
    }

    const cleanHost = normalizeSfHost(manualHost);

    if (!cleanHost) {
      setErrorMsg("Please enter a valid instance hostname");
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const org = await loginMethod({
        alias: manualAlias.trim() || cleanHost,
        sfHost: cleanHost,
        sessionId: manualSessionId.trim(),
        orgType: manualEnv,
        color: ENV_COLORS[manualEnv]?.bg || "#2563eb",
      });
      await refreshSavedOrgs();
      openOrgWorkspace(org);
    } catch (err: any) {
      setErrorMsg(err?.message || "Session validation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: isVisible ? "flex" : "none",
        flexDirection: "column",
        flex: 1,
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "#090d16",
        color: "#f8fafc",
      }}
    >
      {/* Launchpad Header */}
      <div style={styles.launchpadHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/addon/icon128.png" alt="icon" style={{ width: 34, height: 34 }} />
          <div>
            <h1 style={styles.headerTitle}>Salesforce Inspector Reloaded</h1>
            <p style={styles.headerSubtitle}>Desktop Hub — Manage connections and launch isolated workspaces</p>
          </div>
        </div>
      </div>

      {/* Main Two-Column Body */}
      <div style={styles.columnsContainer}>
        {/* ── LEFT COLUMN: Saved & Discovered Orgs ── */}
        <div style={styles.leftColumn}>
          <div style={styles.leftColHeader}>
            <div>
              <h2 style={styles.colTitle}>Saved &amp; Discovered Orgs</h2>
              <span style={styles.countBadge}>{filteredOrgs.length} of {state.savedOrgs.length}</span>
            </div>

            {electronApi?.importSfdxOrgs && (
              <button
                type="button"
                style={styles.sfdxBtn}
                onClick={handleImportSfdx}
                disabled={sfdxLoading}
                title="Detect and import local orgs from Salesforce CLI (~/.sfdx)"
              >
                {sfdxLoading ? "Reading CLI…" : "⚡ Import from SFDX CLI"}
              </button>
            )}
          </div>

          {/* Search bar */}
          <div style={styles.searchRow}>
            <input
              type="text"
              style={styles.searchInput}
              placeholder="Filter by alias, hostname, username, or env..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Orgs List */}
          <div style={styles.orgListScroll}>
            {filteredOrgs.length === 0 ? (
              <div style={styles.emptyCard}>
                <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#cbd5e1" }}>No matching Salesforce orgs</p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  Connect a new environment using the form on the right, or import your CLI authenticated orgs.
                </p>
              </div>
            ) : (
              filteredOrgs.map(org => {
                const envStyle = ENV_COLORS[org.orgType] || ENV_COLORS.DEV;
                const isMenuOpen = activeMenuOrgId === org.orgId;

                return (
                  <div
                    key={org.orgId}
                    style={{
                      ...styles.orgCard,
                      borderLeft: `4px solid ${org.color || envStyle.bg}`,
                    }}
                  >
                    <div style={styles.cardMain}>
                      <div style={styles.cardHeader}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              ...styles.envPill,
                              backgroundColor: envStyle.bg,
                              color: envStyle.text,
                            }}
                          >
                            {org.orgType}
                          </span>
                          <h3 style={styles.orgCardTitle} title={org.alias}>{org.alias}</h3>
                        </div>

                        <button
                          type="button"
                          style={styles.deleteBtn}
                          onClick={() => handleDeleteOrg(org)}
                          title="Remove saved org"
                        >
                          ✕
                        </button>
                      </div>

                      <p style={styles.orgCardHost} title={org.sfHost}>{org.sfHost}</p>
                      {org.username && (
                        <p style={styles.orgCardUser} title={org.username}>👤 {org.username}</p>
                      )}
                    </div>

                    <div style={{ ...styles.cardActionsRow, flexWrap: "wrap", gap: 8 }}>
                      <button
                        type="button"
                        style={styles.openBtn}
                        onClick={() => openOrgWorkspace(org)}
                        title="Open Salesforce Inspector Reloaded Workspace"
                      >
                        ⚡ Open Inspector Workspace
                      </button>

                      <button
                        type="button"
                        style={{
                          ...styles.quickToolBtn,
                          backgroundColor: "#0f172a",
                          borderColor: "#3b82f6",
                          color: "#60a5fa",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          if (electronApi?.openOrgFrontdoor) {
                            electronApi.openOrgFrontdoor(org.orgId);
                          } else if (electronApi?.openExternal) {
                            electronApi.openExternal("https://" + org.sfHost);
                          }
                        }}
                        title="Open Salesforce Lightning in browser with automated OAuth session login"
                      >
                        ↗ Launch Org in Browser (Auto-Login)
                      </button>

                      {/* Tool Direct Launcher Dropdown */}
                      <div style={{ position: "relative" }}>
                        <button
                          type="button"
                          style={styles.quickToolBtn}
                          onClick={() => setActiveMenuOrgId(isMenuOpen ? null : org.orgId)}
                          title="Launch specific tool directly"
                        >
                          Tools ▾
                        </button>

                        {isMenuOpen && (
                          <div style={styles.quickToolMenu}>
                            <button
                              type="button"
                              style={styles.menuItem}
                              onClick={() => { setActiveMenuOrgId(null); openOrgWorkspace(org, "data-export"); }}
                            >
                              ⚡ Data Export
                            </button>
                            <button
                              type="button"
                              style={styles.menuItem}
                              onClick={() => { setActiveMenuOrgId(null); openOrgWorkspace(org, "data-import"); }}
                            >
                              📥 Data Import
                            </button>
                            <button
                              type="button"
                              style={styles.menuItem}
                              onClick={() => { setActiveMenuOrgId(null); openOrgWorkspace(org, "inspect"); }}
                            >
                              🔍 Show All Data
                            </button>
                            <button
                              type="button"
                              style={styles.menuItem}
                              onClick={() => { setActiveMenuOrgId(null); openOrgWorkspace(org, "limits"); }}
                            >
                              📊 Org Limits
                            </button>
                            <button
                              type="button"
                              style={styles.menuItem}
                              onClick={() => { setActiveMenuOrgId(null); openOrgWorkspace(org, "explore-api"); }}
                            >
                              🌐 Explore API
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Connect New Environment ── */}
        <div style={styles.rightColumn}>
          <div style={styles.connectCard}>
            <h2 style={styles.connectTitle}>Connect New Environment</h2>
            <p style={styles.connectSub}>Authenticate an org and encrypt its credentials inside Electron&apos;s OS Keychain</p>

            {/* Tab switch */}
            <div style={styles.tabSwitch}>
              <button
                type="button"
                style={connectTab === "oauth" ? { ...styles.tabSwitchBtn, ...styles.activeSwitchBtn } : styles.tabSwitchBtn}
                onClick={() => { setConnectTab("oauth"); setErrorMsg(null); }}
              >
                ⚡ OAuth 2.0 PKCE
              </button>
              <button
                type="button"
                style={connectTab === "manual" ? { ...styles.tabSwitchBtn, ...styles.activeSwitchBtn } : styles.tabSwitchBtn}
                onClick={() => { setConnectTab("manual"); setErrorMsg(null); }}
              >
                🔑 Manual Session Key
              </button>
            </div>

            {errorMsg && (
              <div style={styles.errorBox}>
                <span>⚠ {errorMsg}</span>
              </div>
            )}

            {connectTab === "oauth" ? (
              <form onSubmit={handleOAuthSubmit} style={styles.form}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Org Alias</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    placeholder="e.g. UAT Full Sandbox"
                    value={oauthAlias}
                    onChange={e => setOauthAlias(e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Salesforce Environment Preset</label>
                  <div style={styles.radioGroup}>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        name="preset"
                        checked={loginPreset === "production"}
                        onChange={() => setLoginPreset("production")}
                      />
                      <span>Production (login.salesforce.com)</span>
                    </label>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        name="preset"
                        checked={loginPreset === "sandbox"}
                        onChange={() => setLoginPreset("sandbox")}
                      />
                      <span>Sandbox (test.salesforce.com)</span>
                    </label>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        name="preset"
                        checked={loginPreset === "custom"}
                        onChange={() => setLoginPreset("custom")}
                      />
                      <span>Custom MyDomain URL</span>
                    </label>
                  </div>
                  {loginPreset === "custom" && (
                    <input
                      type="text"
                      required
                      style={{ ...styles.input, marginTop: 8 }}
                      placeholder="https://mycompany.my.salesforce.com"
                      value={customMyDomain}
                      onChange={e => setCustomMyDomain(e.target.value)}
                    />
                  )}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Environment Badge</label>
                  <div style={styles.envSelector}>
                    {ENV_OPTIONS.map(env => (
                      <button
                        key={env}
                        type="button"
                        style={{
                          ...styles.envSelectBtn,
                          backgroundColor: oauthEnv === env ? ENV_COLORS[env].bg : "#141c2e",
                          borderColor: oauthEnv === env ? "#ffffff" : "#2d3c5b",
                          color: oauthEnv === env ? "#ffffff" : "#94a3b8",
                        }}
                        onClick={() => setOauthEnv(env)}
                      >
                        {env}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  style={{ ...styles.submitBtn, background: "#2563eb" }}
                >
                  {busy ? "Opening Salesforce Login Window…" : "Authorize with Salesforce (OAuth 2.0)"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleManualSubmit} style={styles.form}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Org Alias</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    placeholder="e.g. Dev Hotfix"
                    value={manualAlias}
                    onChange={e => setManualAlias(e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Instance Hostname or URL</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    placeholder="mycompany--dev.sandbox.my.salesforce.com"
                    value={manualHost}
                    onChange={e => setManualHost(e.target.value)}
                  />
                  <span style={styles.helpText}>Protocols (https://) and trailing slashes are stripped automatically.</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Session ID / Access Token (00D...)</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showSessionId ? "text" : "password"}
                      required
                      style={{ ...styles.input, paddingRight: 42 }}
                      placeholder="00D..."
                      value={manualSessionId}
                      onChange={e => setManualSessionId(e.target.value)}
                    />
                    <button
                      type="button"
                      style={styles.toggleVisibilityBtn}
                      onClick={() => setShowSessionId(!showSessionId)}
                      title={showSessionId ? "Hide token" : "Show token"}
                    >
                      {showSessionId ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Environment Badge</label>
                  <div style={styles.envSelector}>
                    {ENV_OPTIONS.map(env => (
                      <button
                        key={env}
                        type="button"
                        style={{
                          ...styles.envSelectBtn,
                          backgroundColor: manualEnv === env ? ENV_COLORS[env].bg : "#141c2e",
                          borderColor: manualEnv === env ? "#ffffff" : "#2d3c5b",
                          color: manualEnv === env ? "#ffffff" : "#94a3b8",
                        }}
                        onClick={() => setManualEnv(env)}
                      >
                        {env}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  style={{ ...styles.submitBtn, background: "#8b5cf6" }}
                >
                  {busy ? "Validating Session…" : "Connect with Session ID"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  launchpadHeader: {
    height: 60,
    background: "#0c111d",
    borderBottom: "1px solid #1a2336",
    padding: "0 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: "#ffffff",
  },
  headerSubtitle: {
    margin: 0,
    fontSize: 12,
    color: "#64748b",
  },
  columnsContainer: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    height: "calc(100% - 60px)",
  },
  leftColumn: {
    flex: "1 1 55%",
    borderRight: "1px solid #1a2336",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: "20px 24px",
  },
  leftColHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    flexShrink: 0,
  },
  colTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: 0,
    display: "inline-block",
  },
  countBadge: {
    fontSize: 11,
    color: "#64748b",
    marginLeft: 8,
    fontWeight: 500,
  },
  sfdxBtn: {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 0.12s ease",
  },
  searchRow: {
    marginBottom: 14,
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    background: "#0d1424",
    border: "1px solid #1e2c47",
    borderRadius: 8,
    color: "#f8fafc",
    fontSize: 13,
    padding: "8px 12px",
    outline: "none",
  },
  orgListScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingRight: 4,
  },
  emptyCard: {
    background: "#0f1626",
    border: "1px dashed #22324f",
    borderRadius: 8,
    padding: "28px 20px",
    textAlign: "center",
  },
  orgCard: {
    background: "#10182b",
    border: "1px solid #1c2a44",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    transition: "transform 0.1s ease, border-color 0.1s ease",
  },
  cardMain: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  envPill: {
    fontSize: 9.5,
    fontWeight: 800,
    padding: "2px 5px",
    borderRadius: 3.5,
    letterSpacing: "0.05em",
    lineHeight: 1,
    flexShrink: 0,
  },
  orgCardTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#ffffff",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: 12,
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 4,
  },
  orgCardHost: {
    margin: 0,
    fontSize: 12,
    color: "#64748b",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  orgCardUser: {
    margin: 0,
    fontSize: 11.5,
    color: "#94a3b8",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardActionsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTop: "1px solid #17243c",
  },
  openBtn: {
    background: "#1d4ed8",
    border: "none",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 5,
    cursor: "pointer",
  },
  quickToolBtn: {
    background: "#162035",
    border: "1px solid #233454",
    color: "#cbd5e1",
    fontSize: 11.5,
    padding: "4px 9px",
    borderRadius: 5,
    cursor: "pointer",
  },
  quickToolMenu: {
    position: "absolute",
    right: 0,
    bottom: 30,
    background: "#162035",
    border: "1px solid #283c61",
    borderRadius: 6,
    padding: "4px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    zIndex: 100,
    width: 150,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  menuItem: {
    background: "none",
    border: "none",
    color: "#f1f5f9",
    fontSize: 12,
    textAlign: "left",
    padding: "5px 8px",
    borderRadius: 4,
    cursor: "pointer",
  },
  rightColumn: {
    flex: "1 1 45%",
    overflowY: "auto",
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
  },
  connectCard: {
    background: "#0f1628",
    border: "1px solid #1c2b47",
    borderRadius: 10,
    padding: "22px 24px",
  },
  connectTitle: {
    margin: "0 0 4px",
    fontSize: 16,
    fontWeight: 700,
    color: "#ffffff",
  },
  connectSub: {
    margin: "0 0 16px",
    fontSize: 12.5,
    color: "#94a3b8",
    lineHeight: 1.4,
  },
  tabSwitch: {
    display: "flex",
    gap: 6,
    background: "#0a0e1a",
    padding: 3,
    borderRadius: 7,
    marginBottom: 18,
    border: "1px solid #1a263e",
  },
  tabSwitchBtn: {
    flex: 1,
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: 12.5,
    fontWeight: 600,
    padding: "7px 10px",
    borderRadius: 5,
    cursor: "pointer",
    transition: "all 0.12s ease",
  },
  activeSwitchBtn: {
    background: "#1b253b",
    color: "#ffffff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
  errorBox: {
    background: "#450a0a",
    border: "1px solid #dc2626",
    color: "#fca5a5",
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 12.5,
    marginBottom: 14,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 11.5,
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    background: "#080c16",
    border: "1px solid #1e2c47",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 13,
    padding: "8px 11px",
    outline: "none",
  },
  helpText: {
    fontSize: 11,
    color: "#64748b",
  },
  radioGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 2,
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "#cbd5e1",
    cursor: "pointer",
  },
  envSelector: {
    display: "flex",
    gap: 8,
  },
  envSelectBtn: {
    flex: 1,
    border: "1px solid",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.12s ease",
  },
  submitBtn: {
    border: "none",
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: 600,
    padding: "10px 16px",
    borderRadius: 7,
    cursor: "pointer",
    marginTop: 6,
    transition: "background 0.12s ease",
  },
  toggleVisibilityBtn: {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    padding: 4,
  },
};
