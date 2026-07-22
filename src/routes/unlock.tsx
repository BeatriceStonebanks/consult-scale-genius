import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Sign in — Equator" },
      { name: "description", content: "Enter the access password to use the Equator consulting rate calculator." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnlockPage,
});

function UnlockPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(false);
    try {
      const { ok } = await unlock({ data: { password } });
      if (ok) {
        await router.navigate({ to: "/" });
        router.invalidate();
      } else {
        setError(true);
        setPassword("");
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "hsl(var(--background))", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8 shadow-xl"
        style={{
          background: "hsl(var(--card))",
          borderColor: "hsl(var(--border))",
        }}
      >
        <div className="mb-6">
          <div
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "hsl(var(--primary))" }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--primary))" }} />
            Equator
          </div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif", color: "hsl(var(--foreground))" }}
          >
            Enter access password
          </h1>
          <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            This calculator is private. Enter the shared password to continue.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-4 py-3 text-sm outline-none transition focus:ring-2"
              style={{
                background: "hsl(var(--background))",
                borderColor: error ? "hsl(var(--destructive))" : "hsl(var(--border))",
                color: "hsl(var(--foreground))",
              }}
            />
            {error && (
              <p className="mt-2 text-xs font-medium" style={{ color: "hsl(var(--destructive))" }}>
                Incorrect password. Try again.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition disabled:opacity-50"
            style={{
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              fontFamily: "'Plus Jakarta Sans', Inter, sans-serif",
            }}
          >
            {loading ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
