import { createServerFn } from "@tanstack/react-start";
import { clearGate, getGateUnlocked, unlockGate } from "./gate.server";

export const checkUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  return { unlocked: await getGateUnlocked() };
});

export const unlockSite = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    return { ok: await unlockGate(data.password) };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  await clearGate();
  return { ok: true as const };
});
