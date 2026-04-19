"use client";

/**
 * Rendered inside the chat transcript when a tool_result frame carries
 *   name: "images.search" or "images.generate"
 * Shows a candidate grid; clicking "Use this" POSTs to the select-image
 * route and replaces the card with a "Saved" confirmation.
 */

import { useState } from "react";
import { Button, Card } from "@/components/workspace/ui";

export type ImagePickerCandidate = {
  id: string;
  url?: string | null;
  thumb?: string | null;
  previewDataUrl?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  mimeType?: string | null;
};

type Props = {
  workspaceSlug: string;
  mode: "search" | "generate";
  prompt: string;
  candidates: ImagePickerCandidate[];
  recordId?: string | null;
  conversationId?: string | null;
  onSaved?: (result: { path: string; publicUrl: string | null; signedUrl: string | null }) => void;
};

export function ImagePickerCard({
  workspaceSlug,
  mode,
  prompt,
  candidates,
  recordId,
  conversationId,
  onSaved,
}: Props) {
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async (cand: ImagePickerCandidate) => {
    setBusyId(cand.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/chat/select-image`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            candidateId: cand.id,
            recordId: recordId ?? undefined,
            conversationId: conversationId ?? undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSavedId(cand.id);
      if (onSaved && json.data) onSaved(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {mode === "search" ? `Results for: "${prompt}"` : `Generated for: "${prompt}"`}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 8,
          }}
        >
          {candidates.map((cand) => {
            const previewSrc = cand.previewDataUrl ?? cand.thumb ?? cand.url ?? "";
            const saved = savedId === cand.id;
            return (
              <div
                key={cand.id}
                style={{
                  border: "1px solid var(--ws-border, #e5e7eb)",
                  borderRadius: 6,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  opacity: saved ? 0.7 : 1,
                }}
              >
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt={cand.title ?? "candidate"}
                    style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", background: "#f3f4f6" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      background: "#f3f4f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#9ca3af",
                      fontSize: 12,
                    }}
                  >
                    no preview
                  </div>
                )}
                <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {cand.source ? (
                    <span style={{ fontSize: 11, color: "var(--ws-muted, #6b7280)" }}>
                      {cand.source}
                    </span>
                  ) : null}
                  <Button
                    compact
                    variant={saved ? "ghost" : "primary"}
                    disabled={saved || busyId === cand.id}
                    onClick={() => handlePick(cand)}
                  >
                    {saved ? "Saved" : busyId === cand.id ? "Saving..." : "Use this"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
      </div>
    </Card>
  );
}
