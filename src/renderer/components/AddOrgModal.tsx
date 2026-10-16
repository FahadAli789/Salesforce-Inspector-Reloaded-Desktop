import React, { useState } from "react";
import { OrgProfile, EnvType } from "../../shared/types/org";

interface AddOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrgConnected: (org: OrgProfile) => void;
}

const ORG_COLORS = [
  "#3B82F6", "#8B5CF6", "#EC4899", "#10B981",
  "#F59E0B", "#EF4444", "#06B6D4", "#84CC16",
];

export function AddOrgModal({ isOpen, onClose, onOrgConnected }: AddOrgModalProps) {
  const [tab, setTab] = useState<"oauth" | "manual">("oauth");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth form
  const [alias, setAlias] = useState("");
  const [loginUrl, setLoginUrl] = useState("https://login.salesforce.com");
  const [orgType, setOrgType] = useState<EnvType>("DEV");
  const [color, setColor] = useState(ORG_COLORS[0]);

  // Manual form
  const [manualAlias, setManualAlias] = useState("");
  const [sfHost, setSfHost] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [manualOrgType, setManualOrgType] = useState<EnvType>("DEV");
  const [manualColor, setManualColor] = useState(ORG_COLORS[1]);

  if (!isOpen) return null;

  const electronApi = (window as any).electronApi;

  async function handleOAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!electronApi) {
      setError("Electron API not available");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const org = await electronApi.loginWithOAuth({ loginUrl, alias, orgType, color });
      onOrgConnected(org);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "OAuth login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!electronApi) {
      setError("Electron API not available");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cleanHost = sfHost.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
      const org = await electronApi.loginWithManualSession({
        alias: manualAlias,
        sfHost: cleanHost,
        sessionId: sessionId.trim(),
        orgType: manualOrgType,
        color: manualColor,
      });
      onOrgConnected(org);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Session validation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyles.card}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Connect Salesforce Org</h2>
          <button style={modalStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tab selection */}
        <div style={modalStyles.tabBar}>
          <button
            style={tab === "oauth" ? { ...modalStyles.tabBtn, ...modalStyles.activeTabBtn } : modalStyles.tabBtn}
            onClick={() => { setTab("oauth"); setError(null); }}
          >
            ⚡ OAuth 2.0 Login
          </button>
          <button
            style={tab === "manual" ? { ...modalStyles.tabBtn, ...modalStyles.activeTabBtn } : modalStyles.tabBtn}
            onClick={() => { setTab("manual"); setError(null); }}
          >
            🔑 Manual Session
          </button>
        </div>

        {error && (
          <div style={modalStyles.errorBanner}>
            ⚠ {error}
          </div>
        )}

        {tab === "oauth" ? (
          <form onSubmit={handleOAuthSubmit} style={modalStyles.form}>
            <div style={modalStyles.field}>
              <label style={modalStyles.label}>Org Alias</label>
              <input
                style={modalStyles.input}
                value={alias}
                required
                placeholder="e.g. Production Org"
                onChange={e => setAlias(e.target.value)}
              />
            </div>

            <div style={modalStyles.field}>
              <label style={modalStyles.label}>Login URL</label>
              <select
                style={modalStyles.input}
                value={loginUrl}
                onChange={e => setLoginUrl(e.target.value)}
              >
                <option value="https://login.salesforce.com">login.salesforce.com (Production / Dev)</option>
                <option value="https://test.salesforce.com">test.salesforce.com (Sandbox)</option>
              </select>
            </div>

            <div style={modalStyles.row}>
              <div style={{ ...modalStyles.field, flex: 1 }}>
                <label style={modalStyles.label}>Environment Type</label>
                <select
                  style={modalStyles.input}
                  value={orgType}
                  onChange={e => setOrgType(e.target.value as EnvType)}
                >
                  <option value="DEV">DEV (Developer)</option>
                  <option value="UAT">UAT (Staging)</option>
                  <option value="PROD">PROD (Production)</option>
                  <option value="SANDBOX">SANDBOX (Sandbox)</option>
                </select>
              </div>

              <div style={{ ...modalStyles.field, flex: 1 }}>
                <label style={modalStyles.label}>Color Badge</label>
                <div style={modalStyles.colorPicker}>
                  {ORG_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      style={{
                        ...modalStyles.colorDot,
                        background: c,
                        border: color === c ? "2px solid #fff" : "2px solid transparent",
                        transform: color === c ? "scale(1.15)" : "scale(1)",
                      }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <button type="submit" disabled={busy} style={modalStyles.submitBtn}>
              {busy ? "Opening Salesforce Login…" : "⚡ Connect via OAuth"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleManualSubmit} style={modalStyles.form}>
            <div style={modalStyles.field}>
              <label style={modalStyles.label}>Org Alias</label>
              <input
                style={modalStyles.input}
                value={manualAlias}
                required
                placeholder="e.g. Scratch Org"
                onChange={e => setManualAlias(e.target.value)}
              />
            </div>

            <div style={modalStyles.field}>
              <label style={modalStyles.label}>Salesforce Host (no https://)</label>
              <input
                style={modalStyles.input}
                value={sfHost}
                required
                placeholder="myorg.my.salesforce.com"
                onChange={e => setSfHost(e.target.value)}
              />
            </div>

            <div style={modalStyles.field}>
              <label style={modalStyles.label}>Session ID / Frontdoor Key</label>
              <input
                style={modalStyles.input}
                type="password"
                value={sessionId}
                required
                placeholder="00D... (OAuth token or sid cookie)"
                onChange={e => setSessionId(e.target.value)}
              />
            </div>

            <div style={modalStyles.row}>
              <div style={{ ...modalStyles.field, flex: 1 }}>
                <label style={modalStyles.label}>Environment Type</label>
                <select
                  style={modalStyles.input}
                  value={manualOrgType}
                  onChange={e => setManualOrgType(e.target.value as EnvType)}
                >
                  <option value="DEV">DEV (Developer)</option>
                  <option value="UAT">UAT (Staging)</option>
                  <option value="PROD">PROD (Production)</option>
                  <option value="SANDBOX">SANDBOX (Sandbox)</option>
                </select>
              </div>

              <div style={{ ...modalStyles.field, flex: 1 }}>
                <label style={modalStyles.label}>Color Badge</label>
                <div style={modalStyles.colorPicker}>
                  {ORG_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      style={{
                        ...modalStyles.colorDot,
                        background: c,
                        border: manualColor === c ? "2px solid #fff" : "2px solid transparent",
                        transform: manualColor === c ? "scale(1.15)" : "scale(1)",
                      }}
                      onClick={() => setManualColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <button type="submit" disabled={busy} style={{ ...modalStyles.submitBtn, background: "#8B5CF6" }}>
              {busy ? "Validating Session…" : "🔑 Import Session"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  card: {
    background: "#181b22",
    border: "1px solid #2d3343",
    borderRadius: 12,
    width: 480,
    maxWidth: "92vw",
    padding: "24px 28px",
    boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
    color: "#e2e8f0",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: 18,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 6,
  },
  tabBar: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
    borderBottom: "1px solid #282e3e",
    paddingBottom: 8,
  },
  tabBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 500,
    padding: "6px 14px",
    borderRadius: 6,
    cursor: "pointer",
  },
  activeTabBtn: {
    background: "#232938",
    color: "#fff",
    fontWeight: 600,
  },
  errorBanner: {
    background: "#ef444422",
    border: "1px solid #ef444488",
    color: "#fca5a5",
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: {
    display: "flex",
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    background: "#0f1219",
    border: "1px solid #282e3e",
    borderRadius: 6,
    color: "#fff",
    fontSize: 13,
    padding: "8px 12px",
    outline: "none",
  },
  colorPicker: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    height: 38,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    cursor: "pointer",
    padding: 0,
    transition: "transform 0.15s ease",
  },
  submitBtn: {
    background: "#2563eb",
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 16px",
    borderRadius: 8,
    cursor: "pointer",
    marginTop: 8,
  },
};
