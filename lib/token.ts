import { createHmac, timingSafeEqual } from "node:crypto";

export const firmar = (email: string) =>
  createHmac("sha256", process.env.BAJA_SECRET ?? "dev").update(email.trim().toLowerCase()).digest("hex");

export function verificar(email: string, token: string) {
  const a = Buffer.from(firmar(email));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
