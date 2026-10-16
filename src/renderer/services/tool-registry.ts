export type ToolType =
  | "data-export"
  | "data-import"
  | "inspect"
  | "limits"
  | "explore-api"
  | "event-monitor"
  | "field-creator";

export interface ToolDefinition {
  id: ToolType;
  title: string;
  description: string;
  htmlFile: string;
  stylesheets: string[];
}

export const toolDefinitions: Record<ToolType, ToolDefinition> = {
  "data-export": {
    id: "data-export",
    title: "Data Export",
    description: "Export data using SOQL and Tooling queries with autocomplete and CSV/Excel export",
    htmlFile: "data-export.html",
    stylesheets: ["/addon/button.css", "/addon/inspector.css", "/addon/data-export.css"],
  },
  "data-import": {
    id: "data-import",
    title: "Data Import",
    description: "Insert, update, upsert, and delete records via REST, Bulk, and Tooling APIs",
    htmlFile: "data-import.html",
    stylesheets: ["/addon/button.css", "/addon/inspector.css", "/addon/data-import.css"],
  },
  "inspect": {
    id: "inspect",
    title: "Inspect Records & Objects",
    description: "Deep object and record metadata inspector with field-level details and inline edit",
    htmlFile: "inspect.html",
    stylesheets: ["/addon/button.css", "/addon/inspector.css", "/addon/inspect.css"],
  },
  "limits": {
    id: "limits",
    title: "Org Limits",
    description: "Real-time Salesforce organisation API and resource consumption limits",
    htmlFile: "limits.html",
    stylesheets: ["/addon/button.css", "/addon/inspector.css", "/addon/limits.css"],
  },
  "explore-api": {
    id: "explore-api",
    title: "Explore API",
    description: "Execute arbitrary REST, GraphQL, Tooling, and SOAP requests interactively",
    htmlFile: "explore-api.html",
    stylesheets: ["/addon/button.css", "/addon/inspector.css", "/addon/explore-api.css"],
  },
  "event-monitor": {
    id: "event-monitor",
    title: "Event Monitor",
    description: "Stream and publish Platform Events, Change Data Capture, and Real-Time events",
    htmlFile: "event-monitor.html",
    stylesheets: ["/addon/button.css", "/addon/inspector.css", "/addon/event-monitor.css"],
  },
  "field-creator": {
    id: "field-creator",
    title: "Field Creator",
    description: "Create and manage custom Salesforce fields with automated permissions",
    htmlFile: "field-manager.html",
    stylesheets: ["/addon/button.css", "/addon/inspector.css", "/addon/field-manager.css"],
  },
};

export function getToolDefinition(type: ToolType): ToolDefinition | undefined {
  return toolDefinitions[type];
}
