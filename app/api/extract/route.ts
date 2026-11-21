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
