import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from "react";
import { OrgProfile, EnvType } from "../../shared/types/org";
import { normalizeSfHost } from "../utils/normalize-host";
import { ToolType, toolDefinitions } from "../services/tool-registry";
import { destroyOrgScopedInspector } from "@addon/inspector.js";

export type { ToolType, EnvType };

// ── Types ───────────────────────────────────────────────────────────────────

export interface SubTabInstance {
  subTabId: string;
  toolType: ToolType;
  title: string;
  initialParams: Record<string, string>;
  createdAt: number;
}

export interface MainOrgTab {
  orgId: string;
  alias: string;
  sfHost: string;
  username?: string;
  envType: EnvType;
  color: string;
  subTabs: SubTabInstance[];
  activeSubTabId: string;
}

export interface WorkspaceState {
  savedOrgs: OrgProfile[];
  mainTabs: MainOrgTab[];
  activeOrgId: string | "LAUNCHPAD";
}

// ── Action Types ────────────────────────────────────────────────────────────

type WorkspaceAction =
  | { type: "SET_SAVED_ORGS"; payload: OrgProfile[] }
  | { type: "SHOW_LAUNCHPAD" }
  | {
      type: "OPEN_ORG_WORKSPACE";
      payload: { org: OrgProfile; initialTool?: ToolType };
    }
  | { type: "SWITCH_ORG_TAB"; payload: string }
  | { type: "CLOSE_ORG_TAB"; payload: string }
  | {
      type: "OPEN_SUB_TAB";
      payload: {
        orgId: string;
        toolType: ToolType;
        initialParams?: Record<string, string>;
        customTitle?: string;
      };
    }
  | {
      type: "SWITCH_SUB_TAB";
      payload: { orgId: string; subTabId: string };
    }
  | {
      type: "CLOSE_SUB_TAB";
      payload: { orgId: string; subTabId: string };
    };

// ── Helper ──────────────────────────────────────────────────────────────────

function createDefaultSubTab(toolType: ToolType = "data-export", customTitle?: string): SubTabInstance {
  return {
    subTabId: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    toolType,
    title: customTitle || toolDefinitions[toolType]?.title || "Data Export",
    initialParams: {},
    createdAt: Date.now(),
  };
}

// ── Reducer ─────────────────────────────────────────────────────────────────

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "SET_SAVED_ORGS": {
      return {
        ...state,
        savedOrgs: action.payload,
      };
    }

    case "SHOW_LAUNCHPAD": {
      return {
        ...state,
        activeOrgId: "LAUNCHPAD",
      };
    }

    case "OPEN_ORG_WORKSPACE": {
      const { org, initialTool } = action.payload;
      const existingTab = state.mainTabs.find(t => t.orgId === org.orgId);

      if (existingTab) {
        // If an initialTool was requested and it's not the active one, or if needed
        if (initialTool && initialTool !== "data-export") {
          const newSubTab = createDefaultSubTab(initialTool);
          const updatedTabs = state.mainTabs.map(t =>
            t.orgId === org.orgId
              ? {
                  ...t,
                  subTabs: [...t.subTabs, newSubTab],
                  activeSubTabId: newSubTab.subTabId,
                }
              : t
          );
          return {
            ...state,
            mainTabs: updatedTabs,
            activeOrgId: org.orgId,
          };
        }

        return {
          ...state,
          activeOrgId: org.orgId,
        };
      }

      const initialSubTabs = initialTool ? [createDefaultSubTab(initialTool)] : [];
      const initialActiveId = initialSubTabs[0]?.subTabId || "HOME";

      const normalizedHost = normalizeSfHost(org.sfHost);
      const newMainTab: MainOrgTab = {
        orgId: org.orgId,
        alias: org.alias || normalizedHost,
        sfHost: normalizedHost,
        username: org.username,
        envType: org.orgType,
        color: org.color || "#2563eb",
        subTabs: initialSubTabs,
        activeSubTabId: initialActiveId,
      };

      return {
        ...state,
        mainTabs: [...state.mainTabs, newMainTab],
        activeOrgId: org.orgId,
      };
    }

    case "SWITCH_ORG_TAB": {
      const orgId = action.payload;
      if (state.activeOrgId === orgId) return state;
      return {
        ...state,
        activeOrgId: orgId,
      };
    }

    case "CLOSE_ORG_TAB": {
      const orgIdToClose = action.payload;

      // Free cached describe data from memory
      try {
        destroyOrgScopedInspector(orgIdToClose);
      } catch (err) {
        console.error(`Failed to destroy scoped inspector for ${orgIdToClose}:`, err);
      }

      const updatedTabs = state.mainTabs.filter(t => t.orgId !== orgIdToClose);
      let nextActiveOrgId = state.activeOrgId;

      if (state.activeOrgId === orgIdToClose) {
        // Switch to adjacent tab if available, otherwise return to LAUNCHPAD
        nextActiveOrgId = updatedTabs.length > 0 ? updatedTabs[updatedTabs.length - 1].orgId : "LAUNCHPAD";
      }

      return {
        ...state,
        mainTabs: updatedTabs,
        activeOrgId: nextActiveOrgId,
      };
    }

    case "OPEN_SUB_TAB": {
      const { orgId, toolType, initialParams = {}, customTitle } = action.payload;
      const subTabId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const title = customTitle || toolDefinitions[toolType]?.title || toolType;

      const newSubTab: SubTabInstance = {
        subTabId,
        toolType,
        title,
        initialParams,
        createdAt: Date.now(),
      };

      const updatedTabs = state.mainTabs.map(tab => {
        if (tab.orgId !== orgId) return tab;
        return {
          ...tab,
          subTabs: [...tab.subTabs, newSubTab],
          activeSubTabId: subTabId,
        };
      });

      return {
        ...state,
        mainTabs: updatedTabs,
        activeOrgId: orgId,
      };
    }

    case "SWITCH_SUB_TAB": {
      const { orgId, subTabId } = action.payload;
      const updatedTabs = state.mainTabs.map(tab => {
        if (tab.orgId !== orgId) return tab;
        return {
          ...tab,
          activeSubTabId: subTabId,
        };
      });

      return {
        ...state,
        mainTabs: updatedTabs,
      };
    }

    case "CLOSE_SUB_TAB": {
      const { orgId, subTabId } = action.payload;
      const updatedTabs = state.mainTabs.map(tab => {
        if (tab.orgId !== orgId) return tab;

        const filteredSubTabs = tab.subTabs.filter(s => s.subTabId !== subTabId);

        let nextSubTabs = filteredSubTabs;
        let nextActiveSubTabId = tab.activeSubTabId;

        // If no subtabs remain in this org, switch back to 'HOME' view
        if (nextSubTabs.length === 0) {
          nextActiveSubTabId = "HOME";
        } else if (tab.activeSubTabId === subTabId) {
          // Switch to adjacent tab
          nextActiveSubTabId = nextSubTabs[nextSubTabs.length - 1].subTabId;
        }

        return {
          ...tab,
          subTabs: nextSubTabs,
          activeSubTabId: nextActiveSubTabId,
        };
      });

      return {
        ...state,
        mainTabs: updatedTabs,
      };
    }

    default:
      return state;
  }
}

// ── Context & Provider ──────────────────────────────────────────────────────

export interface WorkspaceContextValue {
  state: WorkspaceState;
  refreshSavedOrgs: () => Promise<void>;
  openOrgWorkspace: (org: OrgProfile, initialTool?: ToolType) => void;
  showLaunchpad: () => void;
  switchOrgTab: (orgId: string) => void;
  closeOrgTab: (orgId: string) => void;
  openSubTab: (
    orgId: string,
    toolType: ToolType,
    initialParams?: Record<string, string>,
    customTitle?: string
  ) => void;
  switchSubTab: (orgId: string, subTabId: string) => void;
  closeSubTab: (orgId: string, subTabId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, {
    savedOrgs: [],
    mainTabs: [],
    activeOrgId: "LAUNCHPAD",
  });

  const refreshSavedOrgs = useCallback(async () => {
    const electronApi = (window as any).electronApi;
    if (!electronApi?.listOrgs) return;
    try {
      const orgs = await electronApi.listOrgs();
      dispatch({ type: "SET_SAVED_ORGS", payload: orgs || [] });
    } catch (err) {
      console.error("Failed to load saved orgs:", err);
    }
  }, []);

  useEffect(() => {
    refreshSavedOrgs();
  }, [refreshSavedOrgs]);

  const openOrgWorkspace = (org: OrgProfile, initialTool?: ToolType) => {
    dispatch({ type: "OPEN_ORG_WORKSPACE", payload: { org, initialTool } });
  };

  const showLaunchpad = () => {
    dispatch({ type: "SHOW_LAUNCHPAD" });
  };

  const switchOrgTab = (orgId: string) => {
    dispatch({ type: "SWITCH_ORG_TAB", payload: orgId });
  };

  const closeOrgTab = (orgId: string) => {
    dispatch({ type: "CLOSE_ORG_TAB", payload: orgId });
  };

  const openSubTab = (
    orgId: string,
    toolType: ToolType,
    initialParams?: Record<string, string>,
    customTitle?: string
  ) => {
    dispatch({
      type: "OPEN_SUB_TAB",
      payload: { orgId, toolType, initialParams, customTitle },
    });
  };

  const switchSubTab = (orgId: string, subTabId: string) => {
    dispatch({ type: "SWITCH_SUB_TAB", payload: { orgId, subTabId } });
  };

  const closeSubTab = (orgId: string, subTabId: string) => {
    dispatch({ type: "CLOSE_SUB_TAB", payload: { orgId, subTabId } });
  };

  return (
    <WorkspaceContext.Provider
      value={{
        state,
        refreshSavedOrgs,
        openOrgWorkspace,
        showLaunchpad,
        switchOrgTab,
        closeOrgTab,
        openSubTab,
        switchSubTab,
        closeSubTab,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
