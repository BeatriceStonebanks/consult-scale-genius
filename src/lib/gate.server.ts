import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type GateSession = { unlocked?: boolean };

const sessionConfig = {
  get password() {
    return process.env.SESSION_SECRET!;
  },
  name: "site-gate",
  maxAge: 60 * 60 * 24 * 7,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  },
};

function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function getGateUnlocked() {
  const session = await useSession<GateSession>(sessionConfig);
  return Boolean(session.data.unlocked);
}

export async function unlockGate(password: string) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) throw new Error("SITE_PASSWORD is not set");

  if (!passwordMatches(password, expected)) return false;

  const session = await useSession<GateSession>(sessionConfig);
  await session.update({ unlocked: true });
  return true;
}

export async function clearGate() {
  const session = await useSession<GateSession>(sessionConfig);
  await session.clear();
}