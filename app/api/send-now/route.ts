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
