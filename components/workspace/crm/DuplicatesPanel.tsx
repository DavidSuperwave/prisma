"use client";

import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";

// MergeDialog is only shown after a user clicks "merge"; defer loading it.
const MergeDialog = dynamic(
  () => import("./MergeDialog").then((mod) => ({ default: mod.MergeDialog })),
  { ssr: false, loading: () => null },
);

type Cluster = {
  key: string;
  keyType: string;
  records: Array<{ id: string; data: Record<string, unknown>; createdAt?: string }>;
};

type Props = {
  workspaceSlug: string;
  entity: "people" | "companies";
  clusters: Cluster[];
  lockedFieldKeys: string[];
  canMerge: boolean;
};

const cardStyle: CSSProperties = {
  padding: 16,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const clusterInfoStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const clusterKeyStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const clusterMetaStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 14px",
  fontSize: 12,
  fontWeight: 600,
  color: "#ffffff",
  background: "var(--workspace-accent)",
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#d1d5db",
  borderColor: "#d1d5db",
  cursor: "not-allowed",
};

export function DuplicatesPanel({ workspaceSlug, entity, clusters, lockedFieldKeys, canMerge }: Props) {
  const [activeCluster, setActiveCluster] = useState<Cluster | null>(null);
  const [localClusters, setLocalClusters] = useState(clusters);

  function handleMerged() {
    if (!activeCluster) return;
    setLocalClusters((prev) => prev.filter((cluster) => cluster.key !== activeCluster.key));
  }

  if (localClusters.length === 0) {
    return (
      <p style={{ margin: 0, padding: 20, color: "var(--workspace-muted)", fontSize: 13 }}>
        No se encontraron duplicados.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {localClusters.map((cluster) => (
        <div key={`${cluster.keyType}-${cluster.key}`} style={cardStyle}>
          <div style={clusterInfoStyle}>
            <span style={clusterKeyStyle}>
              {cluster.keyType}: {cluster.key}
            </span>
            <span style={clusterMetaStyle}>{cluster.records.length} registros coinciden</span>
          </div>
          <button
            type="button"
            disabled={!canMerge}
            style={canMerge ? primaryButtonStyle : disabledButtonStyle}
            onClick={() => setActiveCluster(cluster)}
          >
            Resolver
          </button>
        </div>
      ))}
      {activeCluster ? (
        <MergeDialog
          workspaceSlug={workspaceSlug}
          entity={entity}
          cluster={activeCluster}
          lockedFieldKeys={lockedFieldKeys}
          onClose={() => setActiveCluster(null)}
          onMerged={handleMerged}
        />
      ) : null}
    </div>
  );
}
