"use client";

import { useState } from "react";
import { Button, Card } from "@/components/workspace/ui";
import {
  ImagePickerCard,
  type ImagePickerCandidate,
} from "@/components/workspace/chat/ImagePickerCard";

export type AttachImageButtonProps = {
  workspaceSlug: string;
  recordId: string;
  /** Search prompt seed, e.g. "Ford Bronco Sport 2025". */
  defaultPrompt?: string;
  /** Called after a candidate is saved and attached to the record. */
  onSaved?: (result: { path: string; publicUrl: string | null; signedUrl: string | null }) => void;
  /** Label override for the trigger button. */
  label?: string;
  compact?: boolean;
};

/**
 * Opens an in-panel image flow: user types a prompt, we call the
 * `images.search` (or `images.generate`) agent tool, then render
 * `ImagePickerCard` scoped to this record. Chosen image is persisted via
 * the existing /chat/select-image endpoint and attached to `record.data.image`.
 */
export function AttachImageButton({
  workspaceSlug,
  recordId,
  defaultPrompt,
  onSaved,
  label,
  compact,
}: AttachImageButtonProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(defaultPrompt ?? "");
  const [mode, setMode] = useState<"search" | "generate">("search");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<ImagePickerCandidate[]>([]);
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const runFetch = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setCandidates([]);
    try {
      const res = await fetch("/api/agent-tools/run", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: mode === "search" ? "images.search" : "images.generate",
          args: mode === "search" ? { query: prompt } : { prompt },
          workspaceSlug,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { candidates?: ImagePickerCandidate[] };
      };
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCandidates(json.data?.candidates ?? []);
      setLastPrompt(prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos buscar imágenes.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button compact={compact} variant="default" onClick={() => setOpen(true)}>
        {label ?? "Adjuntar imagen"}
      </Button>
    );
  }

  return (
    <Card>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as "search" | "generate")}
            className="ws-input"
            style={{ maxWidth: 140 }}
          >
            <option value="search">Buscar</option>
            <option value="generate">Generar (créditos)</option>
          </select>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ej: Ford Bronco Sport 2025"
            className="ws-input"
            style={{ flex: 1 }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runFetch();
              }
            }}
          />
          <Button variant="primary" onClick={() => void runFetch()} disabled={loading || !prompt.trim()}>
            {loading ? "…" : "Buscar"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </div>
        {mode === "generate" ? (
          <p style={{ fontSize: 12, color: "#92400e" }}>
            La generación consume créditos de imagen. Confirma con el cliente antes de generar.
          </p>
        ) : null}
        {error ? <p style={{ fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}
        {candidates.length > 0 ? (
          <ImagePickerCard
            workspaceSlug={workspaceSlug}
            mode={mode}
            prompt={lastPrompt}
            candidates={candidates}
            recordId={recordId}
            onSaved={(result) => {
              if (onSaved) onSaved(result);
              setOpen(false);
            }}
          />
        ) : !loading ? (
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            Escribe una descripción y presiona Buscar para ver candidatos.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
