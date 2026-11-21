# PLAN_IDE.md — Implementación del Asistente RAG + Agente de Planes Docentes

> Repo: https://github.com/sebastianmend/RAG-Tecnologias-Emergentes

## 0. Reglas para el IDE (ahorrar tokens)

1. **No explores ni refactorices.** Crea los archivos exactamente con el contenido de este documento.
2. No agregues librerías, no ejecutes `npm audit fix`, no actualices versiones.
3. Ejecuta solo los comandos indicados. Tras cada bloque corre su **Verificación**; si falla, corrige solo ese error.
4. Un commit por bloque (mensajes sugeridos al final de cada uno).
5. Idioma de la interfaz y de los textos: **español**.
6. **No hay Python ni venv.** El proyecto es 100 % Node/TypeScript. El equivalente de buenas prácticas aquí: versión de Node fijada (`.nvmrc` + `engines`), dependencias con versión exacta, `package-lock.json` en el repo, instalación reproducible con `npm ci`, secretos solo en `.env.local` (nunca en git).
7. Prerrequisitos que hace el humano (no los hagas tú): crear `.env.local` con las claves. Si falta una variable, avisa y continúa con lo que no dependa de ella.

Variables de entorno (nombres exactos, ver `.env.example` en el bloque 1):
`GEMINI_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `BAJA_SECRET`, `NEXT_PUBLIC_APP_URL`.

---

## BLOQUE 1 — Proyecto base

```bash
git clone https://github.com/sebastianmend/RAG-Tecnologias-Emergentes.git
cd RAG-Tecnologias-Emergentes
node -v   # debe ser >= 20
```

Si el repo tiene archivos (README), crea el proyecto en una carpeta temporal y muévelo:

```bash
npx create-next-app@15 ../_tmp_app --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
shopt -s dotglob && cp -rn ../_tmp_app/* . && rm -rf ../_tmp_app && shopt -u dotglob
```

Si el repo está vacío, equivale a: `npx create-next-app@15 . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --no-turbopack --yes`

Dependencias (versiones exactas):

```bash
npm install --save-exact @google/genai@latest nodemailer@6.9.16 @upstash/redis@latest zod@3.23.8 pdfjs-dist@4.10.38
npm install --save-exact -D @types/nodemailer@6.4.17 tsx@latest
npm pkg set engines.node=">=20" scripts.postinstall="node scripts/copy-pdf-worker.mjs" scripts.test:cal="tsx scripts/test-calendar.ts"
echo "20" > .nvmrc
mkdir -p scripts lib components app/demo app/api/extract app/api/confirm app/api/chat app/api/send-now app/api/cron/weekly app/api/baja public
```

#### `scripts/copy-pdf-worker.mjs`
```js
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
const src = "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs";
if (existsSync(src)) {
  mkdirSync("public", { recursive: true });
  copyFileSync(src, "public/pdf.worker.min.mjs");
  console.log("pdf.worker.min.mjs copiado a /public");
}
```

#### `next.config.ts` (reemplaza el contenido)
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.alias.canvas = false; // pdfjs-dist no necesita canvas en el navegador
    return config;
  },
};

export default nextConfig;
```

#### `vercel.json`
```json
{
  "crons": [{ "path": "/api/cron/weekly", "schedule": "0 22 * * 5" }]
}
```

#### `.env.example`
```
GEMINI_API_KEY=
GMAIL_USER=
GMAIL_APP_PASSWORD=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=
BAJA_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Añade al final de `.gitignore`:
```
!.env.example
.vercel
```

```bash
npm install && ls public/pdf.worker.min.mjs && npm run build
git add -A && git commit -m "chore: proyecto base Next.js 15 + dependencias" && git push
```
**Verificación:** existe `public/pdf.worker.min.mjs` y el build termina sin error.

---

## BLOQUE 2 — Esquemas, calendario y utilidades (lógica pura)

#### `lib/schema.ts`
```ts
import { z } from "zod";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const hora = z.string().transform((h) => {
  const m = h.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : h;
});

export const SesionSchema = z.object({
  paralelo: z.string(),
  docente: z.string().default(""),
  tipo: z.string().default("CLAS").transform((t) => t.toUpperCase()),
  dia: z.string().transform((d) => sinTildes(d).toUpperCase()),
  aula: z.string().default(""),
  horaInicio: hora,
  horaFin: hora,
});

export const PlanSchema = z.object({
  materia: z.string().min(1),
  codigo: z.string().default(""),
  periodo: z.string().default(""),
  paralelosDetectados: z.array(z.string()).default([]),
  sesiones: z.array(SesionSchema).default([]),
  evaluacion: z
    .array(
      z.object({
        bimestre: z.coerce.number(),
        actividad: z.string(),
        instrumento: z.string().default(""),
        ponderacionPct: z.coerce.number().default(0),
      })
    )
    .default([]),
  semanas: z
    .array(
      z.object({
        bimestre: z.coerce.number(),
        numero: z.coerce.number(),
        unidad: z.string().default(""),
        contenidos: z.array(z.string()).default([]),
        actividades: z
          .array(
            z.object({
              componente: z.string().default(""),
              titulo: z.string().default(""),
              descripcion: z.string().default(""),
              horas: z.coerce.number().optional(),
            })
          )
          .default([]),
      })
    )
    .default([]),
  fechasImportantes: z
    .array(
      z.object({
        bimestre: z.coerce.number(),
        actividad: z.string(),
        semana: z.coerce.number(),
        desde: z.string(),
        hasta: z.string(),
      })
    )
    .default([]),
  docentes: z.array(z.object({ nombre: z.string(), correo: z.string().optional() })).default([]),
});
export type PlanDocente = z.infer<typeof PlanSchema>;

export type Receso = { despuesDeSemana: number; diasExtra: number };

export const ConfirmSchema = z.object({
  email: z.string().email(),
  semana1: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receso: z.array(z.object({ despuesDeSemana: z.number(), diasExtra: z.number() })),
  suscrito: z.boolean(),
  materias: z
    .array(z.object({ plan: PlanSchema, paraleloElegido: z.string().min(1) }))
    .min(1)
    .max(10),
});
export type Perfil = z.infer<typeof ConfirmSchema> & { creadoEn: string };

/** Quita duplicados y ordena. */
export function limpiarPlan(p: PlanDocente): PlanDocente {
  const vistoF = new Set<string>();
  const fechas = p.fechasImportantes.filter((f) => {
    const k = `${f.actividad}|${f.semana}|${f.desde}`;
    if (vistoF.has(k)) return false;
    vistoF.add(k);
    return true;
  });
  const vistoS = new Set<string>();
  const sesiones = p.sesiones.filter((s) => {
    const k = `${s.paralelo}|${s.tipo}|${s.dia}|${s.horaInicio}`;
    if (vistoS.has(k)) return false;
    vistoS.add(k);
    return true;
  });
  const paralelos = Array.from(new Set([...p.paralelosDetectados, ...sesiones.map((s) => s.paralelo)])).filter(Boolean).sort();
  return {
    ...p,
    fechasImportantes: fechas,
    sesiones,
    paralelosDetectados: paralelos,
    semanas: [...p.semanas].sort((a, b) => a.numero - b.numero),
  };
}
```

#### `lib/calendar.ts`
```ts
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
```

#### `lib/utils.ts`
```ts
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export async function conReintento<T>(fn: () => Promise<T>, intentos = 3, esperaMs = 15000): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (i < intentos - 1) await new Promise((r) => setTimeout(r, esperaMs * (i + 1)));
    }
  }
  throw ultimo;
}
```

#### `scripts/test-calendar.ts`
```ts
import assert from "node:assert";
import { inicioSemana, finSemana, lunesObjetivo, semanaDeFecha, inferirSemana1, SEMANA1_DEFECTO, RECESO_DEFECTO } from "../lib/calendar";

const s1 = SEMANA1_DEFECTO, r = RECESO_DEFECTO;
assert.equal(inicioSemana(8, s1, r), "2026-11-23");
assert.equal(inicioSemana(9, s1, r), "2026-11-30");
assert.equal(inicioSemana(12, s1, r), "2026-12-21");
assert.equal(finSemana(12, s1, r), "2027-01-03");
assert.equal(inicioSemana(13, s1, r), "2027-01-04");
assert.equal(inicioSemana(15, s1, r), "2027-01-18");
assert.equal(inicioSemana(16, s1, r), "2027-01-25");
assert.equal(lunesObjetivo("2026-11-21"), "2026-11-23"); // sábado
assert.equal(lunesObjetivo("2026-11-20"), "2026-11-23"); // viernes
assert.equal(lunesObjetivo("2026-11-18"), "2026-11-16"); // miércoles
assert.equal(semanaDeFecha("2026-12-28", s1, r), 12);
assert.equal(semanaDeFecha("2026-11-23", s1, r), 8);
assert.equal(inferirSemana1([{ semana: 8, desde: "2026-11-23" }, { semana: 15, desde: "2027-01-18" }]), s1);
console.log("calendar OK");
```

```bash
npm run test:cal
git add -A && git commit -m "feat: esquemas zod y calendario con receso" && git push
```
**Verificación:** imprime `calendar OK`.

---

## BLOQUE 3 — Gemini, RAG, almacenamiento, token

#### `lib/gemini.ts`
```ts
import { GoogleGenAI } from "@google/genai";
import { conReintento } from "./utils";

let _ai: GoogleGenAI | null = null;
const ai = () => (_ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
export const MODEL = "gemini-3.5-flash";

export async function generarJSON(system: string, user: string, maxOutputTokens = 32768): Promise<unknown> {
  const res = await conReintento(
    () =>
      ai().models.generateContent({
        model: MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: 0,
          responseMimeType: "application/json",
          maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    3,
    8000
  );
  const t = (res.text ?? "").replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(t);
}

export type Turno = { role: "user" | "assistant"; content: string };

export async function generarTexto(system: string, historial: Turno[], pregunta: string): Promise<string> {
  const contents = [
    ...historial.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    { role: "user", parts: [{ text: pregunta }] },
  ];
  const res = await conReintento(
    () =>
      ai().models.generateContent({
        model: MODEL,
        contents,
        config: { systemInstruction: system, temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    3,
    8000
  );
  return (res.text ?? "").trim();
}

const normalizar = (v: number[]) => {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / n) * 1e4) / 1e4);
};

export async function embed(textos: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < textos.length; i += 40) {
    const lote = textos.slice(i, i + 40);
    const r = await conReintento(
      () =>
        ai().models.embedContent({
          model: "gemini-embedding-001",
          contents: lote,
          config: { taskType: task, outputDimensionality: 256 },
        }),
      4,
      15000
    );
    for (const e of r.embeddings ?? []) out.push(normalizar(e.values ?? []));
  }
  return out;
}
```

#### `lib/chunk.ts`
```ts
import type { Perfil } from "./schema";
import { inicioSemana, finSemana, fmt } from "./calendar";

export type ChunkTipo = "horario" | "evaluacion" | "fechas" | "semana" | "docente";
export type ChunkBase = { id: string; materia: string; tipo: ChunkTipo; semana?: number; texto: string };
export type Chunk = ChunkBase & { emb: number[] };

const cortar = (s: string, n = 1500) => (s.length > n ? s.slice(0, n) + "…" : s);

export function construirChunks(p: Perfil): ChunkBase[] {
  const out: ChunkBase[] = [];
  p.materias.forEach(({ plan, paraleloElegido }, mi) => {
    const mat = plan.materia;
    const id = (s: string) => `${mi}-${s}`;

    out.push({
      id: id("horario"), materia: mat, tipo: "horario",
      texto: cortar(
        `[${mat} · Horario del paralelo ${paraleloElegido}]\n` +
          (plan.sesiones.length
            ? plan.sesiones.map((s) => `${s.dia} ${s.horaInicio}-${s.horaFin} (${s.tipo}) en ${s.aula || "aula no indicada"}, docente ${s.docente}`).join("\n")
            : "No se detectó horario en el plan docente.")
      ),
    });

    out.push({
      id: id("evaluacion"), materia: mat, tipo: "evaluacion",
      texto: cortar(
        `[${mat} · Método de evaluación]\n` +
          plan.evaluacion.map((e) => `Bimestre ${e.bimestre}: ${e.actividad} (${e.instrumento}) ${e.ponderacionPct}%`).join("\n")
      ),
    });

    out.push({
      id: id("fechas"), materia: mat, tipo: "fechas",
      texto: cortar(
        `[${mat} · Fechas importantes]\n` +
          plan.fechasImportantes.map((f) => `Bimestre ${f.bimestre}: ${f.actividad}, semana ${f.semana}, del ${fmt(f.desde)} al ${fmt(f.hasta)}`).join("\n")
      ),
    });

    out.push({
      id: id("docente"), materia: mat, tipo: "docente",
      texto: `[${mat} · Docentes]\n` + plan.docentes.map((d) => `${d.nombre}${d.correo ? " · " + d.correo : ""}`).join("\n"),
    });

    for (const s of plan.semanas) {
      const ini = inicioSemana(s.numero, p.semana1, p.receso);
      const fin = finSemana(s.numero, p.semana1, p.receso);
      out.push({
        id: id(`semana-${s.numero}`), materia: mat, tipo: "semana", semana: s.numero,
        texto: cortar(
          `[${mat} · Semana ${s.numero} · ${fmt(ini)} al ${fmt(fin)}]\n${s.unidad}\nContenidos: ${s.contenidos.join("; ")}\nActividades: ` +
            s.actividades.map((a) => `${a.titulo}${a.descripcion ? " — " + a.descripcion : ""}${a.horas ? ` (${a.horas} h)` : ""}`).join(" | ")
        ),
      });
    }
  });
  return out;
}
```

#### `lib/rag.ts`
```ts
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
```

#### `lib/store.ts`
```ts
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
```

#### `lib/token.ts`
```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const firmar = (email: string) =>
  createHmac("sha256", process.env.BAJA_SECRET ?? "dev").update(email.trim().toLowerCase()).digest("hex");

export function verificar(email: string, token: string) {
  const a = Buffer.from(firmar(email));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

```bash
npx tsc --noEmit
git add -A && git commit -m "feat: gemini, chunks, rag, store, token" && git push
```
**Verificación:** `tsc` sin errores.

---

## BLOQUE 4 — API de extracción y confirmación

#### `app/api/extract/route.ts`
```ts
import { NextResponse } from "next/server";
import { generarJSON } from "@/lib/gemini";
import { PlanSchema, limpiarPlan } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `Eres un extractor de datos de planes docentes de la UTPL (Ecuador). Recibes el texto de un PDF y devuelves SOLO un JSON válido con esta forma exacta:
{
 "materia": string, "codigo": string, "periodo": string,
 "paralelosDetectados": string[],
 "sesiones": [{"paralelo": string, "docente": string, "tipo": "CLAS"|"PRAC"|"TUTO", "dia": "LUNES"|"MARTES"|"MIERCOLES"|"JUEVES"|"VIERNES"|"SABADO"|"DOMINGO", "aula": string, "horaInicio": "HH:MM", "horaFin": "HH:MM"}],
 "evaluacion": [{"bimestre": 1|2, "actividad": string, "instrumento": string, "ponderacionPct": number}],
 "semanas": [{"bimestre": 1|2, "numero": number, "unidad": string, "contenidos": string[], "actividades": [{"componente": "contacto"|"practico"|"autonomo", "titulo": string, "descripcion": string, "horas": number}]}],
 "fechasImportantes": [{"bimestre": 1|2, "actividad": string, "semana": number, "desde": "YYYY-MM-DD", "hasta": "YYYY-MM-DD"}],
 "docentes": [{"nombre": string, "correo": string}]
}
Reglas:
- Horario: tabla "Docente Paralelo Día Aula Horario". UNA sesión por fila, incluye TODOS los paralelos. Horas en formato 24 h. El texto puede traer un "0" pegado tras la hora ("08:00 AM-09:00 AM0 (CLAS)"): ignóralo. El aula puede venir con letras separadas: recompónla (ej. "AULA HD E COMPUTO"). Si es virtual usa "ZOOM".
- Semanas: una entrada por cada "Semana N" de Primer y Segundo Bimestre (1 a 16). "contenidos" = lista de temas. "descripcion" máximo 160 caracteres. "unidad" = título de la unidad (ej. "Unidad 5: Inteligencia Artificial").
- fechasImportantes: de las secciones "FECHAS IMPORTANTES"; convierte dd/mm/aaaa a ISO; SIN duplicados.
- evaluacion: de las tablas "EVALUACIÓN DEL Primer/Segundo Bimestre"; ponderacionPct es número sin "%".
- docentes: de "DATOS BÁSICOS DEL DOCENTE" (nombre y correo).
- No inventes. Si falta un dato usa "" o []. No escribas nada fuera del JSON.`;

export async function POST(req: Request) {
  try {
    const { texto } = await req.json();
    if (typeof texto !== "string" || texto.length < 500)
      return NextResponse.json({ error: "El PDF no tiene texto suficiente (¿está escaneado?)." }, { status: 400 });
    if (texto.length > 600_000) return NextResponse.json({ error: "El PDF es demasiado largo." }, { status: 400 });

    let ultimoError = "";
    for (let intento = 0; intento < 2; intento++) {
      try {
        const raw = await generarJSON(SYSTEM, intento ? `${texto}\n\n[CORRIGE ESTE ERROR DE VALIDACIÓN Y VUELVE A DEVOLVER EL JSON COMPLETO]: ${ultimoError}` : texto);
        const plan = limpiarPlan(PlanSchema.parse(raw));
        return NextResponse.json({ plan });
      } catch (e) {
        ultimoError = (e as Error).message.slice(0, 600);
      }
    }
    return NextResponse.json({ error: "No se pudo interpretar este plan docente. Verifica que sea el PDF original." }, { status: 422 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

#### `app/api/confirm/route.ts`
```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ConfirmSchema, type Perfil } from "@/lib/schema";
import { construirChunks } from "@/lib/chunk";
import { embed } from "@/lib/gemini";
import { guardarPerfil, guardarSesion } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = ConfirmSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: "Datos inválidos: revisa correo, paralelos y fechas." }, { status: 400 });

    const perfil: Perfil = {
      ...body.data,
      email: body.data.email.trim().toLowerCase(),
      materias: body.data.materias.map((m) => ({
        paraleloElegido: m.paraleloElegido,
        plan: { ...m.plan, sesiones: m.plan.sesiones.filter((s) => s.paralelo === m.paraleloElegido) },
      })),
      creadoEn: new Date().toISOString(),
    };

    const base = construirChunks(perfil);
    const embs = await embed(base.map((c) => c.texto), "RETRIEVAL_DOCUMENT");
    const chunks = base.map((c, i) => ({ ...c, emb: embs[i] }));

    const sesionId = randomUUID();
    await guardarSesion(sesionId, { perfil, chunks });
    if (perfil.suscrito) await guardarPerfil(perfil);

    return NextResponse.json({ sesionId, fragmentos: chunks.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

```bash
npx tsc --noEmit
git add -A && git commit -m "feat: api extract y confirm" && git push
```
**Verificación:** `tsc` sin errores. (La prueba real se hace en el bloque 8 con la UI.)

---

## BLOQUE 5 — Chat RAG

#### `app/api/chat/route.ts`
```ts
import { NextResponse } from "next/server";
import { embed, generarTexto, type Turno } from "@/lib/gemini";
import { obtenerSesion } from "@/lib/store";
import { recuperar } from "@/lib/rag";
import { fmt, hoyGuayaquil, nombreDia, semanaDeFecha } from "@/lib/calendar";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sesionId, pregunta, historial = [] } = (await req.json()) as { sesionId: string; pregunta: string; historial?: Turno[] };
    if (!sesionId || !pregunta?.trim()) return NextResponse.json({ error: "Falta la pregunta." }, { status: 400 });
    const sesion = await obtenerSesion(sesionId);
    if (!sesion) return NextResponse.json({ error: "La sesión expiró. Vuelve a subir tus planes." }, { status: 410 });

    const { perfil, chunks } = sesion;
    const hoy = hoyGuayaquil();
    const semanaActual = semanaDeFecha(hoy, perfil.semana1, perfil.receso);

    const [qEmb] = await embed([pregunta], "RETRIEVAL_QUERY");
    const usados = recuperar(qEmb, chunks, pregunta, semanaActual);

    const system = `Eres el asistente académico de un estudiante de la UTPL. Respondes SOLO con la información de los FRAGMENTOS. Si la respuesta no está, dilo claramente y sugiere revisar el plan docente o preguntar al docente. No inventes fechas, temas ni ponderaciones.
Hoy es ${fmt(hoy)} (${nombreDia(hoy)}). ${semanaActual ? `Estamos en la semana ${semanaActual} del período.` : "Hoy está fuera de las 16 semanas del período."}
Responde en español, breve y amable (máximo 6 líneas, usa lista corta solo si ayuda). Cuando des una fecha indica el día de la semana. Termina con la fuente entre paréntesis: (Materia · Semana N) o (Materia · Fechas importantes).

FRAGMENTOS:
${usados.map((c) => c.texto).join("\n\n---\n\n")}`;

    const respuesta = await generarTexto(system, historial.slice(-6), pregunta);
    return NextResponse.json({ respuesta, fuentes: usados.map((c) => c.id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

```bash
npx tsc --noEmit
git add -A && git commit -m "feat: chat RAG" && git push
```

---

## BLOQUE 6 — Agente y correo

#### `lib/email.ts`
```ts
import nodemailer from "nodemailer";
import type { Redaccion } from "./agent";

export type ClaseDia = { materia: string; tipo: string; hora: string; aula: string };
export type DiaAgenda = { fecha: string; etiqueta: string; clases: ClaseDia[] };
export type EvalItem = { materia: string; actividad: string; cuando: string; ponderacion?: number };
export type TemaItem = { materia: string; unidad: string; contenidos: string[] };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const COLORES = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#dc2626", "#0d9488"];
const TIPO: Record<string, string> = { CLAS: "Clase", PRAC: "Práctica", TUTO: "Tutoría" };

export type DatosCorreo = {
  semana: number; rango: string; materias: string[]; agenda: DiaAgenda[];
  evaluaciones: EvalItem[]; temas: TemaItem[]; texto: Redaccion; bajaUrl: string; appUrl: string;
};

export function renderCorreo(d: DatosCorreo): string {
  const color = (m: string) => COLORES[Math.max(0, d.materias.indexOf(m)) % COLORES.length];
  const chip = (m: string) => `<span style="display:inline-block;background:${color(m)};color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600">${esc(m)}</span>`;

  const dias = d.agenda
    .filter((a) => a.clases.length)
    .map(
      (a) => `<tr><td style="padding:12px 0;border-top:1px solid #e4e4e7"><div style="font-weight:700;text-transform:capitalize;margin-bottom:6px">${esc(a.etiqueta)}</div>${a.clases
        .map((c) => `<div style="margin:4px 0;font-size:14px">${chip(c.materia)} <b>${esc(c.hora)}</b> · ${TIPO[c.tipo] ?? esc(c.tipo)} · <span style="color:#71717a">${esc(c.aula)}</span></div>`)
        .join("")}</td></tr>`
    )
    .join("");

  const evals = d.evaluaciones.length
    ? `<div style="background:#fef3c7;border-radius:12px;padding:14px 16px;margin:16px 0"><div style="font-weight:700;margin-bottom:6px">📌 Evaluaciones y fechas clave</div>${d.evaluaciones
        .map((e) => `<div style="font-size:14px;margin:4px 0">${chip(e.materia)} <b>${esc(e.actividad)}</b> · ${esc(e.cuando)}${e.ponderacion ? ` · vale ${e.ponderacion}%` : ""}</div>`)
        .join("")}</div>`
    : "";

  const destacados = d.texto.destacados.length
    ? `<ul style="margin:8px 0 0 18px;padding:0;font-size:14px">${d.texto.destacados.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
    : "";

  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#18181b">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#4f46e5;color:#fff;padding:22px 24px"><div style="font-size:13px;opacity:.85">Tu resumen semanal</div><div style="font-size:22px;font-weight:700">Semana ${d.semana} · ${esc(d.rango)}</div></td></tr>
<tr><td style="padding:20px 24px"><p style="margin:0;font-size:15px;line-height:1.5">${esc(d.texto.introduccion)}</p>${destacados}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">${dias || '<tr><td style="padding:12px 0;color:#71717a">No hay clases registradas para esta semana.</td></tr>'}</table>
${evals}
<div style="background:#eef2ff;border-radius:12px;padding:14px 16px;margin:16px 0"><div style="font-weight:700;margin-bottom:6px">📚 Para estudiar esta semana</div><div style="font-size:14px;line-height:1.5">${esc(d.texto.sugerenciaEstudio)}</div></div>
</td></tr>
<tr><td style="padding:16px 24px;background:#fafafa;font-size:12px;color:#71717a;line-height:1.5">Resumen generado por IA a partir de tus planes docentes; verifica las fechas en el plan oficial.<br><a href="${d.appUrl}/demo" style="color:#4f46e5">Abrir el asistente</a> · <a href="${d.bajaUrl}" style="color:#71717a">Dejar de recibir este correo</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function renderTexto(d: DatosCorreo): string {
  const l = [`Semana ${d.semana} · ${d.rango}`, "", d.texto.introduccion, ""];
  for (const a of d.agenda) if (a.clases.length) {
    l.push(a.etiqueta.toUpperCase());
    a.clases.forEach((c) => l.push(`  - ${c.materia}: ${c.hora} (${TIPO[c.tipo] ?? c.tipo}) ${c.aula}`));
  }
  if (d.evaluaciones.length) { l.push("", "EVALUACIONES"); d.evaluaciones.forEach((e) => l.push(`  - ${e.materia}: ${e.actividad} · ${e.cuando}`)); }
  l.push("", "PARA ESTUDIAR", d.texto.sugerenciaEstudio, "", `Dejar de recibir: ${d.bajaUrl}`);
  return l.join("\n");
}

export async function enviarCorreo(to: string, subject: string, html: string, text: string) {
  const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  await t.sendMail({ from: `Planes Docentes IA <${process.env.GMAIL_USER}>`, to, subject, html, text });
}
```

#### `lib/agent.ts`
```ts
import { z } from "zod";
import type { Perfil } from "./schema";
import { addDays, DIAS, fmt, fmtCorta, hoyGuayaquil, lunesObjetivo, semanaDeFecha } from "./calendar";
import { generarJSON } from "./gemini";
import { enviarCorreo, renderCorreo, renderTexto, type ClaseDia, type DatosCorreo, type DiaAgenda, type EvalItem, type TemaItem } from "./email";
import { firmar } from "./token";
import { norm } from "./utils";

const RedSchema = z.object({
  asunto: z.string(),
  introduccion: z.string(),
  destacados: z.array(z.string()).default([]),
  sugerenciaEstudio: z.string(),
});
export type Redaccion = z.infer<typeof RedSchema>;
export type Paso = { etapa: "planificar" | "ejecutar" | "entregar"; detalle: string };
export type Resultado = { traza: Paso[]; enviado: boolean; asunto: string; html: string; error?: string };

// ---------- Herramientas (deterministas sobre el JSON) ----------
function obtenerClases(p: Perfil, dia: string): (ClaseDia & { ini: string })[] {
  return p.materias
    .flatMap(({ plan }) =>
      plan.sesiones.filter((s) => s.dia === dia).map((s) => ({ materia: plan.materia, tipo: s.tipo, hora: `${s.horaInicio}–${s.horaFin}`, aula: s.aula || "—", ini: s.horaInicio }))
    )
    .sort((a, b) => a.ini.localeCompare(b.ini));
}

function obtenerEvaluaciones(p: Perfil, desde: string, hasta: string): EvalItem[] {
  return p.materias.flatMap(({ plan }) =>
    plan.fechasImportantes
      .filter((f) => f.desde <= hasta && f.hasta >= desde)
      .map((f) => {
        const pond = plan.evaluacion.find((e) => norm(e.actividad).includes(norm(f.actividad)) || norm(f.actividad).includes(norm(e.actividad)));
        return { materia: plan.materia, actividad: f.actividad, cuando: `${fmtCorta(f.desde)} al ${fmtCorta(f.hasta)}`, ponderacion: pond?.ponderacionPct };
      })
  );
}

function obtenerTemas(p: Perfil, semana: number): TemaItem[] {
  return p.materias.flatMap(({ plan }) => {
    const s = plan.semanas.find((x) => x.numero === semana);
    return s ? [{ materia: plan.materia, unidad: s.unidad, contenidos: s.contenidos }] : [];
  });
}

const SYSTEM = `Eres un asistente académico. Recibes en JSON los datos de la próxima semana de un estudiante y devuelves SOLO un JSON {"asunto": string, "introduccion": string, "destacados": string[], "sugerenciaEstudio": string}.
- asunto: máximo 70 caracteres e incluye el número de semana.
- introduccion: 1 o 2 frases amables.
- destacados: máximo 4 alertas sobre evaluaciones o fechas clave, SOLO si existen en los datos; si no hay, lista vacía.
- sugerenciaEstudio: 2 o 3 líneas que recomienden qué repasar, basadas únicamente en "temas".
No inventes datos. Español.`;

export async function ejecutarAgente(perfil: Perfil, opts: { hoy?: string; enviar: boolean }): Promise<Resultado> {
  const traza: Paso[] = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // 1) PLANIFICAR
  const hoy = opts.hoy ?? hoyGuayaquil();
  const lunes = lunesObjetivo(hoy);
  const domingo = addDays(lunes, 6);
  const semana = semanaDeFecha(lunes, perfil.semana1, perfil.receso);
  traza.push({
    etapa: "planificar",
    detalle: `Hoy es ${fmt(hoy)}. Semana objetivo: ${semana ? "semana " + semana : "fuera del período"} (${fmt(lunes)} al ${fmt(domingo)}). Pasos: obtener_clases → obtener_evaluaciones → obtener_temas → redactar → enviar.`,
  });
  if (!semana) return { traza, enviado: false, asunto: "", html: "", error: "La fecha está fuera de las 16 semanas del período." };

  // 2) EJECUTAR
  const agenda: DiaAgenda[] = Array.from({ length: 7 }, (_, i) => {
    const fecha = addDays(lunes, i);
    return { fecha, etiqueta: fmt(fecha), clases: obtenerClases(perfil, DIAS[(i + 1) % 7]) };
  });
  const nClases = agenda.reduce((a, d) => a + d.clases.length, 0);
  traza.push({ etapa: "ejecutar", detalle: `obtener_clases: ${nClases} sesiones en ${perfil.materias.length} materias.` });
  const evaluaciones = obtenerEvaluaciones(perfil, lunes, domingo);
  traza.push({ etapa: "ejecutar", detalle: `obtener_evaluaciones: ${evaluaciones.length} evento(s)${evaluaciones.length ? " → " + evaluaciones.map((e) => `${e.materia}: ${e.actividad}`).join("; ") : ""}.` });
  const temas = obtenerTemas(perfil, semana);
  traza.push({ etapa: "ejecutar", detalle: `obtener_temas: temas de ${temas.length} materia(s) para la semana ${semana}.` });

  // 3) ENTREGAR
  const rango = `${fmtCorta(lunes)} al ${fmtCorta(domingo)}`;
  let texto: Redaccion;
  try {
    const raw = await generarJSON(SYSTEM, JSON.stringify({ semana, rango, clases: agenda.map((a) => ({ dia: a.etiqueta, clases: a.clases })), evaluaciones, temas: temas.map((t) => ({ ...t, contenidos: t.contenidos.slice(0, 6) })) }), 2048);
    texto = RedSchema.parse(raw);
  } catch {
    texto = {
      asunto: `Tu semana ${semana} (${rango})`,
      introduccion: "Aquí tienes lo que viene la próxima semana.",
      destacados: [],
      sugerenciaEstudio: temas.length ? `Repasa: ${temas.map((t) => `${t.materia} (${t.unidad})`).join("; ")}.` : "Aprovecha para adelantar lecturas.",
    };
  }
  traza.push({ etapa: "entregar", detalle: `Redactado: «${texto.asunto}».` });

  const bajaUrl = `${appUrl}/api/baja?e=${encodeURIComponent(perfil.email)}&t=${firmar(perfil.email)}`;
  const datos: DatosCorreo = { semana, rango, materias: perfil.materias.map((m) => m.plan.materia), agenda, evaluaciones, temas, texto, bajaUrl, appUrl };
  const html = renderCorreo(datos);

  if (opts.enviar) {
    await enviarCorreo(perfil.email, texto.asunto, html, renderTexto(datos));
    traza.push({ etapa: "entregar", detalle: `Correo enviado a ${perfil.email}.` });
  }
  return { traza, enviado: opts.enviar, asunto: texto.asunto, html };
}
```

#### `app/api/send-now/route.ts`
```ts
import { NextResponse } from "next/server";
import { ejecutarAgente } from "@/lib/agent";
import { obtenerSesion, permitirEnvio } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sesionId, fechaSimulada } = (await req.json()) as { sesionId: string; fechaSimulada?: string };
    const sesion = await obtenerSesion(sesionId);
    if (!sesion) return NextResponse.json({ error: "La sesión expiró. Vuelve a subir tus planes." }, { status: 410 });
    if (fechaSimulada && !/^\d{4}-\d{2}-\d{2}$/.test(fechaSimulada)) return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
    if (!(await permitirEnvio(sesion.perfil.email))) return NextResponse.json({ error: "Límite de 5 envíos por hora alcanzado." }, { status: 429 });

    const r = await ejecutarAgente(sesion.perfil, { hoy: fechaSimulada || undefined, enviar: true });
    if (r.error) return NextResponse.json({ error: r.error, traza: r.traza }, { status: 400 });
    return NextResponse.json({ traza: r.traza, asunto: r.asunto, html: r.html });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

#### `app/api/cron/weekly/route.ts`
```ts
import { NextResponse } from "next/server";
import { ejecutarAgente } from "@/lib/agent";
import { listarSuscritos, obtenerPerfil } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const correos = await listarSuscritos();
  let enviados = 0, fallidos = 0;
  for (const c of correos) {
    try {
      const perfil = await obtenerPerfil(c);
      if (!perfil) continue;
      const r = await ejecutarAgente(perfil, { enviar: true });
      if (r.enviado) enviados++;
    } catch {
      fallidos++;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return NextResponse.json({ total: correos.length, enviados, fallidos });
}
```

#### `app/api/baja/route.ts`
```ts
import { borrarPerfil } from "@/lib/store";
import { verificar } from "@/lib/token";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const e = u.searchParams.get("e") ?? "";
  const t = u.searchParams.get("t") ?? "";
  const ok = e && t && verificar(e, t);
  if (ok) await borrarPerfil(e);
  const msg = ok ? "Listo: ya no recibirás el resumen semanal y se eliminaron tus datos guardados." : "Enlace inválido.";
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:480px;margin:15vh auto;padding:0 16px"><h2>${msg}</h2></body>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
```

```bash
npx tsc --noEmit
git add -A && git commit -m "feat: agente, correo HTML, send-now, cron, baja" && git push
```
**Verificación:** `tsc` sin errores.

---

## BLOQUE 7 — Interfaz

#### `app/globals.css` (reemplaza TODO)
```css
@import "tailwindcss";

:root {
  --bg: #fafafa; --fg: #18181b; --muted: #71717a; --card: #ffffff;
  --border: #e4e4e7; --accent: #4f46e5; --accent-fg: #ffffff; --soft: #eef2ff;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #09090b; --fg: #fafafa; --muted: #a1a1aa; --card: #18181b; --border: #27272a; --accent: #818cf8; --accent-fg: #09090b; --soft: #1e1b4b; }
}
body { background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.55; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
.muted { color: var(--muted); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; padding: 8px 14px; font-weight: 600; font-size: 14px; border: 1px solid var(--border); cursor: pointer; transition: opacity .15s; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.btn-ghost { background: transparent; color: var(--fg); }
.input { width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; background: var(--card); color: var(--fg); font-size: 14px; }
.chip { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; background: var(--soft); color: var(--accent); }
.err { color: #dc2626; font-size: 14px; }
table.t { width: 100%; border-collapse: collapse; font-size: 14px; }
table.t th, table.t td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
```

#### `app/layout.tsx` (reemplaza TODO)
```tsx
import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Planes Docentes IA · RAG + Agente",
  description: "Sube tus planes docentes, pregunta lo que quieras y recibe tu resumen semanal por correo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header style={{ borderBottom: "1px solid var(--border)" }}>
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold">📚 Planes Docentes IA</Link>
            <div className="flex gap-2">
              <Link className="btn btn-ghost" href="/">Cómo funciona</Link>
              <Link className="btn btn-primary" href="/demo">Demo</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-sm muted">
          Proyecto «La IA, más allá del asistente» · Tecnologías Emergentes · UTPL. Sube solo planes docentes (no datos sensibles). Contenido generado por IA: verifica fechas en el plan oficial.
        </footer>
      </body>
    </html>
  );
}
```

#### `app/page.tsx` — Vista 1 «Cómo funciona» (reemplaza TODO)
```tsx
import Link from "next/link";

const integrantes = ["Jean Villavicencio", "Sebastián Mendieta", "Cristian Jiménez", "Samuel Reyes"];

const pasos = [
  ["1", "Documentos", "Tus planes docentes en PDF."],
  ["2", "Fragmentos + embeddings", "Se dividen por materia y semana y se convierten en vectores."],
  ["3", "Búsqueda", "Tu pregunta busca los fragmentos más parecidos."],
  ["4", "Respuesta", "El modelo responde solo con esos fragmentos y cita la fuente."],
];

const filas = [
  ["Preparación inicial", "20 a 40 min por materia leyendo y copiando", "1 a 2 min por materia, con revisión"],
  ["Consultas sueltas", "Buscar manualmente en el PDF", "Pregunta en lenguaje natural, con fuente"],
  ["Aviso semanal", "Depende de que te acuerdes", "Correo automático cada viernes"],
  ["Errores", "Humanos (copiar mal una fecha)", "Posibles alucinaciones; se mitigan con revisión y citas"],
  ["Costo", "Tu tiempo", "Cero (planes gratuitos)"],
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <span className="chip">RAG + Agente de IA</span>
        <h1 className="text-4xl font-bold tracking-tight">Tus planes docentes, convertidos en un asistente</h1>
        <p className="muted max-w-2xl text-lg">Sube los PDF de tus materias, pregunta cuándo es cada prueba y recibe cada viernes un resumen de tu semana siguiente, con una sugerencia de estudio.</p>
        <Link href="/demo" className="btn btn-primary">Probar la demo →</Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">¿Qué es RAG?</h2>
        <p className="max-w-3xl">RAG significa <b>Retrieval-Augmented Generation</b> (generación aumentada por recuperación). En lugar de que un modelo de IA responda de memoria, primero <b>busca en tus propios documentos</b> los fragmentos relevantes y responde usando solo esos fragmentos. Así las respuestas están ancladas a información real y verificable. Aquí se combina con un <b>agente</b>: un flujo que planifica y ejecuta tareas por sí mismo (armar y enviar tu resumen semanal).</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {pasos.map(([n, t, d]) => (
            <div key={n} className="card"><div className="chip mb-2">Paso {n}</div><div className="font-semibold">{t}</div><div className="muted text-sm">{d}</div></div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">¿Qué hace el aplicativo?</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card"><b>📄 Lee tus planes</b><p className="muted text-sm">Detecta materia, paralelos, horarios, evaluaciones, temas por semana y fechas importantes. Tú revisas y confirmas.</p></div>
          <div className="card"><b>💬 Responde tus dudas</b><p className="muted text-sm">«¿Cuándo es la prueba?», «¿Qué veo en la semana 8?». Responde con la fuente.</p></div>
          <div className="card"><b>📬 Te avisa cada viernes</b><p className="muted text-sm">Un agente arma tu agenda de la semana siguiente y la envía por correo, con una sugerencia de estudio.</p></div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Con IA vs. sin IA</h2>
        <p className="muted max-w-3xl">La alternativa sin IA es una hoja de cálculo o un calendario manual: abrir cada PDF, copiar fechas y horarios y revisarlos a mano cada semana.</p>
        <div className="card overflow-x-auto">
          <table className="t">
            <thead><tr><th>Aspecto</th><th>Sin IA (Excel o calendario manual)</th><th>Con RAG + agente</th></tr></thead>
            <tbody>{filas.map((f) => (<tr key={f[0]}><td><b>{f[0]}</b></td><td>{f[1]}</td><td>{f[2]}</td></tr>))}</tbody>
          </table>
        </div>
        <p className="muted text-xs">Los tiempos sin IA son estimaciones del equipo.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Integrantes</h2>
        <div className="flex flex-wrap gap-2">{integrantes.map((n) => (<span key={n} className="chip" style={{ fontSize: 14, padding: "6px 14px" }}>{n}</span>))}</div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Cómo probar la demo</h2>
        <ol className="list-decimal space-y-1 pl-6">
          <li>Entra a <b>Demo</b> y sube uno o varios PDF de planes docentes.</li>
          <li>Revisa lo detectado: elige tu <b>paralelo</b>, corrige horarios y escribe tu correo.</li>
          <li>Haz preguntas en el chat.</li>
          <li>Pulsa <b>«Enviarme el resumen ahora»</b> para ver el correo semanal sin esperar al viernes.</li>
        </ol>
        <Link href="/demo" className="btn btn-primary">Ir a la demo →</Link>
      </section>
    </div>
  );
}
```

#### `components/UploadStep.tsx`
```tsx
"use client";
import { useState } from "react";
import type { PlanDocente } from "@/lib/schema";

async function pdfATexto(file: File): Promise<string> {
  // @ts-ignore tipos de la build legacy
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let texto = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    let y: number | null = null;
    for (const it of content.items as { str?: string; transform: number[] }[]) {
      if (typeof it.str !== "string") continue;
      const yy = it.transform[5];
      if (y !== null) texto += Math.abs(yy - y) > 2 ? "\n" : " ";
      texto += it.str;
      y = yy;
    }
    texto += "\n\n";
  }
  return texto;
}

type Estado = { nombre: string; estado: "leyendo" | "extrayendo" | "listo" | "error"; msg?: string };

export default function UploadStep({ onListo }: { onListo: (planes: PlanDocente[]) => void }) {
  const [items, setItems] = useState<Estado[]>([]);
  const [ocupado, setOcupado] = useState(false);

  async function procesar(files: FileList | null) {
    if (!files || !files.length) return;
    const lista = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf")).slice(0, 10);
    if (!lista.length) return;
    setOcupado(true);
    setItems(lista.map((f) => ({ nombre: f.name, estado: "leyendo" })));
    const set = (i: number, e: Partial<Estado>) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...e } : x)));

    const res = await Promise.all(
      lista.map(async (f, i): Promise<PlanDocente | null> => {
        try {
          if (f.size > 15 * 1024 * 1024) throw new Error("Pesa más de 15 MB.");
          const texto = await pdfATexto(f);
          if (texto.trim().length < 500) throw new Error("Parece un PDF escaneado. Sube el PDF original del plan docente.");
          set(i, { estado: "extrayendo" });
          const r = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Error al extraer.");
          set(i, { estado: "listo" });
          return j.plan as PlanDocente;
        } catch (e) {
          set(i, { estado: "error", msg: (e as Error).message });
          return null;
        }
      })
    );
    setOcupado(false);
    const ok = res.filter((x): x is PlanDocente => !!x);
    if (ok.length) onListo(ok);
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-xl font-semibold">1. Sube tus planes docentes</h2>
        <p className="muted text-sm">PDF originales de la UTPL (uno por materia, hasta 10). No se guardan los archivos; solo se usa su texto para extraer los datos.</p>
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center" style={{ borderColor: "var(--border)" }}>
        <span className="text-3xl">📄</span>
        <span className="font-semibold">{ocupado ? "Procesando…" : "Haz clic para elegir tus PDF"}</span>
        <span className="muted text-sm">Cada plan puede tardar entre 20 y 60 segundos</span>
        <input type="file" accept="application/pdf" multiple hidden disabled={ocupado} onChange={(e) => procesar(e.target.files)} />
      </label>
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span>{it.nombre}</span>
          <span className={it.estado === "error" ? "err" : "muted"}>
            {it.estado === "leyendo" && "Leyendo PDF…"}
            {it.estado === "extrayendo" && "Extrayendo con IA…"}
            {it.estado === "listo" && "✅ Listo"}
            {it.estado === "error" && `❌ ${it.msg}`}
          </span>
        </div>
      ))}
    </div>
  );
}
```

#### `components/ReviewTable.tsx`
```tsx
"use client";
import type { PlanDocente } from "@/lib/schema";

export type Editable = { id: string; plan: PlanDocente; paralelo: string };
const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];

type Props = {
  planes: Editable[]; setPlanes: (p: Editable[]) => void;
  email: string; setEmail: (v: string) => void;
  semana1: string; setSemana1: (v: string) => void;
  suscrito: boolean; setSuscrito: (v: boolean) => void;
  onConfirm: () => void; cargando: boolean; error: string;
};

export default function ReviewTable({ planes, setPlanes, email, setEmail, semana1, setSemana1, suscrito, setSuscrito, onConfirm, cargando, error }: Props) {
  const upd = (id: string, fn: (e: Editable) => Editable) => setPlanes(planes.map((p) => (p.id === id ? fn(p) : p)));
  const setSes = (id: string, idx: number, patch: Record<string, string>) =>
    upd(id, (e) => ({ ...e, plan: { ...e.plan, sesiones: e.plan.sesiones.map((s, j) => (j === idx ? { ...s, ...patch } : s)) } }));
  const listo = planes.length > 0 && planes.every((p) => p.paralelo) && /\S+@\S+\.\S+/.test(email) && !!semana1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">2. Revisa lo detectado</h2>
        <p className="muted text-sm">Elige tu paralelo (el PDF lista los de todos los grupos) y corrige lo que haga falta.</p>
      </div>

      {planes.map((p) => {
        const ses = p.plan.sesiones.map((s, i) => ({ s, i })).filter(({ s }) => s.paralelo === p.paralelo);
        const alerta = (n: number) => (n === 0 ? { color: "#dc2626", fontWeight: 600 } : undefined);
        return (
          <div key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input className="input" style={{ maxWidth: 360, fontWeight: 600 }} value={p.plan.materia} onChange={(e) => upd(p.id, (x) => ({ ...x, plan: { ...x.plan, materia: e.target.value } }))} />
              <span className="chip">{p.plan.codigo || "sin código"}</span>
              <button className="btn btn-ghost" onClick={() => setPlanes(planes.filter((x) => x.id !== p.id))}>Quitar</button>
            </div>
            <label className="block text-sm">Paralelo
              <select className="input" style={{ maxWidth: 160 }} value={p.paralelo} onChange={(e) => upd(p.id, (x) => ({ ...x, paralelo: e.target.value }))}>
                <option value="">Elige…</option>
                {p.plan.paralelosDetectados.map((x) => (<option key={x} value={x}>{x}</option>))}
              </select>
            </label>
            {p.paralelo && (
              ses.length ? (
                <table className="t">
                  <thead><tr><th>Tipo</th><th>Día</th><th>Inicio</th><th>Fin</th><th>Aula</th></tr></thead>
                  <tbody>
                    {ses.map(({ s, i }) => (
                      <tr key={i}>
                        <td>{s.tipo}</td>
                        <td><select className="input" value={s.dia} onChange={(e) => setSes(p.id, i, { dia: e.target.value })}>{DIAS.map((d) => (<option key={d}>{d}</option>))}</select></td>
                        <td><input className="input" style={{ width: 90 }} value={s.horaInicio} onChange={(e) => setSes(p.id, i, { horaInicio: e.target.value })} /></td>
                        <td><input className="input" style={{ width: 90 }} value={s.horaFin} onChange={(e) => setSes(p.id, i, { horaFin: e.target.value })} /></td>
                        <td>{s.aula}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (<p className="err">No se detectó horario para este paralelo; se omitirá de la agenda.</p>)
            )}
            <p className="muted text-sm">
              Detectado: <span style={alerta(p.plan.semanas.length)}>{p.plan.semanas.length} semanas</span> ·{" "}
              <span style={alerta(p.plan.evaluacion.length)}>{p.plan.evaluacion.length} evaluaciones</span> ·{" "}
              <span style={alerta(p.plan.fechasImportantes.length)}>{p.plan.fechasImportantes.length} fechas importantes</span>
            </p>
          </div>
        );
      })}

      <div className="card grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Tu correo
          <input className="input" type="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm">Fecha de inicio de la semana 1
          <input className="input" type="date" value={semana1} onChange={(e) => setSemana1(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={suscrito} onChange={(e) => setSuscrito(e.target.checked)} />
          Quiero recibir el resumen semanal los viernes (se guarda solo tu correo y los datos extraídos; puedes darte de baja desde el correo).
        </label>
      </div>
      {error && <p className="err">{error}</p>}
      <button className="btn btn-primary" disabled={!listo || cargando} onClick={onConfirm}>{cargando ? "Preparando el asistente…" : "Confirmar y continuar →"}</button>
    </div>
  );
}
```

#### `components/ChatBox.tsx`
```tsx
"use client";
import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
const SUG = ["¿Qué tengo la próxima semana?", "¿Cuándo es el examen bimestral?", "¿Qué temas entran en la prueba parcial?", "¿Qué día tengo clases?"];

export default function ChatBox({ sesionId }: { sesionId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  async function enviar(q: string) {
    if (!q.trim() || cargando) return;
    const historial = msgs;
    setMsgs([...msgs, { role: "user", content: q }]);
    setTexto("");
    setCargando(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sesionId, pregunta: q, historial }) });
      const j = await r.json();
      setMsgs((m) => [...m, { role: "assistant", content: r.ok ? j.respuesta : `⚠️ ${j.error}` }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "⚠️ No pude conectarme. Intenta de nuevo." }]);
    } finally {
      setCargando(false);
      setTimeout(() => fin.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <h3 className="text-lg font-semibold">💬 Pregúntale a tus planes</h3>
      <div className="flex flex-wrap gap-2">
        {SUG.map((s) => (<button key={s} className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => enviar(s)}>{s}</button>))}
      </div>
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 380, minHeight: 120 }}>
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span className="inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm" style={{ background: m.role === "user" ? "var(--accent)" : "var(--soft)", color: m.role === "user" ? "var(--accent-fg)" : "var(--fg)" }}>{m.content}</span>
          </div>
        ))}
        {cargando && <div className="muted text-sm">Pensando…</div>}
        <div ref={fin} />
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="Escribe tu pregunta…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar(texto)} />
        <button className="btn btn-primary" disabled={cargando} onClick={() => enviar(texto)}>Enviar</button>
      </div>
    </div>
  );
}
```

#### `components/AgentPanel.tsx`
```tsx
"use client";
import { useState } from "react";

type Paso = { etapa: string; detalle: string };
const ICONO: Record<string, string> = { planificar: "🧭", ejecutar: "⚙️", entregar: "📬" };

export default function AgentPanel({ sesionId }: { sesionId: string }) {
  const [fecha, setFecha] = useState("");
  const [cargando, setCargando] = useState(false);
  const [traza, setTraza] = useState<Paso[]>([]);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function enviar() {
    setCargando(true); setError(""); setOk(""); setTraza([]); setHtml("");
    try {
      const r = await fetch("/api/send-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sesionId, fechaSimulada: fecha || undefined }) });
      const j = await r.json();
      if (j.traza) setTraza(j.traza);
      if (!r.ok) throw new Error(j.error || "Error");
      setHtml(j.html);
      setOk(`Correo enviado: «${j.asunto}». Revisa tu bandeja (y spam).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h3 className="text-lg font-semibold">🤖 Agente de resumen semanal</h3>
      <p className="muted text-sm">El agente planifica la semana, consulta tus materias y envía el correo. Para la demo puedes simular la fecha (por ejemplo, viernes 20/11/2026).</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">Fecha simulada (opcional)
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={cargando} onClick={enviar}>{cargando ? "Ejecutando agente…" : "Enviarme el resumen ahora"}</button>
      </div>
      {traza.length > 0 && (
        <ol className="space-y-1 text-sm">
          {traza.map((t, i) => (<li key={i}>{ICONO[t.etapa] ?? "•"} <b className="capitalize">{t.etapa}</b>: {t.detalle}</li>))}
        </ol>
      )}
      {ok && <p style={{ color: "#16a34a" }} className="text-sm">{ok}</p>}
      {error && <p className="err">{error}</p>}
      {html && <iframe title="Vista previa del correo" srcDoc={html} className="w-full rounded-xl border" style={{ height: 560, borderColor: "var(--border)", background: "#fff" }} />}
    </div>
  );
}
```

#### `app/demo/page.tsx`
```tsx
"use client";
import { useState } from "react";
import UploadStep from "@/components/UploadStep";
import ReviewTable, { type Editable } from "@/components/ReviewTable";
import ChatBox from "@/components/ChatBox";
import AgentPanel from "@/components/AgentPanel";
import type { PlanDocente } from "@/lib/schema";
import { RECESO_DEFECTO, SEMANA1_DEFECTO, inferirSemana1 } from "@/lib/calendar";

const PASOS = ["Subir", "Revisar", "Chat y resumen"];

export default function Demo() {
  const [paso, setPaso] = useState(1);
  const [planes, setPlanes] = useState<Editable[]>([]);
  const [email, setEmail] = useState("");
  const [semana1, setSemana1] = useState(SEMANA1_DEFECTO);
  const [suscrito, setSuscrito] = useState(true);
  const [sesionId, setSesionId] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  function onListo(nuevos: PlanDocente[]) {
    const ed: Editable[] = nuevos.map((plan) => ({
      id: crypto.randomUUID(),
      plan,
      paralelo: plan.paralelosDetectados.length === 1 ? plan.paralelosDetectados[0] : "",
    }));
    setPlanes(ed);
    setSemana1(inferirSemana1(nuevos.flatMap((p) => p.fechasImportantes)));
    setPaso(2);
  }

  async function confirmar() {
    setCargando(true); setError("");
    try {
      const r = await fetch("/api/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, semana1, receso: RECESO_DEFECTO, suscrito, materias: planes.map((p) => ({ plan: p.plan, paraleloElegido: p.paralelo })) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error al confirmar.");
      setSesionId(j.sesionId);
      setPaso(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2">
        {PASOS.map((n, i) => (
          <li key={n} className="chip" style={{ opacity: paso === i + 1 ? 1 : 0.5, fontSize: 14, padding: "6px 14px" }}>{i + 1}. {n}</li>
        ))}
      </ol>
      {paso === 1 && <UploadStep onListo={onListo} />}
      {paso === 2 && (
        <ReviewTable planes={planes} setPlanes={setPlanes} email={email} setEmail={setEmail} semana1={semana1} setSemana1={setSemana1} suscrito={suscrito} setSuscrito={setSuscrito} onConfirm={confirmar} cargando={cargando} error={error} />
      )}
      {paso === 3 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChatBox sesionId={sesionId} />
          <AgentPanel sesionId={sesionId} />
        </div>
      )}
    </div>
  );
}
```

```bash
npx tsc --noEmit && npm run build
git add -A && git commit -m "feat: interfaz (home, demo, chat, agente)" && git push
```
**Verificación:** el build termina sin error y `npm run dev` abre `/` y `/demo`.

---

## BLOQUE 8 — Pruebas locales (con `.env.local` completo)

```bash
npm run dev
```

Pruebas manuales en `http://localhost:3000/demo`, en este orden:

1. Subir `PLAN_12541-COMP_5023.pdf` y `PLAN_12523-ADMI_5077.pdf`. Esperado: ambas en «Listo».
2. En revisión: COMP muestra paralelos A, B, C; ADMI solo A (preseleccionado). Elegir A en COMP. Verificar horario lunes 07:00–10:00 (CLAS, PRAC, TUTO) y «Detectado: 16 semanas», evaluaciones y fechas distintas de 0. La fecha de semana 1 debe ser `2026-10-05`.
3. Poner tu correo y confirmar. Esperado: pasa al paso 3.
4. Chat: «¿Cuándo es el examen bimestral?». Esperado: 23 al 29 de noviembre de 2026, con fuente.
5. Chat: «¿Quién ganó el mundial?». Esperado: negativa amable (no está en los planes).
6. Agente: dejar la fecha vacía y pulsar el botón (hoy sábado 21/11/2026 → semana 8) y repetir con fecha simulada `2026-11-20`. Esperado: traza de 3 etapas, vista previa y correo recibido (revisar spam).
7. Probar el enlace «Dejar de recibir» del correo: debe mostrar el mensaje de baja.
8. Cron local: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly` → JSON con `enviados`. Sin el header → 401.

Si la extracción de un campo sale vacía o errónea, ajusta **solo** el `SYSTEM` de `app/api/extract/route.ts`.

---

## BLOQUE 9 — README y cierre

#### `README.md` (reemplaza el contenido)
```md
# RAG Tecnologías Emergentes — Asistente de Planes Docentes

Next.js 15 + Gemini (`gemini-3.5-flash`, `gemini-embedding-001`) + Upstash Redis + Nodemailer. Desplegado en Vercel.

- `/` Cómo funciona (qué es RAG, integrantes, comparación sin IA)
- `/demo` Subir PDF → revisar → chat RAG → agente de resumen semanal

## Desarrollo
1. `cp .env.example .env.local` y completa las variables.
2. `npm ci && npm run dev`
3. `npm run test:cal` valida el calendario.

Integrantes: Jean Villavicencio, Sebastián Mendieta, Cristian Jiménez, Samuel Reyes.
```

```bash
git add -A && git commit -m "docs: README" && git push
```

**Entregable final del IDE:** repo en GitHub con todos los commits, `npm run build` sin errores y `npm run test:cal` en verde. No hagas el despliegue en Vercel: lo hace el humano con su archivo de configuración externa.

---

## Problemas conocidos y qué hacer

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| `429` o cuota en extracción o embeddings | Límite del plan gratuito de Gemini | Ya hay reintentos con espera. Si persiste, subir menos PDF a la vez |
| `Cannot find module canvas` | pdfjs en el bundle | Revisar el alias en `next.config.ts` |
| Worker de pdfjs no carga | Falta `public/pdf.worker.min.mjs` | `node scripts/copy-pdf-worker.mjs` |
| Correo no llega | Contraseña de aplicación incorrecta o spam | Revisar `GMAIL_USER`/`GMAIL_APP_PASSWORD` (sin espacios) |
| `sesión expiró` (410) | TTL de 24 h | Volver a subir los planes |