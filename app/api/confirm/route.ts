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
