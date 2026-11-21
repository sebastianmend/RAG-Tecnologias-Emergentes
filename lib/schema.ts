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
