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
