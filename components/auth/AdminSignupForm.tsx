"use client";

import { useActionState } from "react";
import { adminSignupAction } from "@/app/admin/(auth)/signup/actions";

const initialState = {
  error: undefined as string | undefined,
  success: undefined as string | undefined,
};

export function AdminSignupForm() {
  const [state, formAction, pending] = useActionState(adminSignupAction, initialState);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 8, fontSize: 14, color: "#111827" }}>
        Admin email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="admin@company.com"
          style={{
            borderRadius: 14,
            border: "1px solid rgba(17,24,39,0.12)",
            padding: "12px 14px",
            font: "inherit",
            color: "#111827",
          }}
        />
      </label>

      <label style={{ display: "grid", gap: 8, fontSize: 14, color: "#111827" }}>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          style={{
            borderRadius: 14,
            border: "1px solid rgba(17,24,39,0.12)",
            padding: "12px 14px",
            font: "inherit",
            color: "#111827",
          }}
        />
      </label>

      <label style={{ display: "grid", gap: 8, fontSize: 14, color: "#111827" }}>
        Admin signup secret
        <input
          name="secret"
          type="password"
          required
          autoComplete="off"
          style={{
            borderRadius: 14,
            border: "1px solid rgba(17,24,39,0.12)",
            padding: "12px 14px",
            font: "inherit",
            color: "#111827",
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
        {pending ? "Creating admin..." : "Create admin account"}
      </button>

      {state.error ? <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>{state.error}</p> : null}
      {state.success ? <p style={{ margin: 0, color: "#05603a", fontSize: 14 }}>{state.success}</p> : null}
    </form>
  );
}
