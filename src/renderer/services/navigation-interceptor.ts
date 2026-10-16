import type { ToolType } from "./tool-registry";

export interface ParsedToolLink {
  toolType: ToolType;
  params: Record<string, string>;
  title: string;
}

const TOOL_PATH_MAP: Record<string, ToolType> = {
  "data-export.html": "data-export",
  "data-import.html": "data-import",
  "inspect.html": "inspect",
  "limits.html": "limits",
  "explore-api.html": "explore-api",
  "event-monitor.html": "event-monitor",
  "field-creator.html": "field-creator",
  "field-manager.html": "field-creator",
};

/**
 * Parses an internal tool link (e.g. "inspect.html?objectType=Account&recordId=001...")
 * and maps it to a ToolType, URL parameters dictionary, and descriptive tab title.
 * Returns null if the href is not a recognized internal inspector tool.
 */
export function parseInternalToolLink(href: string): ParsedToolLink | null {
  if (!href) return null;

  try {
    // Support both relative paths and absolute URLs
    const url = new URL(href, "http://internal-tool.local");
    const filename = url.pathname.split("/").pop();
    if (!filename) return null;

    const toolType = TOOL_PATH_MAP[filename.toLowerCase()];
    if (!toolType) return null;

    const params: Record<string, string> = {};
    url.searchParams.forEach((val, key) => {
      params[key] = val;
    });

    // Derive a descriptive, context-rich subtab title
    let title = "";
    switch (toolType) {
      case "inspect": {
        const objectType = params.objectType;
        const recordId = params.recordId;
        if (objectType && recordId) {
          title = `Inspect: ${objectType} (${recordId.slice(0, 10)})`;
        } else if (objectType) {
          title = `Inspect: ${objectType}`;
        } else if (recordId) {
          title = `Inspect: ${recordId.slice(0, 10)}`;
        } else {
          title = "Show All Data";
        }
        break;
      }
      case "data-export": {
        const query = params.query;
        if (query) {
          const cleanQ = query.replace(/\s+/g, " ").trim();
          title = `Export: ${cleanQ.slice(0, 22)}${cleanQ.length > 22 ? "…" : ""}`;
        } else {
          title = "Data Export";
        }
        break;
      }
      case "data-import": {
        const objectType = params.objectType;
        title = objectType ? `Import: ${objectType}` : "Data Import";
        break;
      }
      case "limits": {
        title = "Org Limits";
        break;
      }
      case "explore-api": {
        title = "Explore API";
        break;
      }
      case "event-monitor": {
        title = "Event Monitor";
        break;
      }
      case "field-creator": {
        title = "Field Creator";
        break;
      }
      default: {
        title = toolType;
      }
    }

    return {
      toolType,
      params,
      title,
    };
  } catch {
    return null;
  }
}
