"use client";

import { useEffect, useState, useTransition } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/workspace/ui/Button";
import { Card } from "@/components/workspace/ui/Card";

type Props = {
  workspaceSlug: string;
  onChange?: () => void;
};

export function DemoDataBanner({ workspaceSlug, onChange }: Props) {
  const [hasDemo, setHasDemo] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/crm/demo-seed`, {
          cache: "no-store",
        });
        if (!response.ok) {
          setHasDemo(false);
          return;
        }
        const payload = (await response.json()) as { hasDemo?: boolean };
        if (!cancelled) setHasDemo(Boolean(payload.hasDemo));
      } catch {
        if (!cancelled) setHasDemo(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  function seed() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/crm/demo-seed`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "No se pudieron cargar los datos de muestra.");
        return;
      }
      setHasDemo(true);
      onChange?.();
    });
  }

  function clear() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/crm/demo-seed`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "No se pudo limpiar la muestra.");
        return;
      }
      setHasDemo(false);
      onChange?.();
    });
  }

  if (hasDemo === null) return null;

  if (!hasDemo) {
    return (
      <Card padding={14} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Sparkles size={16} aria-hidden />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--workspace-text)" }}>
            Prueba el CRM con datos de muestra
          </div>
          <div style={{ color: "var(--workspace-muted)", fontSize: 13 }}>
            Genera 12 personas, 5 empresas y 8 oportunidades interconectadas.
          </div>
          {error ? (
            <div style={{ color: "var(--workspace-danger)", fontSize: 12, marginTop: 4 }}>{error}</div>
          ) : null}
        </div>
        <Button variant="accent" compact disabled={isPending} onClick={seed}>
          {isPending ? "Cargando…" : "Cargar datos demo"}
        </Button>
      </Card>
    );
  }

  return (
    <Card
      padding={14}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--workspace-well)",
      }}
    >
      <Sparkles size={16} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "var(--workspace-text)" }}>
          Estás viendo datos de muestra
        </div>
        <div style={{ color: "var(--workspace-muted)", fontSize: 13 }}>
          Los registros marcados con `__demo` son solo para explorar el CRM.
        </div>
        {error ? (
          <div style={{ color: "var(--workspace-danger)", fontSize: 12, marginTop: 4 }}>{error}</div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        compact
        disabled={isPending}
        onClick={clear}
        leadingIcon={<Trash2 size={14} aria-hidden />}
      >
        {isPending ? "Limpiando…" : "Quitar muestra"}
      </Button>
    </Card>
  );
}
