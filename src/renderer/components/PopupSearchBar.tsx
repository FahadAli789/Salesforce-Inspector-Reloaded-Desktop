import React, { useState, useEffect, useMemo, useRef } from "react";
import { useWorkspace } from "../state/workspace-store";
import {
  SObjectDescribeItem,
  resolveSalesforceId,
  ResolvedRecordId,
} from "../utils/sfIdResolver";
import { fetchGlobalDescribe } from "../services/describe-service";
import { toolDefinitions, ToolType } from "../services/tool-registry";

interface PopupSearchBarProps {
  orgId: string;
  sfHost: string;
  onNavigate?: () => void;
  autoFocus?: boolean;
}

interface UserSearchResult {
  Id: string;
  Name: string;
  Username: string;
  Email: string;
  IsActive: boolean;
}

export function PopupSearchBar({
  orgId,
  sfHost,
  onNavigate,
  autoFocus = true,
}: PopupSearchBarProps) {
  const { openSubTab } = useWorkspace();
  const [searchTerm, setSearchTerm] = useState("");
  const [sobjects, setSobjects] = useState<SObjectDescribeItem[]>([]);
  const [prefixMap, setPrefixMap] = useState<Map<string, SObjectDescribeItem[]>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // User search state
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load Global Describe
  const loadDescribe = async (force = false) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchGlobalDescribe(sfHost, force);
      setSobjects(data.sobjects);
      setPrefixMap(data.prefixMap);
    } catch (err: any) {
      console.error("[PopupSearchBar] Describe fetch error:", err);
      setLoadError(err.message || "Failed to load org metadata");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDescribe(false);
  }, [sfHost]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // 1. Resolve Salesforce ID or URL
  const resolvedId: ResolvedRecordId | null = useMemo(() => {
    if (!searchTerm.trim()) return null;
    return resolveSalesforceId(searchTerm, prefixMap);
  }, [searchTerm, prefixMap]);

  // 2. Filter SObjects
  const filteredSObjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term || resolvedId) return [];

    return sobjects
      .filter((obj) => {
        const nameMatch = obj.name.toLowerCase().includes(term);
        const labelMatch = obj.label.toLowerCase().includes(term);
        const prefixMatch =
          obj.keyPrefix && obj.keyPrefix.toLowerCase() === term;
        return nameMatch || labelMatch || prefixMatch;
      })
      .slice(0, 15);
  }, [searchTerm, sobjects, resolvedId]);

  // 3. Filter Tools
  const filteredTools = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term || resolvedId) return [];

    return Object.values(toolDefinitions).filter((tool) => {
      return (
        tool.title.toLowerCase().includes(term) ||
        tool.description.toLowerCase().includes(term) ||
        tool.id.toLowerCase().includes(term)
      );
    });
  }, [searchTerm, resolvedId]);

  // 4. Query Users via SOQL if search term looks like a user search
  useEffect(() => {
    const term = searchTerm.trim();
    if (
      !term ||
      term.length < 3 ||
      resolvedId ||
      term.startsWith("001") ||
      term.length === 15 ||
      term.length === 18
    ) {
      setUserResults([]);
      setIsSearchingUsers(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      const electronApi =
        (window as any).electronApi || (window as any).electronAPI;
      if (!electronApi?.sfRestRequest) return;

      setIsSearchingUsers(true);
      try {
        const escaped = term.replace(/'/g, "\\'");
        const soql = `SELECT Id, Name, Username, Email, IsActive FROM User WHERE (Name LIKE '%${escaped}%' OR Username LIKE '%${escaped}%' OR Email LIKE '%${escaped}%') LIMIT 5`;
        const res = await electronApi.sfRestRequest({
          sfHost,
          path: `/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`,
          method: "GET",
        });
        if (active && res?.records) {
          setUserResults(res.records);
        }
      } catch {
        if (active) setUserResults([]);
      } finally {
        if (active) setIsSearchingUsers(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchTerm, sfHost, resolvedId]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(label);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenBrowser = (relUrl: string) => {
    const electronApi =
      (window as any).electronApi || (window as any).electronAPI;
    if (electronApi?.openOrgFrontdoor) {
      electronApi.openOrgFrontdoor(orgId, relUrl);
    } else {
      window.open(`https://${sfHost}${relUrl}`, "_blank");
    }
    if (onNavigate) onNavigate();
  };

  const handleInspectRecord = (objectType: string, recordId: string) => {
    openSubTab(
      orgId,
      "inspect",
      { objectType, recordId },
      `Inspect: ${objectType} (${recordId.slice(0, 10)})`
    );
    if (onNavigate) onNavigate();
  };

  const handleInspectObject = (objectType: string) => {
    openSubTab(
      orgId,
      "inspect",
      { objectType },
      `Inspect: ${objectType}`
    );
    if (onNavigate) onNavigate();
  };

  const handleExportQuery = (query: string, title?: string) => {
    openSubTab(
      orgId,
      "data-export",
      { query },
      title || "Data Export"
    );
    if (onNavigate) onNavigate();
  };

  const handleLaunchTool = (toolType: ToolType, title: string) => {
    openSubTab(orgId, toolType, {}, title);
    if (onNavigate) onNavigate();
  };

  return (
    <div style={styles.container}>
      {/* ── Search Input Box ── */}
      <div style={styles.inputWrapper}>
        <span style={styles.searchIcon}>🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search SObjects, 3-char prefix (001), 15/18-char Record ID, Users, Tools..."
          style={styles.input}
        />
        {isLoading && (
          <span style={styles.loadingSpinner} title="Syncing org metadata...">
            ⏳
          </span>
        )}
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            style={styles.clearBtn}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {loadError && (
        <div style={styles.errorBanner}>
          <span>⚠️ {loadError}</span>
          <button
            type="button"
            onClick={() => loadDescribe(true)}
            style={styles.retryBtn}
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* ── Results Container ── */}
      <div style={styles.resultsArea}>
        {/* 1. Resolved Salesforce Record Card */}
        {resolvedId && (
          <div style={styles.resolvedCard}>
            <div style={styles.resolvedHeader}>
              <div style={styles.resolvedBadgeRow}>
                <span style={styles.resolvedTypeBadge}>
                  {resolvedId.matchedObjects[0]?.label || "Record ID"}
                </span>
                <span style={styles.keyPrefixBadge}>
                  Prefix: <strong>{resolvedId.keyPrefix}</strong>
                </span>
                {resolvedId.matchedObjects[0]?.custom && (
                  <span style={styles.customBadge}>Custom Object</span>
                )}
              </div>
              <span style={styles.resolvedSubtitle}>
                {resolvedId.matchedObjects[0]?.name
                  ? `Resolved to SObject: ${resolvedId.matchedObjects[0].name}`
                  : "Salesforce ID detected (KeyPrefix not yet cached)"}
              </span>
            </div>

            <div style={styles.idDisplayGrid}>
              <div style={styles.idBox}>
                <span style={styles.idLabel}>18-Char Case-Safe ID:</span>
                <span style={styles.idValue}>{resolvedId.id18}</span>
                <button
                  type="button"
                  style={styles.copyBtn}
                  onClick={() => handleCopy(resolvedId.id18, "18")}
                >
                  {copiedId === "18" ? "✓ Copied!" : "📋 Copy"}
                </button>
              </div>

              <div style={styles.idBox}>
                <span style={styles.idLabel}>15-Char ID:</span>
                <span style={styles.idValue}>{resolvedId.id15}</span>
                <button
                  type="button"
                  style={styles.copyBtn}
                  onClick={() => handleCopy(resolvedId.id15, "15")}
                >
                  {copiedId === "15" ? "✓ Copied!" : "📋 Copy"}
                </button>
              </div>
            </div>

            {/* Actions for resolved ID */}
            <div style={styles.actionRow}>
              <button
                type="button"
                style={{ ...styles.actionBtn, ...styles.primaryActionBtn }}
                onClick={() =>
                  handleInspectRecord(
                    resolvedId.matchedObjects[0]?.name || "",
                    resolvedId.id18
                  )
                }
              >
                🔍 Show All Data / Inspect Record
              </button>

              <button
                type="button"
                style={styles.actionBtn}
                onClick={() => {
                  const objName = resolvedId.matchedObjects[0]?.name || "Record";
                  handleExportQuery(
                    `SELECT Id, Name FROM ${objName} WHERE Id = '${resolvedId.id18}'`,
                    `Export: ${objName}`
                  );
                }}
              >
                ⚡ Query in Data Export
              </button>

              <button
                type="button"
                style={styles.actionBtn}
                onClick={() => handleOpenBrowser(`/${resolvedId.id18}`)}
              >
                ↗ Open Record in Salesforce
              </button>
            </div>
          </div>
        )}

        {/* 2. Matched Tools */}
        {filteredTools.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              <span>🛠 Inspector Tools</span>
            </div>
            <div style={styles.toolGrid}>
              {filteredTools.map((tool) => (
                <div
                  key={tool.id}
                  style={styles.toolCard}
                  onClick={() => handleLaunchTool(tool.id, tool.title)}
                >
                  <span style={styles.toolTitle}>{tool.title}</span>
                  <span style={styles.toolDesc}>{tool.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Matched SObjects */}
        {filteredSObjects.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              <span>📦 SObjects ({filteredSObjects.length})</span>
            </div>
            <div style={styles.list}>
              {filteredSObjects.map((obj) => (
                <div key={obj.name} style={styles.listItem}>
                  <div style={styles.itemInfo}>
                    <div style={styles.itemTitleRow}>
                      <span style={styles.itemTitle}>{obj.label}</span>
                      <span style={styles.itemApiName}>({obj.name})</span>
                      {obj.keyPrefix && (
                        <span style={styles.prefixTag}>[{obj.keyPrefix}]</span>
                      )}
                      {obj.custom && (
                        <span style={styles.customTag}>Custom</span>
                      )}
                    </div>
                  </div>

                  <div style={styles.itemActions}>
                    <button
                      type="button"
                      style={styles.smallActionBtn}
                      onClick={() => handleInspectObject(obj.name)}
                      title="Inspect SObject Metadata & Fields"
                    >
                      🔍 Inspect
                    </button>
                    <button
                      type="button"
                      style={styles.smallActionBtn}
                      onClick={() =>
                        handleExportQuery(
                          `SELECT Id, Name FROM ${obj.name} LIMIT 100`,
                          `Export: ${obj.label}`
                        )
                      }
                      title="Query records in Data Export"
                    >
                      ⚡ Export
                    </button>
                    <button
                      type="button"
                      style={styles.smallActionBtn}
                      onClick={() =>
                        handleOpenBrowser(
                          obj.custom
                            ? `/lightning/setup/ObjectManager/${obj.name}/view`
                            : `/lightning/o/${obj.name}/list?filterName=Recent`
                        )
                      }
                      title="Open in Salesforce"
                    >
                      ↗ Browser
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Matched Users */}
        {(userResults.length > 0 || isSearchingUsers) && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              <span>👤 Users {isSearchingUsers && " (searching...)"}</span>
            </div>
            <div style={styles.list}>
              {userResults.map((u) => (
                <div key={u.Id} style={styles.listItem}>
                  <div style={styles.itemInfo}>
                    <div style={styles.itemTitleRow}>
                      <span style={styles.itemTitle}>{u.Name}</span>
                      <span style={styles.itemApiName}>&lt;{u.Username}&gt;</span>
                      {!u.IsActive && (
                        <span style={{ ...styles.customTag, backgroundColor: "#fee2e2", color: "#b91c1c" }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{u.Email} • ID: {u.Id}</span>
                  </div>

                  <div style={styles.itemActions}>
                    {u.IsActive && (
                      <>
                        <button
                          type="button"
                          style={{ ...styles.smallActionBtn, backgroundColor: "#2563eb", color: "#ffffff", borderColor: "#2563eb" }}
                          onClick={() => {
                            const loginAsPath = `/servlet/servlet.su?oid=${encodeURIComponent(orgId)}&suorgadminid=${encodeURIComponent(u.Id)}&retURL=/lightning/page/home&targetURL=/lightning/page/home`;
                            handleOpenBrowser(loginAsPath);
                          }}
                          title="Login As User (Default session)"
                        >
                          🔑 LoginAs
                        </button>
                        <button
                          type="button"
                          style={{ ...styles.smallActionBtn, backgroundColor: "#0f172a", color: "#ffffff", borderColor: "#0f172a" }}
                          onClick={async () => {
                            const electronApi = (window as any).electronApi || (window as any).electronAPI;
                            if (electronApi?.loginAsUser) {
                              await electronApi.loginAsUser({
                                orgId,
                                targetUserId: u.Id,
                                isolationMode: "incognito",
                              });
                            }
                          }}
                          title="Login As in Incognito / InPrivate"
                        >
                          🕵️ Incognito
                        </button>
                        <button
                          type="button"
                          style={styles.smallActionBtn}
                          onClick={async () => {
                            const electronApi = (window as any).electronApi || (window as any).electronAPI;
                            if (electronApi?.loginAsUser) {
                              await electronApi.loginAsUser({
                                orgId,
                                targetUserId: u.Id,
                                isolationMode: "isolated-profile",
                              });
                            }
                          }}
                          title="Login As in New Isolated Profile"
                        >
                          🗂️ Profile
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      style={styles.smallActionBtn}
                      onClick={() => handleInspectRecord("User", u.Id)}
                    >
                      🔍 Inspect
                    </button>
                    <button
                      type="button"
                      style={styles.smallActionBtn}
                      onClick={() => handleOpenBrowser(`/${u.Id}`)}
                    >
                      ↗ Browser
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State when typing but nothing matched */}
        {searchTerm.trim().length > 0 &&
          !resolvedId &&
          filteredTools.length === 0 &&
          filteredSObjects.length === 0 &&
          userResults.length === 0 &&
          !isSearchingUsers && (
            <div style={styles.emptyState}>
              <span style={{ fontSize: 24, marginBottom: 8 }}>🔎</span>
              <span style={{ fontWeight: 600, color: "#334155" }}>
                No matching SObjects, tools, or record IDs found
              </span>
              <span style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                Try searching by exact KeyPrefix (e.g. "001"), API Name ("Account"), or paste a 15/18-character ID.
              </span>
            </div>
          )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: 900,
    margin: "0 auto",
  },
  inputWrapper: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#ffffff",
    border: "2px solid #3b82f6",
    borderRadius: 12,
    padding: "10px 16px",
    boxShadow: "0 4px 20px -2px rgba(59, 130, 246, 0.15)",
    position: "relative",
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
    color: "#64748b",
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: 15,
    fontWeight: 500,
    color: "#0f172a",
    backgroundColor: "transparent",
  },
  loadingSpinner: {
    fontSize: 14,
    marginRight: 8,
    animation: "spin 1s linear infinite",
  },
  clearBtn: {
    border: "none",
    background: "#f1f5f9",
    color: "#64748b",
    borderRadius: "50%",
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: "bold",
  },
  errorBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    color: "#991b1b",
    padding: "8px 12px",
    borderRadius: 8,
    marginTop: 8,
    fontSize: 12,
  },
  retryBtn: {
    border: "1px solid #f87171",
    background: "#ffffff",
    color: "#991b1b",
    padding: "2px 8px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
  resultsArea: {
    marginTop: 14,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  resolvedCard: {
    backgroundColor: "#f8fafc",
    border: "2px solid #22c55e",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 4px 14px rgba(34, 197, 94, 0.12)",
  },
  resolvedHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 12,
  },
  resolvedBadgeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  resolvedTypeBadge: {
    backgroundColor: "#22c55e",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 13,
    padding: "3px 10px",
    borderRadius: 6,
    letterSpacing: "0.02em",
  },
  keyPrefixBadge: {
    backgroundColor: "#e2e8f0",
    color: "#334155",
    fontSize: 11.5,
    padding: "2px 8px",
    borderRadius: 4,
  },
  customBadge: {
    backgroundColor: "#ede9fe",
    color: "#6d28d9",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
  },
  resolvedSubtitle: {
    fontSize: 12,
    color: "#64748b",
  },
  idDisplayGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 14,
  },
  idBox: {
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  idLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: 600,
  },
  idValue: {
    flex: 1,
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
  },
  copyBtn: {
    border: "1px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#475569",
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
  actionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    color: "#1e293b",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  primaryActionBtn: {
    backgroundColor: "#0ea5e9",
    color: "#ffffff",
    borderColor: "#0284c7",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  toolGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 8,
  },
  toolCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    cursor: "pointer",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  toolTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1e293b",
  },
  toolDesc: {
    fontSize: 11,
    color: "#64748b",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
  },
  listItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid #f1f5f9",
    transition: "background-color 0.15s ease",
  },
  itemInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  itemTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  itemTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "#0f172a",
  },
  itemApiName: {
    fontSize: 12,
    color: "#64748b",
    fontFamily: "monospace",
  },
  prefixTag: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    fontSize: 10.5,
    padding: "1px 5px",
    borderRadius: 4,
    fontFamily: "monospace",
  },
  customTag: {
    backgroundColor: "#eff6ff",
    color: "#2563eb",
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 5px",
    borderRadius: 4,
  },
  itemActions: {
    display: "flex",
    gap: 6,
  },
  smallActionBtn: {
    border: "1px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#334155",
    borderRadius: 5,
    padding: "4px 8px",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "36px 16px",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    border: "1px dashed #cbd5e1",
    textAlign: "center",
  },
};
