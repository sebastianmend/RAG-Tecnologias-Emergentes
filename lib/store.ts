import { Redis } from "@upstash/redis";
import type { Perfil } from "./schema";
import type { Chunk } from "./chunk";

let _r: Redis | null = null;
const redis = () =>
  (_r ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN!,
  }));

export type Sesion = { perfil: Perfil; chunks: Chunk[] };
const mail = (e: string) => e.trim().toLowerCase();

export async function guardarSesion(id: string, s: Sesion) {
  await redis().set(`sesion:${id}`, s, { ex: 60 * 60 * 24 });
}
export const obtenerSesion = (id: string) => redis().get<Sesion>(`sesion:${id}`);

export async function guardarPerfil(p: Perfil) {
  await redis().set(`perfil:${mail(p.email)}`, p);
  await redis().sadd("suscritos", mail(p.email));
}
export const obtenerPerfil = (email: string) => redis().get<Perfil>(`perfil:${mail(email)}`);
export const listarSuscritos = () => redis().smembers("suscritos");
export async function borrarPerfil(email: string) {
  await redis().del(`perfil:${mail(email)}`);
  await redis().srem("suscritos", mail(email));
}
/** Máximo 5 envíos por correo y por hora. */
export async function permitirEnvio(email: string) {
  const k = `rl:${mail(email)}`;
  const n = await redis().incr(k);
  if (n === 1) await redis().expire(k, 3600);
  return n <= 5;
}
