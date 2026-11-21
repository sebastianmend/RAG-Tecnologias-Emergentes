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
