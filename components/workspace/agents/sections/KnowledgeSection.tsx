"use client";

import { useMemo, useState, type CSSProperties } from "react";

export type CatalogObject = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
};

type Props = {
  canEdit: boolean;
  isSaving: boolean;
  objects: CatalogObject[];
  surfaceOptions: string[];
  read: string[];
  write: string[];
  surfaces: string[];
  channels: string[];
  onSave: (payload: { read: string[]; write: string[]; surfaces: string[]; channels: string[] }) => Promise<void> | void;
};

const chipStyle = (active: boolean): CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: active ? "1px solid rgba(99,102,241,0.45)" : "1px solid var(--workspace-border)",
  background: active ? "rgba(99,102,241,0.1)" : "white",
  color: active ? "#4338ca" : "var(--workspace-text)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
});

const actionButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: "rgba(99,102,241,0.95)",
  color: "white",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

function asSet(items: string[]) {
  return new Set(items.map((item) => item.trim()).filter(Boolean));
}

function normalizeSurfaceKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function buildInitialSurfaceSet(surfaces: string[], channels: string[], knownSurfaceKeys: string[]) {
  const source = surfaces.length > 0 ? surfaces : channels;
  const allowed = new Set(knownSurfaceKeys);
  return new Set(source.map(normalizeSurfaceKey).filter((entry) => allowed.has(entry)));
}

function buildInitialAccessByObjectIds(
  objects: CatalogObject[],
  read: string[],
  write: string[],
): {
  readIds: Set<string>;
  writeIds: Set<string>;
} {
  const readSlugs = asSet(read);
  const writeSlugs = asSet(write);
  const readIds = new Set<string>();
  const writeIds = new Set<string>();
  for (const object of objects) {
    if (readSlugs.has(object.slug)) readIds.add(object.id);
    if (writeSlugs.has(object.slug)) writeIds.add(object.id);
  }
  return { readIds, writeIds };
}

export function KnowledgeSection({
  canEdit,
  isSaving,
  objects,
  surfaceOptions,
  read,
  write,
  surfaces,
  channels,
  onSave,
}: Props) {
  const knownSurfaceKeys = useMemo(
    () => surfaceOptions.map((surface) => normalizeSurfaceKey(surface)),
    [surfaceOptions],
  );

  const [draftReadIds, setDraftReadIds] = useState<Set<string>>(() =>
    buildInitialAccessByObjectIds(objects, read, write).readIds,
  );
  const [draftWriteIds, setDraftWriteIds] = useState<Set<string>>(() =>
    buildInitialAccessByObjectIds(objects, read, write).writeIds,
  );
  const [draftSurfaces, setDraftSurfaces] = useState<Set<string>>(() =>
    buildInitialSurfaceSet(surfaces, channels, knownSurfaceKeys),
  );

  const hiddenChannels = useMemo(() => {
    const normalizedSurfaceSet = new Set(knownSurfaceKeys);
    return channels
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .filter((entry) => !normalizedSurfaceSet.has(normalizeSurfaceKey(entry)));
  }, [channels, knownSurfaceKeys]);

  const objectById = useMemo(() => {
    const map = new Map<string, CatalogObject>();
    for (const object of objects) map.set(object.id, object);
    return map;
  }, [objects]);

  const toggleRead = (objectId: string) => {
    setDraftReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(objectId)) next.delete(objectId);
      else next.add(objectId);
      return next;
    });
  };

  const toggleWrite = (objectId: string) => {
    setDraftWriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(objectId)) next.delete(objectId);
      else next.add(objectId);
      return next;
    });
  };

  const toggleSurface = (surface: string) => {
    const key = normalizeSurfaceKey(surface);
    setDraftSurfaces((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveKnowledge = async () => {
    const readList = Array.from(draftReadIds)
      .map((id) => objectById.get(id)?.slug ?? "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const writeList = Array.from(draftWriteIds)
      .map((id) => objectById.get(id)?.slug ?? "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const surfacesList = Array.from(draftSurfaces).sort((a, b) => a.localeCompare(b));
    const channelsList = Array.from(new Set([...hiddenChannels, ...surfacesList])).sort((a, b) => a.localeCompare(b));
    await onSave({
      read: readList,
      write: writeList,
      surfaces: surfacesList,
      channels: channelsList,
    });
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-text)", fontWeight: 600 }}>Datos</p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
          Selecciona a que objetos tiene acceso de lectura y escritura.
        </p>
        {objects.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
            No hay objetos disponibles en este workspace.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {objects.map((object) => {
              const readActive = draftReadIds.has(object.id);
              const writeActive = draftWriteIds.has(object.id);
              return (
                <div
                  key={object.id}
                  style={{
                    border: "1px solid var(--workspace-border)",
                    borderRadius: 12,
                    background: "white",
                    padding: "10px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--workspace-text)" }}>
                      {object.name}
                    </p>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
                      {object.slug}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={chipStyle(readActive)}
                      onClick={() => toggleRead(object.id)}
                      disabled={!canEdit || isSaving}
                    >
                      Leer
                    </button>
                    <button
                      type="button"
                      style={chipStyle(writeActive)}
                      onClick={() => toggleWrite(object.id)}
                      disabled={!canEdit || isSaving}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-text)", fontWeight: 600 }}>Acceso a la app</p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
          Define que superficies puede usar el agente dentro de Prisma.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {surfaceOptions.map((surface) => {
            const key = normalizeSurfaceKey(surface);
            return (
              <button
                key={surface}
                type="button"
                style={chipStyle(draftSurfaces.has(key))}
                onClick={() => toggleSurface(surface)}
                disabled={!canEdit || isSaving}
              >
                {surface}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <button
          type="button"
          style={{ ...actionButtonStyle, opacity: !canEdit || isSaving ? 0.7 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
          onClick={() => void saveKnowledge()}
          disabled={!canEdit || isSaving}
        >
          {isSaving ? "Guardando..." : "Guardar knowledge"}
        </button>
      </div>
    </div>
  );
}
