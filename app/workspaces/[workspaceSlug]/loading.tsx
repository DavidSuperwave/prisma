// Route-level loading UI creates an implicit Suspense boundary so the
// workspace shell can stream the initial page without blocking on every
// upstream Supabase read. Keep this component lightweight — it ships in the
// initial bundle for this segment.

export default function WorkspaceLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
        background: "var(--color-surface, #0b0d10)",
        color: "var(--color-text-muted, rgba(255,255,255,0.7))",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        fontSize: 14,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            animation: "prisma-spin 0.8s linear infinite",
          }}
        />
        <span>Cargando workspace…</span>
      </div>
      <style>{`@keyframes prisma-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
