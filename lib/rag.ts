import type { Chunk } from "./chunk";
import { norm } from "./utils";

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

export function recuperar(qEmb: number[], chunks: Chunk[], pregunta: string, semanaActual: number | null, k = 6): Chunk[] {
  const q = norm(pregunta);
  const elegidos = new Map<string, Chunk>();
  const add = (c: Chunk) => elegidos.set(c.id, c);

  // 1) Siempre los horarios (son pocos)
  chunks.filter((c) => c.tipo === "horario").forEach(add);

  // 2) Top-k por similitud
  [...chunks]
    .map((c) => ({ c, s: dot(qEmb, c.emb) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .forEach(({ c }) => add(c));

  // 3) Refuerzos por reglas
  const semanasPedidas = new Set<number>();
  for (const m of q.matchAll(/semana\s+(\d{1,2})/g)) semanasPedidas.add(Number(m[1]));
  if (semanaActual && /(hoy|manana|esta semana|actual)/.test(q)) semanasPedidas.add(semanaActual);
  if (semanaActual && /(proxima semana|siguiente semana)/.test(q)) semanasPedidas.add(semanaActual + 1);
  chunks.filter((c) => c.tipo === "semana" && c.semana && semanasPedidas.has(c.semana)).forEach(add);

  const materias = Array.from(new Set(chunks.map((c) => c.materia)));
  for (const m of materias) {
    const tokens = norm(m).split(/\s+/).filter((t) => t.length > 3);
    if (tokens.some((t) => q.includes(t)) || /(examen|prueba|evaluacion|nota|calific|fecha)/.test(q)) {
      chunks.filter((c) => c.materia === m && (c.tipo === "fechas" || c.tipo === "evaluacion")).forEach(add);
    }
  }
  return Array.from(elegidos.values()).slice(0, 18);
}
