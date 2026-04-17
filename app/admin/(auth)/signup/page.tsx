import Link from "next/link";
import { AdminSignupForm } from "@/components/auth/AdminSignupForm";
import styles from "@/app/login/login.module.css";

export default function AdminSignupPage() {
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
          maxWidth: 460,
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
            Prisma admin
          </p>
          <h1 className={styles.prismTitle}>Create admin account</h1>
          <p style={{ margin: 0, color: "#667085", lineHeight: 1.65 }}>
            This route is protected by a server-side signup secret and creates accounts with platform-admin privileges.
          </p>
        </div>

        <AdminSignupForm />

        <p style={{ margin: 0, color: "#667085", fontSize: 14 }}>
          Already have an account?{" "}
          <Link href="/admin/login" style={{ color: "#233876", fontWeight: 600 }}>
            Sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
