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
