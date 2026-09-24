import { useState } from "react";
import { api } from "../api/client";
import type { CurrentUser } from "../types";

interface Props {
  onLoggedIn: (user: CurrentUser) => void;
}

export function LoginScreen({ onLoggedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(username, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100%", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 320,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 20,
        }}
      >
        <h1 style={{ fontSize: 16, margin: "0 0 4px" }}>Sample Management Scheduling</h1>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 16px" }}>SHA · sign in to continue</p>

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            marginBottom: 12,
          }}
        />

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            marginBottom: 12,
          }}
        />

        {error && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 12px" }}>{error}</p>}

        <button type="submit" className="btn primary" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
