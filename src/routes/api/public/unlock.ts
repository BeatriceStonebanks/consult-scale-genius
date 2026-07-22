import { createFileRoute } from "@tanstack/react-router";
import { unlockGate } from "@/lib/gate.server";

export const Route = createFileRoute("/api/public/unlock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const password = String(form.get("password") ?? "");
        const ok = await unlockGate(password);

        return new Response(null, {
          status: 303,
          headers: {
            Location: ok ? "/" : "/unlock?error=1",
          },
        });
      },
    },
  },
});