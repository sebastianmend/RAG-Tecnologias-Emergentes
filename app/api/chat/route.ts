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
