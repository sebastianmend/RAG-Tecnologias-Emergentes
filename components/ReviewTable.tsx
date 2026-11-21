"use client";
import type { PlanDocente } from "@/lib/schema";

export type Editable = { id: string; plan: PlanDocente; paralelo: string };
const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];

type Props = {
  planes: Editable[]; setPlanes: (p: Editable[]) => void;
  email: string; setEmail: (v: string) => void;
  semana1: string; setSemana1: (v: string) => void;
  suscrito: boolean; setSuscrito: (v: boolean) => void;
  onConfirm: () => void; cargando: boolean; error: string;
};

export default function ReviewTable({ planes, setPlanes, email, setEmail, semana1, setSemana1, suscrito, setSuscrito, onConfirm, cargando, error }: Props) {
  const upd = (id: string, fn: (e: Editable) => Editable) => setPlanes(planes.map((p) => (p.id === id ? fn(p) : p)));
  const setSes = (id: string, idx: number, patch: Record<string, string>) =>
    upd(id, (e) => ({ ...e, plan: { ...e.plan, sesiones: e.plan.sesiones.map((s, j) => (j === idx ? { ...s, ...patch } : s)) } }));
  const listo = planes.length > 0 && planes.every((p) => p.paralelo) && /\S+@\S+\.\S+/.test(email) && !!semana1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">2. Revisa lo detectado</h2>
        <p className="muted text-sm">Elige tu paralelo (el PDF lista los de todos los grupos) y corrige lo que haga falta.</p>
      </div>

      {planes.map((p) => {
        const ses = p.plan.sesiones.map((s, i) => ({ s, i })).filter(({ s }) => s.paralelo === p.paralelo);
        const alerta = (n: number) => (n === 0 ? { color: "#dc2626", fontWeight: 600 } : undefined);
        return (
          <div key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input className="input" style={{ maxWidth: 360, fontWeight: 600 }} value={p.plan.materia} onChange={(e) => upd(p.id, (x) => ({ ...x, plan: { ...x.plan, materia: e.target.value } }))} />
              <span className="chip">{p.plan.codigo || "sin código"}</span>
              <button className="btn btn-ghost" onClick={() => setPlanes(planes.filter((x) => x.id !== p.id))}>Quitar</button>
            </div>
            <label className="block text-sm">Paralelo
              <select className="input" style={{ maxWidth: 160 }} value={p.paralelo} onChange={(e) => upd(p.id, (x) => ({ ...x, paralelo: e.target.value }))}>
                <option value="">Elige…</option>
                {p.plan.paralelosDetectados.map((x) => (<option key={x} value={x}>{x}</option>))}
              </select>
            </label>
            {p.paralelo && (
              ses.length ? (
                <table className="t">
                  <thead><tr><th>Tipo</th><th>Día</th><th>Inicio</th><th>Fin</th><th>Aula</th></tr></thead>
                  <tbody>
                    {ses.map(({ s, i }) => (
                      <tr key={i}>
                        <td>{s.tipo}</td>
                        <td><select className="input" value={s.dia} onChange={(e) => setSes(p.id, i, { dia: e.target.value })}>{DIAS.map((d) => (<option key={d}>{d}</option>))}</select></td>
                        <td><input className="input" style={{ width: 90 }} value={s.horaInicio} onChange={(e) => setSes(p.id, i, { horaInicio: e.target.value })} /></td>
                        <td><input className="input" style={{ width: 90 }} value={s.horaFin} onChange={(e) => setSes(p.id, i, { horaFin: e.target.value })} /></td>
                        <td>{s.aula}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (<p className="err">No se detectó horario para este paralelo; se omitirá de la agenda.</p>)
            )}
            <p className="muted text-sm">
              Detectado: <span style={alerta(p.plan.semanas.length)}>{p.plan.semanas.length} semanas</span> ·{" "}
              <span style={alerta(p.plan.evaluacion.length)}>{p.plan.evaluacion.length} evaluaciones</span> ·{" "}
              <span style={alerta(p.plan.fechasImportantes.length)}>{p.plan.fechasImportantes.length} fechas importantes</span>
            </p>
          </div>
        );
      })}

      <div className="card grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Tu correo
          <input className="input" type="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm">Fecha de inicio de la semana 1
          <input className="input" type="date" value={semana1} onChange={(e) => setSemana1(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={suscrito} onChange={(e) => setSuscrito(e.target.checked)} />
          Quiero recibir el resumen semanal los viernes (se guarda solo tu correo y los datos extraídos; puedes darte de baja desde el correo).
        </label>
      </div>
      {error && <p className="err">{error}</p>}
      <button className="btn btn-primary" disabled={!listo || cargando} onClick={onConfirm}>{cargando ? "Preparando el asistente…" : "Confirmar y continuar →"}</button>
    </div>
  );
}
