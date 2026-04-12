import { LoginForm } from "@/components/auth/LoginForm";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const nextPath = (await searchParams).next ?? "/workspaces";
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top right, rgba(51, 92, 255, 0.1), transparent 22%), linear-gradient(180deg, #f7f7f2 0%, #f5f3ee 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          border: "1px solid rgba(17, 24, 39, 0.08)",
          borderRadius: 28,
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 20px 48px rgba(17, 24, 39, 0.08)",
          padding: 28,
          display: "grid",
          gap: 20,
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#7c8596",
              fontWeight: 700,
            }}
          >
            Prisma sign in
          </p>
          <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.05, fontFamily: "var(--font-display)" }}>
            Access your workspace
          </h1>
          <p style={{ margin: 0, color: "#667085", lineHeight: 1.65 }}>
            Use one of the seeded demo accounts or your real workspace user to access the protected product surface.
          </p>
        </div>

        <LoginForm nextPath={nextPath} />

        <div
          style={{
            borderRadius: 18,
            background: "rgba(51,92,255,0.06)",
            border: "1px solid rgba(51,92,255,0.14)",
            padding: 16,
            display: "grid",
            gap: 6,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Seeded demo accounts</p>
          <p style={{ margin: 0, color: "#475467" }}>Admin: demo-admin@prisma.local</p>
          <p style={{ margin: 0, color: "#475467" }}>Operator: demo-operator@prisma.local</p>
          <p style={{ margin: 0, color: "#475467" }}>Password: PrismaDemo!2026</p>
        </div>
      </div>
    </main>
  );
}
