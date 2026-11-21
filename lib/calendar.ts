import type { Receso } from "./schema";

export const SEMANA1_DEFECTO = "2026-10-05";
export const RECESO_DEFECTO: Receso[] = [{ despuesDeSemana: 12, diasExtra: 7 }];
export const DIAS = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const NOMBRES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const ms = (iso: string) => Date.parse(iso + "T00:00:00Z");
export const addDays = (iso: string, n: number) => new Date(ms(iso) + n * 864e5).toISOString().slice(0, 10);
export const dow = (iso: string) => new Date(ms(iso)).getUTCDay();
export const nombreDia = (iso: string) => NOMBRES[dow(iso)];
export const fmt = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${nombreDia(iso)} ${d}/${m}`;
};
export const fmtCorta = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export function inicioSemana(n: number, semana1: string, receso: Receso[]) {
  const extra = receso.filter((r) => n > r.despuesDeSemana).reduce((a, r) => a + r.diasExtra, 0);
  return addDays(semana1, 7 * (n - 1) + extra);
}
export const finSemana = (n: number, s1: string, r: Receso[]) => addDays(inicioSemana(n + 1, s1, r), -1);

export function semanaDeFecha(iso: string, s1: string, r: Receso[]): number | null {
  for (let n = 1; n <= 16; n++) {
    if (iso >= inicioSemana(n, s1, r) && iso <= finSemana(n, s1, r)) return n;
  }
  return null;
}

/** Lunes de la semana objetivo: viernes a domingo apuntan al lunes siguiente; lunes a jueves, a la semana actual. */
export function lunesObjetivo(hoy: string) {
  const d = dow(hoy);
  if (d === 0) return addDays(hoy, 1);
  if (d >= 5) return addDays(hoy, 8 - d);
  return addDays(hoy, 1 - d);
}

export const hoyGuayaquil = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

/** Infiere la fecha de la semana 1 a partir de las fechas explícitas (usa la moda). */
export function inferirSemana1(fechas: { semana: number; desde: string }[]): string {
  const cuenta = new Map<string, number>();
  for (const f of fechas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.desde) || f.semana < 1) continue;
    const off = 7 * (f.semana - 1) + (f.semana > 12 ? 7 : 0);
    const c = addDays(f.desde, -off);
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  let mejor = SEMANA1_DEFECTO;
  let max = 0;
  cuenta.forEach((v, k) => {
    if (v > max) {
      max = v;
      mejor = k;
    }
  });
  return mejor;
}
