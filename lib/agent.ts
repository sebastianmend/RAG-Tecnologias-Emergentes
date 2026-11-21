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
