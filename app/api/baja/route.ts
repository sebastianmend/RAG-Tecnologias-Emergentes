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
