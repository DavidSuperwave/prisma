import { LoginForm } from "@/components/auth/LoginForm";
import styles from "@/app/login/login.module.css";
import Link from "next/link";

type PageProps = {
  searchParams: Promise<{ next?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedNextPath = params.next ?? "/workspaces";
  const message = params.message?.trim();
  const nextPath = requestedNextPath.startsWith("/admin") ? "/workspaces" : requestedNextPath;
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
          <h1 className={styles.prismTitle}>
            Access your workspace
          </h1>
          <p style={{ margin: 0, color: "#667085", lineHeight: 1.65 }}>
            Sign in with your workspace account to access your organization data, agents, and operations.
          </p>
        </div>

        <LoginForm nextPath={nextPath} />
        {message ? (
          <p
            style={{
              margin: 0,
              borderRadius: 14,
              padding: "10px 12px",
              border: "1px solid rgba(5, 96, 58, 0.24)",
              background: "rgba(5, 96, 58, 0.08)",
              color: "#05603a",
              fontSize: 14,
            }}
          >
            {message}
          </p>
        ) : null}

        <p style={{ margin: 0, color: "#667085", fontSize: 14 }}>
          Need an account?{" "}
          <Link href="/signup" style={{ color: "#233876", fontWeight: 600 }}>
            Create one
          </Link>
          . Platform admins should use{" "}
          <Link href="/admin/login" style={{ color: "#233876", fontWeight: 600 }}>
            admin login
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
