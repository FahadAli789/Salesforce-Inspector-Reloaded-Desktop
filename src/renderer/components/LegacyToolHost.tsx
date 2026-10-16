import React, { useMemo } from "react";
import { EnvType, SubTabInstance } from "../state/workspace-store";
import { getToolDefinition } from "../services/tool-registry";

export interface LegacyToolHostProps {
  orgId: string;
  sfHost: string;
  envType: EnvType;
  subTab: SubTabInstance;
  isVisible: boolean;
}

export const LegacyToolHost = React.memo(function LegacyToolHost({
  orgId,
  sfHost,
  envType,
  subTab,
  isVisible,
}: LegacyToolHostProps) {
  const definition = getToolDefinition(subTab.toolType);
  const htmlFile = definition?.htmlFile || `${subTab.toolType}.html`;

  const cleanHost = useMemo(() => {
    return (sfHost || "")
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");
  }, [sfHost]);

  // Construct iframe URL with query params
  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      host: cleanHost,
      orgId,
      ...(subTab.initialParams || {}),
    });
    return `/addon/${htmlFile}?${params.toString()}`;
  }, [htmlFile, cleanHost, orgId, subTab.initialParams]);

  return (
    <div
      className="legacy-tool-host-container"
      style={{
        display: isVisible ? "flex" : "none",
        flexDirection: "column",
        flex: 1,
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#ffffff",
      }}
    >
      {/* Sticky High-Contrast Production Warning Banner */}
      {envType === "PROD" && subTab.toolType === "data-import" && (
        <div
          style={{
            height: 28,
            minHeight: 28,
            backgroundColor: "#dc2626",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.03em",
            padding: "0 12px",
            flexShrink: 0,
            zIndex: 1000,
            boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
          }}
        >
          {`⚠️ PRODUCTION ENVIRONMENT — Data Import operations will modify live records in ${cleanHost}`}
        </div>
      )}

      {/* Same-Origin native iframe for legacy tool */}
      <iframe
        src={iframeSrc}
        title={subTab.title}
        style={{
          border: "none",
          width: "100%",
          height: "100%",
          flex: 1,
          minHeight: 0,
          backgroundColor: "#ffffff",
        }}
      />
    </div>
  );
});
