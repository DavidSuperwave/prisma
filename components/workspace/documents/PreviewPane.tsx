"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, Download, FileText, RefreshCw, X } from "lucide-react";

// SpreadsheetPreview pulls in the xlsx library (>300KB gz). Lazy-load it so
// PDF / markdown / image previews don't pay that cost.
const SpreadsheetPreview = dynamic(
  () => import("./SpreadsheetPreview").then((mod) => ({ default: mod.SpreadsheetPreview })),
  { ssr: false, loading: () => null },
);
import type { DocumentItem } from "./types";

type Props = {
  workspaceSlug: string;
  document: DocumentItem | null;
  onClose: () => void;
  onReparsed?: (recordId: string) => void;
};

function renderMarkdown(text: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lines = text.split("\n");
  const html: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inCode = false;
  let codeBuffer: string[] = [];

  const flushList = () => {
    if (inList) {
      html.push(`</${inList}>`);
      inList = null;
    }
  };

  const flushCode = () => {
    if (inCode) {
      html.push(`<pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:12px;line-height:1.5"><code>${escape(codeBuffer.join("\n"))}</code></pre>`);
      codeBuffer = [];
      inCode = false;
    }
  };

  for (const rawLine of lines) {
    if (rawLine.startsWith("```")) {
      if (inCode) {
        flushCode();
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(rawLine);
      continue;
    }

    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList();
      html.push("<div style='height:8px'></div>");
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      html.push(`<h${level} style="margin:14px 0 6px;font-weight:600;font-size:${Math.max(20 - level * 2, 13)}px">${escape(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (inList !== "ul") {
        flushList();
        html.push("<ul style='padding-left:18px;margin:4px 0'>");
        inList = "ul";
      }
      html.push(`<li style='margin:2px 0'>${renderInline(unordered[1], escape)}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (inList !== "ol") {
        flushList();
        html.push("<ol style='padding-left:20px;margin:4px 0'>");
        inList = "ol";
      }
      html.push(`<li style='margin:2px 0'>${renderInline(ordered[1], escape)}</li>`);
      continue;
    }

    flushList();
    html.push(`<p style='margin:6px 0;line-height:1.55'>${renderInline(trimmed, escape)}</p>`);
  }

  flushList();
  flushCode();
  return html.join("");
}

function renderInline(text: string, escape: (value: string) => string): string {
  let out = escape(text);
  out = out.replace(/`([^`]+)`/g, "<code style='background:rgba(15,23,42,0.08);padding:1px 4px;border-radius:4px;font-size:12px'>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const safeUrl = url.replace(/[^a-zA-Z0-9:/?._\-=&%#]/g, "");
    return `<a href='${safeUrl}' target='_blank' rel='noopener noreferrer' style='color:var(--workspace-accent);text-decoration:underline'>${label}</a>`;
  });
  return out;
}

export function PreviewPane({ workspaceSlug, document: doc, onClose, onReparsed }: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReparsing, setIsReparsing] = useState(false);

  const handleReparse = useCallback(async () => {
    if (!doc || isReparsing) return;
    setIsReparsing(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/documents/${doc.id}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "reparse" }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      onReparsed?.(doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reanalizar el archivo.");
    } finally {
      setIsReparsing(false);
    }
  }, [doc, isReparsing, onReparsed, workspaceSlug]);

  const contentUrl = doc
    ? `/api/workspaces/${workspaceSlug}/documents/${doc.id}/content`
    : "";

  useEffect(() => {
    if (!doc) return;
    if (doc.fileKind !== "text" && doc.fileKind !== "markdown") {
      setTextContent(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(contentUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setTextContent(text);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el archivo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, contentUrl]);

  if (!doc) return null;

  const renderBody = () => {
    if (doc.fileKind === "image") {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20, flex: 1, background: "var(--workspace-well)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={contentUrl}
            alt={doc.fileName}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "var(--workspace-shadow)" }}
          />
        </div>
      );
    }
    if (doc.fileKind === "pdf") {
      return (
        <PdfPreview
          doc={doc}
          contentUrl={contentUrl}
          onReparse={handleReparse}
          isReparsing={isReparsing}
          reparseError={error}
        />
      );
    }
    if (doc.fileKind === "spreadsheet") {
      return (
        <div style={{ flex: 1, overflow: "auto" }}>
          <SpreadsheetPreview
            preview={doc.preview}
            onReparse={handleReparse}
            isReparsing={isReparsing}
          />
        </div>
      );
    }
    if (doc.fileKind === "markdown") {
      if (loading) return <PreviewLoadingState label="Cargando markdown..." />;
      if (error) return <PreviewErrorState message={error} />;
      return (
        <div
          style={{ flex: 1, overflow: "auto", padding: 24, fontSize: 14, color: "var(--workspace-text)" }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent ?? "") }}
        />
      );
    }
    if (doc.fileKind === "text") {
      if (loading) return <PreviewLoadingState label="Cargando texto..." />;
      if (error) return <PreviewErrorState message={error} />;
      return (
        <pre
          style={{
            flex: 1,
            overflow: "auto",
            padding: 20,
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.55,
            background: "var(--workspace-well)",
            color: "var(--workspace-text)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {textContent ?? ""}
        </pre>
      );
    }
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          color: "var(--workspace-muted)",
          fontSize: 14,
          textAlign: "center",
        }}
      >
        <FileText size={40} strokeWidth={1.4} />
        <div>Sin vista previa disponible para este tipo de archivo.</div>
        <a
          href={`${contentUrl}?download=1`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 10,
            background: "var(--workspace-accent)",
            color: "#fff",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Download size={14} /> Descargar
        </a>
      </div>
    );
  };

  return (
    <aside
      aria-label="Vista previa"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "min(560px, 45vw)",
        borderLeft: "1px solid var(--workspace-border)",
        background: "var(--workspace-surface)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid var(--workspace-border)",
          background: "var(--workspace-panel)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--workspace-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={doc.fileName}
          >
            {doc.fileName}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--workspace-muted)", marginTop: 2 }}>
            {doc.mimeType} {doc.sizeBytes != null ? `· ${formatSize(doc.sizeBytes)}` : ""}
          </div>
        </div>
        <a
          href={`${contentUrl}?download=1`}
          title="Descargar"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            color: "var(--workspace-muted)",
            textDecoration: "none",
          }}
        >
          <Download size={16} />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar vista previa"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "transparent",
            border: "none",
            color: "var(--workspace-muted)",
            cursor: "pointer",
          }}
        >
          <X size={16} />
        </button>
      </header>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{renderBody()}</div>
    </aside>
  );
}

function PreviewLoadingState({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--workspace-muted)", fontSize: 13 }}>
      {label}
    </div>
  );
}

function PreviewErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        color: "var(--workspace-danger)",
        fontSize: 13,
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type PdfPreviewProps = {
  doc: DocumentItem;
  contentUrl: string;
  onReparse: () => void;
  isReparsing: boolean;
  reparseError: string | null;
};

function PdfPreview({ doc, contentUrl, onReparse, isReparsing, reparseError }: PdfPreviewProps) {
  const preview = doc.preview;
  const excerpt = typeof preview?.excerpt === "string" ? preview.excerpt : "";
  const pageCount = typeof preview?.pageCount === "number" ? preview.pageCount : null;
  const textLength = typeof preview?.textLength === "number" ? preview.textLength : null;
  const ocrUsed = preview?.ocrUsed === true;
  const truncated = preview?.truncated === true;
  const hasExtraction = excerpt.length > 0 || pageCount !== null;
  const [expanded, setExpanded] = useState<boolean>(true);

  const metaLine: string[] = [];
  if (pageCount !== null) metaLine.push(`${pageCount} ${pageCount === 1 ? "página" : "páginas"}`);
  if (textLength !== null) metaLine.push(`${textLength.toLocaleString("es-MX")} caracteres`);
  if (ocrUsed) metaLine.push("OCR con visión");
  if (truncated) metaLine.push("extracto");

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <iframe
        src={contentUrl}
        title={doc.fileName}
        style={{ border: "none", width: "100%", flex: 1, background: "var(--workspace-well)" }}
      />
      <div
        style={{
          borderTop: "1px solid var(--workspace-border)",
          background: "var(--workspace-panel)",
          display: "flex",
          flexDirection: "column",
          maxHeight: expanded ? 320 : 48,
          transition: "max-height 180ms ease",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => setExpanded((prev) => !prev)}
          role="button"
          aria-expanded={expanded}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setExpanded((prev) => !prev);
            }
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--workspace-text)" }}>
            Texto extraído
          </span>
          {metaLine.length > 0 ? (
            <span style={{ fontSize: 11.5, color: "var(--workspace-muted)" }}>
              · {metaLine.join(" · ")}
            </span>
          ) : null}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onReparse();
            }}
            disabled={isReparsing}
            title="Volver a extraer el texto del PDF"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 8,
              border: "1px solid var(--workspace-border)",
              background: "var(--workspace-surface)",
              color: "var(--workspace-text)",
              cursor: isReparsing ? "not-allowed" : "pointer",
              fontSize: 11.5,
              fontWeight: 500,
              opacity: isReparsing ? 0.7 : 1,
            }}
          >
            <RefreshCw size={12} style={isReparsing ? { animation: "spin 1s linear infinite" } : undefined} />
            {isReparsing ? "Analizando…" : hasExtraction ? "Reanalizar" : "Analizar"}
          </button>
        </div>
        {expanded ? (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "0 14px 14px",
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--workspace-text)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {reparseError ? (
              <div style={{ color: "var(--workspace-danger)", fontFamily: "inherit" }}>
                {reparseError}
              </div>
            ) : preview?.ocrError ? (
              <div style={{ color: "var(--workspace-muted)", fontStyle: "italic", marginBottom: 8 }}>
                OCR: {preview.ocrError}
              </div>
            ) : null}
            {excerpt ? (
              <>
                {excerpt}
                {truncated ? (
                  <div style={{ color: "var(--workspace-muted)", marginTop: 10, fontStyle: "italic" }}>
                    …texto truncado. Usa el agente para pedir el contenido completo.
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ color: "var(--workspace-muted)", fontStyle: "italic" }}>
                Aún no se ha extraído texto de este PDF. Pulsa {hasExtraction ? "Reanalizar" : "Analizar"} para ejecutar la extracción.
              </div>
            )}
          </div>
        ) : null}
      </div>
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
