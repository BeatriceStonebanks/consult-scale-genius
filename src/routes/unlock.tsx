import { createFileRoute, redirect } from "@tanstack/react-router";
import { checkUnlocked } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  validateSearch: (search) => ({
    error: search.error === "1",
  }),
  beforeLoad: async () => {
    const { unlocked } = await checkUnlocked();
    if (unlocked) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Enter password — Equator" },
      { name: "description", content: "Private access." },
      { property: "og:title", content: "Enter password — Equator" },
      { property: "og:description", content: "Private access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Unlock,
});

function Unlock() {
  const { error } = Route.useSearch();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold text-foreground">Equator</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This calculator is private. Enter the access password to continue.
          </p>
        </div>
        <form method="post" action="/api/public/unlock" className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Access password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
          {error && (
            <p className="text-xs text-destructive">Incorrect password. Try again.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
