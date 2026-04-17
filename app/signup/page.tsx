import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import styles from "@/app/login/login.module.css";

export default function SignupPage() {
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
            Prisma sign up
          </p>
          <h1 className={styles.prismTitle}>Create your workspace account</h1>
          <p style={{ margin: 0, color: "#667085", lineHeight: 1.65 }}>
            Register with your work email. You will sign in and then select the workspace(s) tied to your account.
          </p>
        </div>

        <SignupForm />

        <p style={{ margin: 0, color: "#667085", fontSize: 14 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#233876", fontWeight: 600 }}>
            Sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
