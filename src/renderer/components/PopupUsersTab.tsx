// src/renderer/components/PopupUsersTab.tsx
import React, { useState, useEffect, useCallback } from "react";

export interface SalesforceUserRecord {
  Id: string;
  Name: string;
  Username: string;
  Email: string;
  Alias?: string;
  IsActive: boolean;
  ProfileId?: string;
  Profile?: { Name?: string };
  UserRole?: { Name?: string };
  LanguageLocaleKey?: string;
  LocaleSidKey?: string;
  FederationIdentifier?: string;
  NetworkId?: string;
}

interface PopupUsersTabProps {
  orgId: string;
  sfHost: string;
  currentUserId?: string;
  onInspectRecord?: (sobjectName: string, recordId: string) => void;
  onNavigate?: () => void;
}

export const PopupUsersTab: React.FC<PopupUsersTabProps> = ({
  orgId,
  sfHost,
  currentUserId,
  onInspectRecord,
  onNavigate,
}) => {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SalesforceUserRecord[]>([]);
  const [selectedUser, setSelectedUser] = useState<SalesforceUserRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const electronApi =
    (window as any).electronApi || (window as any).electronAPI;

  const fetchUsers = useCallback(
    async (searchTerm: string) => {
      if (!electronApi?.sfRestRequest || !sfHost) return;
      setIsLoading(true);
      try {
        const escaped = searchTerm.trim().replace(/'/g, "\\'");
        const whereClause = escaped
          ? `WHERE (Name LIKE '%${escaped}%' OR Username LIKE '%${escaped}%' OR Email LIKE '%${escaped}%' OR Alias LIKE '%${escaped}%')`
          : currentUserId
          ? `WHERE Id = '${currentUserId}'`
          : `WHERE IsActive = true`;

        const soql =
          `SELECT Id, Name, Username, Email, Alias, IsActive, ProfileId, Profile.Name, ` +
          `UserRole.Name, LanguageLocaleKey, LocaleSidKey, FederationIdentifier ` +
          `FROM User ${whereClause} ORDER BY IsActive DESC, Name ASC LIMIT 15`;

        const res = await electronApi.sfRestRequest({
          sfHost,
          path: `/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`,
          method: "GET",
        });

        const records: SalesforceUserRecord[] = res?.records || [];
        setUsers(records);
        if (records.length > 0 && (!selectedUser || !records.some((r) => r.Id === selectedUser.Id))) {
          setSelectedUser(records[0]);
        } else if (records.length === 0) {
          setSelectedUser(null);
        }
      } catch (err) {
        console.error("[PopupUsersTab] Failed to query users:", err);
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    },
    [electronApi, sfHost, currentUserId]
  );

  // Initial load (loads current user or default active users, matching popup.js)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(query);
    }, 280);
    return () => clearTimeout(timer);
  }, [query, fetchUsers]);

  const doSupportLoginAs = (user: SalesforceUserRecord) => {
    if (!user || !user.IsActive) return false;
    if (currentUserId && user.Id === currentUserId) return false;
    return true;
  };

  const handleOpenFrontdoorPath = async (relUrl: string) => {
    if (electronApi?.openOrgFrontdoor) {
      await electronApi.openOrgFrontdoor(orgId, relUrl);
    } else {
      window.open(`https://${sfHost}${relUrl}`, "_blank");
    }
    onNavigate?.();
  };

  // Standard LoginAs in current main browser session (matching popup.js "LoginAs")
  const handleStandardLoginAs = async (user: SalesforceUserRecord) => {
    const loginAsPath =
      `/servlet/servlet.su?oid=${encodeURIComponent(orgId)}` +
      `&suorgadminid=${encodeURIComponent(user.Id)}` +
      `&retURL=${encodeURIComponent("/lightning/page/home")}` +
      `&targetURL=${encodeURIComponent("/lightning/page/home")}`;
    await handleOpenFrontdoorPath(loginAsPath);
  };

  // Isolated Session LoginAs (Incognito or Separate Profile)
  const handleIsolatedLoginAs = async (
    user: SalesforceUserRecord,
    isolationMode: "incognito" | "isolated-profile",
    isPortal = false
  ) => {
    if (!electronApi?.loginAsUser) return;
    setStatusMsg(
      isolationMode === "incognito"
        ? `Launching Incognito session as ${user.Name}...`
        : `Launching isolated profile as ${user.Name}...`
    );
    try {
      await electronApi.loginAsUser({
        orgId,
        targetUserId: user.Id,
        networkId: isPortal ? user.NetworkId : undefined,
        retUrl: "/lightning/page/home",
        targetUrl: "/lightning/page/home",
        isolationMode,
      });
      setStatusMsg(null);
      onNavigate?.();
    } catch (err: any) {
      setStatusMsg(`Failed to launch session: ${err?.message || "Unknown error"}`);
    }
  };

  // Enable 30-minute Debug Log for selected user (matching popup.js Enable Logs)
  const handleEnableDebugLogs = async (user: SalesforceUserRecord) => {
    if (!electronApi?.sfRestRequest) return;
    setStatusMsg(`Enabling debug logs for ${user.Name}...`);
    try {
      const dlRes = await electronApi.sfRestRequest({
        sfHost,
        path: `/services/data/v60.0/tooling/query/?q=${encodeURIComponent(
          "SELECT Id FROM DebugLevel WHERE DeveloperName = 'SFDC_DevConsole' LIMIT 1"
        )}`,
        method: "GET",
      });
      const debugLevelId = dlRes?.records?.[0]?.Id;
      if (!debugLevelId) {
        setStatusMsg("No SFDC_DevConsole DebugLevel found in org.");
        return;
      }
      const now = new Date();
      const exp = new Date(now.getTime() + 30 * 60 * 1000);
      await electronApi.sfRestRequest({
        sfHost,
        path: `/services/data/v60.0/tooling/sobjects/TraceFlag`,
        method: "POST",
        body: {
          TracedEntityId: user.Id,
          LogType: "USER_DEBUG",
          DebugLevelId: debugLevelId,
          StartDate: now.toISOString(),
          ExpirationDate: exp.toISOString(),
        },
      });
      setStatusMsg(`Debug logs enabled for ${user.Name} (30 mins).`);
    } catch (err: any) {
      setStatusMsg(`TraceFlag info: ${err?.message || "Check existing trace flags"}`);
    }
  };

  return (
    <div style={styles.container}>
      {/* User Search Input */}
      <div style={styles.searchWrapper}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter users by name, username, email, or alias..."
          style={styles.searchInput}
          autoFocus
        />
        {isLoading && <span style={styles.spinner}>Searching...</span>}
      </div>

      {/* Matching Users Pills / Selector */}
      {users.length > 1 && (
        <div style={styles.userSelectorList}>
          {users.map((u) => {
            const isSelected = selectedUser?.Id === u.Id;
            return (
              <button
                key={u.Id}
                type="button"
                onClick={() => setSelectedUser(u)}
                style={{
                  ...styles.userSelectRow,
                  ...(isSelected ? styles.userSelectRowActive : {}),
                }}
              >
                <div style={styles.userSelectMain}>
                  <span style={styles.userSelectName}>{u.Name}</span>
                  {u.Alias && <span style={styles.aliasBadge}>{u.Alias}</span>}
                  {!u.IsActive && <span style={styles.inactiveBadge}>Inactive</span>}
                </div>
                <span style={styles.userSelectSub}>
                  {u.Username} • {u.Profile?.Name || "No Profile"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected User Details Panel (Mirrors addon/popup.js UserDetails) */}
      {selectedUser ? (
        <div style={styles.userCard}>
          <div style={styles.userHeader}>
            <div>
              <div style={styles.userNameRow}>
                <span style={styles.userName}>{selectedUser.Name}</span>
                {selectedUser.Alias && (
                  <span style={styles.aliasBadge}>({selectedUser.Alias})</span>
                )}
                <span
                  style={
                    selectedUser.IsActive ? styles.activeBadge : styles.inactiveBadge
                  }
                >
                  {selectedUser.IsActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div style={styles.userSubtext}>{selectedUser.Username}</div>
            </div>
          </div>

          {/* LoginAs Action Group (Matches popup.js LoginAs | Incognito | Portal) */}
          {doSupportLoginAs(selectedUser) && (
            <div style={styles.loginAsGroup}>
              <button
                type="button"
                style={styles.primaryActionBtn}
                onClick={() => handleStandardLoginAs(selectedUser)}
                title="Log in as this user in a new tab"
              >
                🔑 LoginAs
              </button>
              <button
                type="button"
                style={styles.incognitoActionBtn}
                onClick={() => handleIsolatedLoginAs(selectedUser, "incognito")}
                title="Open in a clean Incognito / InPrivate window of your current browser"
              >
                🕵️ Incognito
              </button>
              <button
                type="button"
                style={styles.secondaryActionBtn}
                onClick={() =>
                  handleIsolatedLoginAs(selectedUser, "isolated-profile")
                }
                title="Open in a dedicated isolated browser profile (supports multiple concurrent users)"
              >
                🗂️ New Profile
              </button>
              {selectedUser.NetworkId && (
                <button
                  type="button"
                  style={styles.secondaryActionBtn}
                  onClick={() =>
                    handleIsolatedLoginAs(selectedUser, "incognito", true)
                  }
                >
                  🌐 Portal
                </button>
              )}
            </div>
          )}

          {/* Metadata Table (Matches popup.js user metadata rows) */}
          <div style={styles.metaGrid}>
            <div style={styles.metaLabel}>User ID:</div>
            <div style={styles.metaValue}>{selectedUser.Id}</div>

            <div style={styles.metaLabel}>Email:</div>
            <div style={styles.metaValue}>{selectedUser.Email}</div>

            <div style={styles.metaLabel}>Profile:</div>
            <div style={styles.metaValue}>
              {selectedUser.ProfileId ? (
                <button
                  type="button"
                  style={styles.inlineLink}
                  onClick={() =>
                    handleOpenFrontdoorPath(
                      `/lightning/setup/EnhancedProfiles/page?address=%2F${selectedUser.ProfileId}`
                    )
                  }
                >
                  {selectedUser.Profile?.Name || selectedUser.ProfileId} ↗
                </button>
              ) : (
                "—"
              )}
            </div>

            <div style={styles.metaLabel}>Role:</div>
            <div style={styles.metaValue}>
              {selectedUser.UserRole?.Name || "None"}
            </div>

            <div style={styles.metaLabel}>Language / Locale:</div>
            <div style={styles.metaValue}>
              {selectedUser.LanguageLocaleKey || "—"} /{" "}
              {selectedUser.LocaleSidKey || "—"}
            </div>
          </div>

          {/* User Setup Quick Actions (Matches popup.js Details | Pset | PsetG | Logs) */}
          <div style={styles.quickLinksRow}>
            <button
              type="button"
              style={styles.quickBtn}
              onClick={() =>
                handleOpenFrontdoorPath(
                  `/lightning/setup/ManageUsers/page?address=%2F${selectedUser.Id}%3Fnoredirect%3D1%26isUserEntityOverride%3D1`
                )
              }
            >
              👤 User Details
            </button>
            <button
              type="button"
              style={styles.quickBtn}
              onClick={() =>
                handleOpenFrontdoorPath(
                  `/lightning/setup/PermSets/page?address=%2Fudd%2FPermissionSet%2FassignPermissionSet.apexp%3FuserId%3D${selectedUser.Id}`
                )
              }
            >
              🛡️ Pset
            </button>
            <button
              type="button"
              style={styles.quickBtn}
              onClick={() =>
                handleOpenFrontdoorPath(
                  `/lightning/setup/PermSetGroups/page?address=%2Fudd%2FPermissionSetGroup%2FassignPermissionSet.apexp%3FuserId%3D${selectedUser.Id}%26isGroup%3D1`
                )
              }
            >
              📦 Pset Groups
            </button>
            <button
              type="button"
              style={styles.quickBtn}
              onClick={() => onInspectRecord?.("User", selectedUser.Id)}
            >
              🔍 Show All Data
            </button>
            <button
              type="button"
              style={styles.quickBtn}
              onClick={() => handleEnableDebugLogs(selectedUser)}
            >
              📋 Enable Logs
            </button>
          </div>

          {statusMsg && <div style={styles.statusBanner}>{statusMsg}</div>}
        </div>
      ) : (
        !isLoading && (
          <div style={styles.emptyState}>No matching Salesforce users found.</div>
        )
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "8px 0",
  },
  searchWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    fontSize: 13,
    outline: "none",
  },
  spinner: {
    position: "absolute",
    right: 10,
    fontSize: 11,
    color: "#64748b",
  },
  userSelectorList: {
    display: "flex",
    flexDirection: "column",
    maxHeight: 150,
    overflowY: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    backgroundColor: "#f8fafc",
  },
  userSelectRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    padding: "6px 10px",
    border: "none",
    borderBottom: "1px solid #f1f5f9",
    backgroundColor: "transparent",
    cursor: "pointer",
    textAlign: "left",
  },
  userSelectRowActive: {
    backgroundColor: "#eff6ff",
    borderLeft: "3px solid #2563eb",
  },
  userSelectMain: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  userSelectName: {
    fontSize: 12,
    fontWeight: 600,
    color: "#0f172a",
  },
  userSelectSub: {
    fontSize: 11,
    color: "#64748b",
  },
  userCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  userHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  userNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  userName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  userSubtext: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },
  aliasBadge: {
    fontSize: 11,
    color: "#475569",
    backgroundColor: "#f1f5f9",
    padding: "1px 6px",
    borderRadius: 4,
  },
  activeBadge: {
    fontSize: 10,
    fontWeight: 600,
    backgroundColor: "#dcfce7",
    color: "#15803d",
    padding: "2px 6px",
    borderRadius: 4,
  },
  inactiveBadge: {
    fontSize: 10,
    fontWeight: 600,
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    padding: "2px 6px",
    borderRadius: 4,
  },
  loginAsGroup: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    padding: "6px 0",
    borderTop: "1px solid #f1f5f9",
    borderBottom: "1px solid #f1f5f9",
  },
  primaryActionBtn: {
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 5,
    border: "1px solid #2563eb",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    cursor: "pointer",
  },
  incognitoActionBtn: {
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 5,
    border: "1px solid #0f172a",
    backgroundColor: "#1e293b",
    color: "#ffffff",
    cursor: "pointer",
  },
  secondaryActionBtn: {
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 5,
    border: "1px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#1e293b",
    cursor: "pointer",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    rowGap: 4,
    columnGap: 8,
    fontSize: 12,
  },
  metaLabel: {
    color: "#64748b",
    fontWeight: 500,
  },
  metaValue: {
    color: "#0f172a",
    wordBreak: "break-all",
  },
  inlineLink: {
    background: "none",
    border: "none",
    padding: 0,
    color: "#2563eb",
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "underline",
  },
  quickLinksRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 6,
    borderTop: "1px solid #f1f5f9",
  },
  quickBtn: {
    padding: "4px 8px",
    fontSize: 11,
    borderRadius: 4,
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#334155",
    cursor: "pointer",
  },
  statusBanner: {
    fontSize: 11,
    padding: "6px 8px",
    borderRadius: 4,
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
  },
  emptyState: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    padding: 16,
  },
};
