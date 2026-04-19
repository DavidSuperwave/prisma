"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Home,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import dynamic from "next/dynamic";
import type { DocumentItem, DocumentKind, FolderNode } from "./types";

// PreviewPane pulls in xlsx and other heavy document renderers. Defer loading
// until the user actually opens a preview.
const PreviewPane = dynamic(
  () => import("./PreviewPane").then((mod) => ({ default: mod.PreviewPane })),
  { ssr: false, loading: () => null },
);

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  documentsObjectId: string;
  currentRole: string;
  initialFolderId?: string | null;
  initialFileId?: string | null;
};

type FolderTreeNode = FolderNode & { children: FolderTreeNode[] };

type ViewMode = "grid" | "list";

const ROOT_KEY = "__root__";

export function DocumentsLibraryPanel(props: Props) {
  const { workspaceSlug, currentRole } = props;
  const canEdit = currentRole !== "viewer";

  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [rootFileCount, setRootFileCount] = useState(0);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(props.initialFolderId ?? null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(props.initialFileId ?? null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null | undefined>(undefined);
  const [menuDocumentId, setMenuDocumentId] = useState<string | null>(null);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<
    | { kind: "folder"; id: string; name: string }
    | { kind: "document"; id: string; name: string }
    | null
  >(null);
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/folders`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudo cargar la estructura de carpetas.");
      setFolders(json.folders ?? []);
      setRootFileCount(json.rootFileCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando carpetas.");
    } finally {
      setLoadingFolders(false);
    }
  }, [workspaceSlug]);

  const fetchDocuments = useCallback(async () => {
    setLoadingDocuments(true);
    try {
      const url = new URL(`/api/workspaces/${workspaceSlug}/documents`, window.location.origin);
      if (currentFolderId) {
        url.searchParams.set("folder_id", currentFolderId);
      } else {
        url.searchParams.set("folder_id", "root");
      }
      if (search.trim()) {
        url.searchParams.set("q", search.trim());
      }
      url.searchParams.set("limit", "300");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudieron cargar los documentos.");
      setDocuments(json.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando documentos.");
    } finally {
      setLoadingDocuments(false);
    }
  }, [workspaceSlug, currentFolderId, search]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Sync URL shallow so deep links work
  useEffect(() => {
    const url = new URL(window.location.href);
    if (currentFolderId) {
      url.searchParams.set("folder", currentFolderId);
    } else {
      url.searchParams.delete("folder");
    }
    if (selectedDocumentId) {
      url.searchParams.set("file", selectedDocumentId);
    } else {
      url.searchParams.delete("file");
    }
    window.history.replaceState({}, "", url.toString());
  }, [currentFolderId, selectedDocumentId]);

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const folderById = useMemo(() => {
    const map = new Map<string, FolderNode>();
    folders.forEach((f) => map.set(f.id, f));
    return map;
  }, [folders]);

  const breadcrumbs = useMemo(() => {
    const trail: FolderNode[] = [];
    let cursor = currentFolderId;
    const guard = new Set<string>();
    while (cursor) {
      if (guard.has(cursor)) break;
      guard.add(cursor);
      const folder = folderById.get(cursor);
      if (!folder) break;
      trail.unshift(folder);
      cursor = folder.parentId;
    }
    return trail;
  }, [currentFolderId, folderById]);

  const selectedDocument = useMemo(
    () => (selectedDocumentId ? documents.find((doc) => doc.id === selectedDocumentId) ?? null : null),
    [documents, selectedDocumentId],
  );

  const toggleFolderExpanded = useCallback((id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!canEdit || files.length === 0) return;
      setUploading(true);
      setUploadError(null);
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          if (currentFolderId) {
            formData.append("folder_id", currentFolderId);
          }
          const res = await fetch(`/api/workspaces/${workspaceSlug}/documents`, {
            method: "POST",
            body: formData,
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error ?? `No se pudo subir ${file.name}.`);
        }
        await Promise.all([fetchFolders(), fetchDocuments()]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Error subiendo archivo.");
      } finally {
        setUploading(false);
      }
    },
    [canEdit, currentFolderId, workspaceSlug, fetchFolders, fetchDocuments],
  );

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleUpload(files);
    }
    event.target.value = "";
  };

  const handleContainerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragOverFolderId(null);
    }
  };
  const handleContainerDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      event.preventDefault();
      handleUpload(event.dataTransfer.files);
      setDragOverFolderId(undefined);
    }
  };

  const handleCreateFolder = async (parentId: string | null, name: string) => {
    if (!name.trim()) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parent_id: parentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudo crear la carpeta.");
      await fetchFolders();
      if (parentId) {
        setExpandedFolderIds((prev) => {
          const next = new Set(prev);
          next.add(parentId);
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando carpeta.");
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudo renombrar la carpeta.");
      await fetchFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error renombrando carpeta.");
    }
  };

  const handleDeleteFolder = async (id: string) => {
    const folder = folderById.get(id);
    if (!folder) return;
    const confirmed = window.confirm(
      `¿Eliminar la carpeta "${folder.name}"? Si tiene archivos se moverán a la raíz.`,
    );
    if (!confirmed) return;
    try {
      let res = await fetch(`/api/workspaces/${workspaceSlug}/folders/${id}`, { method: "DELETE" });
      let json = await res.json();
      if (res.status === 409 && json?.requiresCascade) {
        res = await fetch(`/api/workspaces/${workspaceSlug}/folders/${id}?cascade=true`, {
          method: "DELETE",
        });
        json = await res.json();
      }
      if (!res.ok) throw new Error(json?.error ?? "No se pudo eliminar la carpeta.");
      if (currentFolderId === id) {
        setCurrentFolderId(folder.parentId);
      }
      await Promise.all([fetchFolders(), fetchDocuments()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando carpeta.");
    }
  };

  const handleRenameDocument = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudo renombrar.");
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error renombrando documento.");
    }
  };

  const handleMoveDocument = async (id: string, folderId: string | null) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudo mover el documento.");
      await Promise.all([fetchDocuments(), fetchFolders()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error moviendo documento.");
    }
  };

  const handleDeleteDocument = async (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    if (!window.confirm(`¿Eliminar "${doc.fileName}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/documents/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudo eliminar.");
      if (selectedDocumentId === id) setSelectedDocumentId(null);
      await Promise.all([fetchDocuments(), fetchFolders()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando documento.");
    }
  };

  return (
    <div
      onDragOver={handleContainerDragOver}
      onDrop={handleContainerDrop}
      style={{
        display: "flex",
        height: "calc(100vh - 48px)",
        minHeight: 600,
        border: "1px solid var(--workspace-border)",
        borderRadius: 16,
        overflow: "hidden",
        background: "var(--workspace-surface)",
        boxShadow: "var(--workspace-shadow)",
      }}
    >
      {/* Left: folder tree */}
      <nav
        aria-label="Carpetas"
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: "1px solid var(--workspace-border)",
          background: "var(--workspace-panel-soft)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 14px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--workspace-faint)" }}>
            Biblioteca
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setNewFolderParent(null)}
              title="Nueva carpeta en la raíz"
              style={iconButtonStyle}
            >
              <FolderPlus size={14} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 6px 12px" }}>
          <TreeRow
            label="Todos los archivos"
            icon={<Home size={14} />}
            depth={0}
            active={currentFolderId === null}
            count={rootFileCount}
            onClick={() => {
              setCurrentFolderId(null);
              setSelectedDocumentId(null);
            }}
            onDragOver={(e) => {
              if (!canEdit) return;
              if (e.dataTransfer.types.includes("application/x-prisma-doc")) {
                e.preventDefault();
                setDragOverFolderId(null);
              }
            }}
            onDrop={(e) => {
              const docId = e.dataTransfer.getData("application/x-prisma-doc");
              if (docId) {
                e.preventDefault();
                handleMoveDocument(docId, null);
              }
              setDragOverFolderId(undefined);
            }}
            dragHighlight={dragOverFolderId === null}
          />
          {loadingFolders ? (
            <div style={{ padding: "12px 10px", color: "var(--workspace-muted)", fontSize: 12 }}>Cargando...</div>
          ) : (
            <FolderTreeList
              nodes={folderTree}
              depth={1}
              currentFolderId={currentFolderId}
              expanded={expandedFolderIds}
              onToggle={toggleFolderExpanded}
              onSelect={(id) => {
                setCurrentFolderId(id);
                setSelectedDocumentId(null);
              }}
              onMenuOpen={(id) => setMenuFolderId(id)}
              menuFolderId={menuFolderId}
              onMenuClose={() => setMenuFolderId(null)}
              onRename={(id) => {
                const folder = folderById.get(id);
                if (folder) setRenaming({ kind: "folder", id, name: folder.name });
                setMenuFolderId(null);
              }}
              onDelete={(id) => {
                handleDeleteFolder(id);
                setMenuFolderId(null);
              }}
              onNewSubfolder={(parentId) => {
                setNewFolderParent(parentId);
                setMenuFolderId(null);
              }}
              onDropDocument={handleMoveDocument}
              canEdit={canEdit}
              dragOverFolderId={dragOverFolderId}
              setDragOverFolderId={setDragOverFolderId}
            />
          )}
        </div>
      </nav>

      {/* Main column */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 20px",
            borderBottom: "1px solid var(--workspace-border)",
            background: "var(--workspace-panel)",
            flexWrap: "wrap",
          }}
        >
          <Breadcrumbs
            breadcrumbs={breadcrumbs}
            onSelectRoot={() => {
              setCurrentFolderId(null);
              setSelectedDocumentId(null);
            }}
            onSelectFolder={(id) => {
              setCurrentFolderId(id);
              setSelectedDocumentId(null);
            }}
          />
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              border: "1px solid var(--workspace-border)",
              borderRadius: 10,
              background: "var(--workspace-surface)",
              minWidth: 220,
            }}
          >
            <Search size={14} color="var(--workspace-muted)" />
            <input
              type="text"
              value={search}
              placeholder="Buscar archivos..."
              onChange={(e) => setSearch(e.target.value)}
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, flex: 1, color: "var(--workspace-text)" }}
            />
          </div>
          <div
            style={{
              display: "flex",
              border: "1px solid var(--workspace-border)",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--workspace-surface)",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              style={{
                ...viewModeButton,
                background: viewMode === "grid" ? "var(--workspace-accent-soft)" : "transparent",
                color: viewMode === "grid" ? "var(--workspace-accent-strong)" : "var(--workspace-muted)",
              }}
            >
              Cuadrícula
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              style={{
                ...viewModeButton,
                background: viewMode === "list" ? "var(--workspace-accent-soft)" : "transparent",
                color: viewMode === "list" ? "var(--workspace-accent-strong)" : "var(--workspace-muted)",
              }}
            >
              Lista
            </button>
          </div>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setNewFolderParent(currentFolderId ?? null)}
                style={secondaryButtonStyle}
              >
                <FolderPlus size={14} /> Nueva carpeta
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ ...primaryButtonStyle, opacity: uploading ? 0.7 : 1 }}
              >
                <Upload size={14} /> {uploading ? "Subiendo..." : "Subir archivos"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInputChange}
                style={{ display: "none" }}
              />
            </>
          )}
        </header>

        {(error || uploadError) && (
          <div
            style={{
              margin: "12px 20px 0",
              padding: "10px 14px",
              border: "1px solid var(--workspace-danger-border)",
              background: "var(--workspace-danger-soft)",
              color: "var(--workspace-danger)",
              borderRadius: 10,
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>{uploadError ?? error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setUploadError(null);
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--workspace-danger)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>
          </div>
        )}

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {loadingDocuments ? (
              <div style={{ color: "var(--workspace-muted)", fontSize: 13 }}>Cargando documentos...</div>
            ) : (
              <FileArea
                viewMode={viewMode}
                documents={documents}
                folderChildren={folderTree.filter((f) => (currentFolderId ? f.parentId === currentFolderId : f.parentId === null))}
                selectedDocumentId={selectedDocumentId}
                menuDocumentId={menuDocumentId}
                onOpenDocument={(id) => setSelectedDocumentId(id)}
                onEnterFolder={(id) => setCurrentFolderId(id)}
                onOpenDocumentMenu={(id) => setMenuDocumentId(id)}
                onCloseDocumentMenu={() => setMenuDocumentId(null)}
                onRenameDocument={(id) => {
                  const doc = documents.find((d) => d.id === id);
                  if (doc) setRenaming({ kind: "document", id, name: doc.fileName });
                  setMenuDocumentId(null);
                }}
                onDeleteDocument={(id) => {
                  handleDeleteDocument(id);
                  setMenuDocumentId(null);
                }}
                onDropDocument={handleMoveDocument}
                dragOverFolderId={dragOverFolderId}
                setDragOverFolderId={setDragOverFolderId}
                workspaceSlug={workspaceSlug}
                canEdit={canEdit}
              />
            )}
          </div>
          {selectedDocument && (
            <PreviewPane
              workspaceSlug={workspaceSlug}
              document={selectedDocument}
              onClose={() => setSelectedDocumentId(null)}
              onReparsed={() => {
                void fetchDocuments();
              }}
            />
          )}
        </div>
      </section>

      {newFolderParent !== undefined && (
        <PromptDialog
          title="Nueva carpeta"
          label="Nombre"
          initialValue=""
          onCancel={() => {
            setNewFolderParent(undefined);
            setNewFolderName("");
          }}
          onConfirm={async (value) => {
            await handleCreateFolder(newFolderParent ?? null, value);
            setNewFolderParent(undefined);
            setNewFolderName("");
          }}
          value={newFolderName}
          onChange={setNewFolderName}
        />
      )}

      {renaming && (
        <PromptDialog
          title={renaming.kind === "folder" ? "Renombrar carpeta" : "Renombrar archivo"}
          label="Nuevo nombre"
          initialValue={renaming.name}
          onCancel={() => setRenaming(null)}
          onConfirm={async (value) => {
            if (renaming.kind === "folder") {
              await handleRenameFolder(renaming.id, value);
            } else {
              await handleRenameDocument(renaming.id, value);
            }
            setRenaming(null);
          }}
          value={renaming.name}
          onChange={(v) => setRenaming(renaming ? { ...renaming, name: v } : null)}
        />
      )}
    </div>
  );
}

/* ---------- Folder tree (left nav) ---------- */

type FolderTreeListProps = {
  nodes: FolderTreeNode[];
  depth: number;
  currentFolderId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onMenuOpen: (id: string) => void;
  menuFolderId: string | null;
  onMenuClose: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onNewSubfolder: (parentId: string) => void;
  onDropDocument: (docId: string, folderId: string | null) => void;
  canEdit: boolean;
  dragOverFolderId: string | null | undefined;
  setDragOverFolderId: (id: string | null | undefined) => void;
};

function FolderTreeList(props: FolderTreeListProps) {
  const { nodes, depth } = props;
  if (nodes.length === 0) return null;
  return (
    <div>
      {nodes.map((node) => {
        const isOpen = props.expanded.has(node.id);
        const isActive = props.currentFolderId === node.id;
        const hasChildren = node.children.length > 0;
        const dragHighlight = props.dragOverFolderId === node.id;
        return (
          <div key={node.id}>
            <TreeRow
              label={node.name}
              icon={isOpen || hasChildren ? <FolderOpen size={14} /> : <FolderClosed size={14} />}
              depth={depth}
              active={isActive}
              count={node.fileCount}
              onClick={() => props.onSelect(node.id)}
              onToggle={hasChildren ? () => props.onToggle(node.id) : undefined}
              toggleOpen={isOpen}
              onMenuOpen={props.canEdit ? () => props.onMenuOpen(node.id) : undefined}
              menuOpen={props.menuFolderId === node.id}
              menuContent={
                props.menuFolderId === node.id && props.canEdit ? (
                  <ContextMenu
                    onClose={props.onMenuClose}
                    items={[
                      { id: "new", label: "Nueva subcarpeta", icon: <FolderPlus size={13} />, onClick: () => props.onNewSubfolder(node.id) },
                      { id: "rename", label: "Renombrar", icon: <Pencil size={13} />, onClick: () => props.onRename(node.id) },
                      { id: "delete", label: "Eliminar", icon: <Trash2 size={13} />, danger: true, onClick: () => props.onDelete(node.id) },
                    ]}
                  />
                ) : null
              }
              onDragOver={(e) => {
                if (!props.canEdit) return;
                if (e.dataTransfer.types.includes("application/x-prisma-doc")) {
                  e.preventDefault();
                  props.setDragOverFolderId(node.id);
                }
              }}
              onDragLeave={() => {
                if (props.dragOverFolderId === node.id) props.setDragOverFolderId(undefined);
              }}
              onDrop={(e) => {
                const docId = e.dataTransfer.getData("application/x-prisma-doc");
                if (docId) {
                  e.preventDefault();
                  props.onDropDocument(docId, node.id);
                }
                props.setDragOverFolderId(undefined);
              }}
              dragHighlight={dragHighlight}
            />
            {isOpen && hasChildren && (
              <FolderTreeList {...props} nodes={node.children} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type TreeRowProps = {
  label: string;
  icon: React.ReactNode;
  depth: number;
  active?: boolean;
  count?: number;
  onClick: () => void;
  onToggle?: () => void;
  toggleOpen?: boolean;
  onMenuOpen?: () => void;
  menuOpen?: boolean;
  menuContent?: React.ReactNode;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  dragHighlight?: boolean;
};

function TreeRow(props: TreeRowProps) {
  const background = props.dragHighlight
    ? "var(--workspace-accent-soft)"
    : props.active
      ? "var(--workspace-accent-soft)"
      : "transparent";
  const color = props.active ? "var(--workspace-accent-strong)" : "var(--workspace-text)";
  return (
    <div
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
        paddingLeft: 6 + props.depth * 14,
        paddingRight: 6,
        paddingTop: 6,
        paddingBottom: 6,
        borderRadius: 8,
        cursor: "pointer",
        background,
        color,
        fontSize: 13,
        outline: props.dragHighlight ? "1px dashed var(--workspace-accent)" : "none",
      }}
      onClick={props.onClick}
    >
      {props.onToggle ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onToggle?.();
          }}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            width: 16,
            height: 16,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--workspace-muted)",
            cursor: "pointer",
          }}
        >
          {props.toggleOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <span style={{ width: 16 }} />
      )}
      <span style={{ color: props.active ? "var(--workspace-accent-strong)" : "var(--workspace-muted)", display: "inline-flex" }}>
        {props.icon}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: props.active ? 600 : 500,
        }}
      >
        {props.label}
      </span>
      {typeof props.count === "number" && props.count > 0 && (
        <span style={{ fontSize: 11, color: "var(--workspace-muted)" }}>{props.count}</span>
      )}
      {props.onMenuOpen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onMenuOpen?.();
          }}
          aria-label="Opciones"
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--workspace-muted)",
            cursor: "pointer",
            borderRadius: 6,
          }}
        >
          <MoreVertical size={13} />
        </button>
      )}
      {props.menuContent}
    </div>
  );
}

/* ---------- Breadcrumbs ---------- */

function Breadcrumbs({
  breadcrumbs,
  onSelectRoot,
  onSelectFolder,
}: {
  breadcrumbs: FolderNode[];
  onSelectRoot: () => void;
  onSelectFolder: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden" }}>
      <button type="button" onClick={onSelectRoot} style={breadcrumbButtonStyle}>
        <Home size={13} /> Documentos
      </button>
      {breadcrumbs.map((folder, idx) => (
        <span key={folder.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <ChevronRight size={12} color="var(--workspace-muted)" />
          <button
            type="button"
            onClick={() => onSelectFolder(folder.id)}
            style={{
              ...breadcrumbButtonStyle,
              fontWeight: idx === breadcrumbs.length - 1 ? 600 : 500,
              color: idx === breadcrumbs.length - 1 ? "var(--workspace-text)" : "var(--workspace-muted)",
            }}
          >
            {folder.name}
          </button>
        </span>
      ))}
    </div>
  );
}

/* ---------- File area (grid / list) ---------- */

type FileAreaProps = {
  viewMode: ViewMode;
  documents: DocumentItem[];
  folderChildren: FolderTreeNode[];
  selectedDocumentId: string | null;
  menuDocumentId: string | null;
  onOpenDocument: (id: string) => void;
  onEnterFolder: (id: string) => void;
  onOpenDocumentMenu: (id: string) => void;
  onCloseDocumentMenu: () => void;
  onRenameDocument: (id: string) => void;
  onDeleteDocument: (id: string) => void;
  onDropDocument: (docId: string, folderId: string | null) => void;
  dragOverFolderId: string | null | undefined;
  setDragOverFolderId: (id: string | null | undefined) => void;
  workspaceSlug: string;
  canEdit: boolean;
};

function FileArea(props: FileAreaProps) {
  const isEmpty = props.documents.length === 0 && props.folderChildren.length === 0;
  if (isEmpty) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 48,
          color: "var(--workspace-muted)",
          fontSize: 14,
          textAlign: "center",
          border: "1px dashed var(--workspace-border)",
          borderRadius: 14,
          background: "var(--workspace-well)",
        }}
      >
        <FolderOpen size={36} strokeWidth={1.2} />
        <div style={{ fontWeight: 500, color: "var(--workspace-text)" }}>Esta carpeta está vacía</div>
        <div>{props.canEdit ? "Arrastra archivos aquí o usa el botón Subir archivos." : "Aún no hay documentos en esta ubicación."}</div>
      </div>
    );
  }

  if (props.viewMode === "list") {
    return (
      <FileList {...props} />
    );
  }
  return <FileGrid {...props} />;
}

function FileGrid(props: FileAreaProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 14,
      }}
    >
      {props.folderChildren.map((folder) => (
        <button
          key={folder.id}
          type="button"
          onDoubleClick={() => props.onEnterFolder(folder.id)}
          onClick={() => props.onEnterFolder(folder.id)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-prisma-doc")) {
              e.preventDefault();
              props.setDragOverFolderId(folder.id);
            }
          }}
          onDragLeave={() => props.dragOverFolderId === folder.id && props.setDragOverFolderId(undefined)}
          onDrop={(e) => {
            const docId = e.dataTransfer.getData("application/x-prisma-doc");
            if (docId) {
              e.preventDefault();
              props.onDropDocument(docId, folder.id);
            }
            props.setDragOverFolderId(undefined);
          }}
          style={{
            ...cardBaseStyle,
            outline: props.dragOverFolderId === folder.id ? "2px solid var(--workspace-accent)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 80, color: "var(--workspace-accent)" }}>
            <FolderClosed size={44} strokeWidth={1.4} />
          </div>
          <div style={{ padding: "10px 12px", borderTop: "1px solid var(--workspace-border)", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={cardTitleStyle} title={folder.name}>{folder.name}</div>
            <div style={cardMetaStyle}>{folder.fileCount} archivo{folder.fileCount === 1 ? "" : "s"}</div>
          </div>
        </button>
      ))}
      {props.documents.map((doc) => (
        <div
          key={doc.id}
          draggable={props.canEdit}
          onDragStart={(e) => {
            if (!props.canEdit) return;
            e.dataTransfer.setData("application/x-prisma-doc", doc.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => props.onOpenDocument(doc.id)}
          style={{
            ...cardBaseStyle,
            cursor: "pointer",
            outline: props.selectedDocumentId === doc.id ? "2px solid var(--workspace-accent)" : "none",
            position: "relative",
          }}
        >
          <DocumentThumbnail doc={doc} workspaceSlug={props.workspaceSlug} />
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid var(--workspace-border)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div style={cardTitleStyle} title={doc.fileName}>{doc.fileName}</div>
            <div style={cardMetaStyle}>
              {formatDocumentKindLabel(doc.fileKind)} {doc.sizeBytes != null ? `· ${formatSize(doc.sizeBytes)}` : ""}
            </div>
          </div>
          {props.canEdit && (
            <DocumentMenuTrigger
              open={props.menuDocumentId === doc.id}
              onOpen={(e) => {
                e.stopPropagation();
                props.onOpenDocumentMenu(doc.id);
              }}
              onClose={props.onCloseDocumentMenu}
              onRename={() => props.onRenameDocument(doc.id)}
              onDelete={() => props.onDeleteDocument(doc.id)}
              downloadUrl={`/api/workspaces/${props.workspaceSlug}/documents/${doc.id}/content?download=1`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function FileList(props: FileAreaProps) {
  return (
    <div style={{ border: "1px solid var(--workspace-border)", borderRadius: 12, overflow: "hidden", background: "var(--workspace-surface)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--workspace-well)", color: "var(--workspace-muted)" }}>
            <th style={listHeaderStyle}>Nombre</th>
            <th style={listHeaderStyle}>Tipo</th>
            <th style={listHeaderStyle}>Tamaño</th>
            <th style={listHeaderStyle}>Actualizado</th>
            <th style={{ ...listHeaderStyle, width: 48 }} />
          </tr>
        </thead>
        <tbody>
          {props.folderChildren.map((folder) => (
            <tr
              key={folder.id}
              onClick={() => props.onEnterFolder(folder.id)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("application/x-prisma-doc")) {
                  e.preventDefault();
                  props.setDragOverFolderId(folder.id);
                }
              }}
              onDragLeave={() => props.dragOverFolderId === folder.id && props.setDragOverFolderId(undefined)}
              onDrop={(e) => {
                const docId = e.dataTransfer.getData("application/x-prisma-doc");
                if (docId) {
                  e.preventDefault();
                  props.onDropDocument(docId, folder.id);
                }
                props.setDragOverFolderId(undefined);
              }}
              style={{ cursor: "pointer", background: props.dragOverFolderId === folder.id ? "var(--workspace-accent-soft)" : "transparent" }}
            >
              <td style={listCellStyle}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <FolderClosed size={16} color="var(--workspace-accent)" />
                  <span style={{ fontWeight: 500 }}>{folder.name}</span>
                </span>
              </td>
              <td style={listCellStyle}>Carpeta</td>
              <td style={listCellStyle}>{folder.fileCount} archivo{folder.fileCount === 1 ? "" : "s"}</td>
              <td style={listCellStyle}>{formatDate(folder.updatedAt)}</td>
              <td style={listCellStyle} />
            </tr>
          ))}
          {props.documents.map((doc) => (
            <tr
              key={doc.id}
              draggable={props.canEdit}
              onDragStart={(e) => {
                if (!props.canEdit) return;
                e.dataTransfer.setData("application/x-prisma-doc", doc.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => props.onOpenDocument(doc.id)}
              style={{
                cursor: "pointer",
                background: props.selectedDocumentId === doc.id ? "var(--workspace-accent-soft)" : "transparent",
              }}
            >
              <td style={listCellStyle}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <DocumentTypeIcon kind={doc.fileKind} />
                  <span title={doc.fileName}>{doc.fileName}</span>
                </span>
              </td>
              <td style={listCellStyle}>{formatDocumentKindLabel(doc.fileKind)}</td>
              <td style={listCellStyle}>{doc.sizeBytes != null ? formatSize(doc.sizeBytes) : "-"}</td>
              <td style={listCellStyle}>{formatDate(doc.updatedAt)}</td>
              <td style={{ ...listCellStyle, position: "relative", textAlign: "right" }}>
                {props.canEdit && (
                  <DocumentMenuTrigger
                    open={props.menuDocumentId === doc.id}
                    onOpen={(e) => {
                      e.stopPropagation();
                      props.onOpenDocumentMenu(doc.id);
                    }}
                    onClose={props.onCloseDocumentMenu}
                    onRename={() => props.onRenameDocument(doc.id)}
                    onDelete={() => props.onDeleteDocument(doc.id)}
                    downloadUrl={`/api/workspaces/${props.workspaceSlug}/documents/${doc.id}/content?download=1`}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentThumbnail({ doc, workspaceSlug }: { doc: DocumentItem; workspaceSlug: string }) {
  if (doc.fileKind === "image") {
    return (
      <div
        style={{
          height: 120,
          background: "var(--workspace-well)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/workspaces/${workspaceSlug}/documents/${doc.id}/content`}
          alt={doc.fileName}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "cover" }}
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div
      style={{
        height: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--workspace-well)",
        color: "var(--workspace-muted)",
      }}
    >
      <DocumentTypeIcon kind={doc.fileKind} size={38} />
    </div>
  );
}

function DocumentTypeIcon({ kind, size = 16 }: { kind: DocumentKind; size?: number }) {
  if (kind === "spreadsheet") return <FileSpreadsheet size={size} color="#059669" />;
  if (kind === "pdf") return <FileText size={size} color="#dc2626" />;
  if (kind === "image") return <FileImage size={size} color="#2563eb" />;
  if (kind === "text" || kind === "markdown") return <FileText size={size} color="#6b7280" />;
  return <File size={size} color="#6b7280" />;
}

function formatDocumentKindLabel(kind: DocumentKind) {
  if (kind === "spreadsheet") return "Hoja de cálculo";
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "Imagen";
  if (kind === "text") return "Texto";
  if (kind === "markdown") return "Markdown";
  return "Archivo";
}

/* ---------- Context menus & dialogs ---------- */

function DocumentMenuTrigger({
  open,
  onOpen,
  onClose,
  onRename,
  onDelete,
  downloadUrl,
}: {
  open: boolean;
  onOpen: (event: React.MouseEvent) => void;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  downloadUrl: string;
}) {
  return (
    <span style={{ position: "absolute", top: 6, right: 6 }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Opciones"
        style={{
          border: "none",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(4px)",
          borderRadius: 8,
          width: 26,
          height: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--workspace-muted)",
          cursor: "pointer",
          boxShadow: "0 1px 4px rgba(15,23,42,0.08)",
        }}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <ContextMenu
          onClose={onClose}
          items={[
            { id: "rename", label: "Renombrar", icon: <Pencil size={13} />, onClick: onRename },
            { id: "download", label: "Descargar", icon: <Download size={13} />, href: downloadUrl },
            { id: "delete", label: "Eliminar", icon: <Trash2 size={13} />, danger: true, onClick: onDelete },
          ]}
        />
      )}
    </span>
  );
}

type MenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
};

function ContextMenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-context-menu]")) {
        onClose();
      }
    };
    const timer = window.setTimeout(() => window.addEventListener("click", handler), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", handler);
    };
  }, [onClose]);

  return (
    <div
      data-context-menu
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        zIndex: 50,
        marginTop: 6,
        minWidth: 180,
        background: "var(--workspace-surface)",
        border: "1px solid var(--workspace-border)",
        borderRadius: 10,
        boxShadow: "var(--workspace-shadow-lg)",
        padding: 4,
      }}
    >
      {items.map((item) => {
        const content = (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 8,
              fontSize: 13,
              color: item.danger ? "var(--workspace-danger)" : "var(--workspace-text)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {item.icon}
            {item.label}
          </span>
        );
        if (item.href) {
          return (
            <a
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
              onClick={onClose}
            >
              {content}
            </a>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              item.onClick?.();
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function PromptDialog({
  title,
  label,
  initialValue,
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  title: string;
  label: string;
  initialValue: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: (value: string) => void | Promise<void>;
}) {
  useEffect(() => {
    onChange(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 24,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          background: "var(--workspace-surface)",
          borderRadius: 14,
          padding: 20,
          boxShadow: "var(--workspace-shadow-lg)",
          border: "1px solid var(--workspace-border)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--workspace-muted)" }}>{label}</span>
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                onConfirm(value.trim());
              } else if (e.key === "Escape") {
                onCancel();
              }
            }}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--workspace-border)",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              color: "var(--workspace-text)",
              background: "var(--workspace-surface)",
            }}
          />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => value.trim() && onConfirm(value.trim())}
            disabled={!value.trim()}
            style={{ ...primaryButtonStyle, opacity: value.trim() ? 1 : 0.6 }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function buildFolderTree(folders: FolderNode[]): FolderTreeNode[] {
  const map = new Map<string, FolderTreeNode>();
  folders.forEach((folder) => map.set(folder.id, { ...folder, children: [] }));
  const roots: FolderTreeNode[] = [];
  folders.forEach((folder) => {
    const node = map.get(folder.id)!;
    if (folder.parentId && map.has(folder.parentId)) {
      map.get(folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/* ---------- styles ---------- */

const iconButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  borderRadius: 8,
  width: 26,
  height: 26,
  color: "var(--workspace-muted)",
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 10,
  background: "var(--workspace-accent)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  border: "none",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 10,
  background: "var(--workspace-surface)",
  border: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const viewModeButton: React.CSSProperties = {
  border: "none",
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const breadcrumbButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--workspace-muted)",
  fontSize: 13,
  cursor: "pointer",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 180,
};

const cardBaseStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--workspace-border)",
  borderRadius: 12,
  background: "var(--workspace-surface)",
  textAlign: "left",
  padding: 0,
  overflow: "hidden",
  cursor: "pointer",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--workspace-text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cardMetaStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--workspace-muted)",
};

const listHeaderStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  borderBottom: "1px solid var(--workspace-border)",
};

const listCellStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  verticalAlign: "middle",
};

// Re-export ROOT_KEY for possible use elsewhere
export { ROOT_KEY };
