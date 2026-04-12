"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/login/actions";

const initialState = { error: undefined as string | undefined };

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="next" value={nextPath} />

      <label style={{ display: "grid", gap: 8, fontSize: 14 }}>
        Email
        <input
          name="email"
          type="email"
          required
          defaultValue="demo-admin@prisma.local"
          style={{
            borderRadius: 14,
            border: "1px solid rgba(17,24,39,0.12)",
            padding: "12px 14px",
            font: "inherit",
          }}
        />
      </label>

      <label style={{ display: "grid", gap: 8, fontSize: 14 }}>
        Password
        <input
          name="password"
          type="password"
          required
          defaultValue="PrismaDemo!2026"
          style={{
            borderRadius: 14,
            border: "1px solid rgba(17,24,39,0.12)",
            padding: "12px 14px",
            font: "inherit",
          }}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        style={{
          borderRadius: 999,
          border: "none",
          padding: "12px 16px",
          background: "#111827",
          color: "#fff",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>

      {state.error ? <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>{state.error}</p> : null}
    </form>
  );
}
