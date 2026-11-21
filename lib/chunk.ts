import type { Perfil } from "./schema";
import { inicioSemana, finSemana, fmt } from "./calendar";

export type ChunkTipo = "horario" | "evaluacion" | "fechas" | "semana" | "docente";
export type ChunkBase = { id: string; materia: string; tipo: ChunkTipo; semana?: number; texto: string };
export type Chunk = ChunkBase & { emb: number[] };

const cortar = (s: string, n = 1500) => (s.length > n ? s.slice(0, n) + "…" : s);

export function construirChunks(p: Perfil): ChunkBase[] {
  const out: ChunkBase[] = [];
  p.materias.forEach(({ plan, paraleloElegido }, mi) => {
    const mat = plan.materia;
    const id = (s: string) => `${mi}-${s}`;

    out.push({
      id: id("horario"), materia: mat, tipo: "horario",
      texto: cortar(
        `[${mat} · Horario del paralelo ${paraleloElegido}]\n` +
          (plan.sesiones.length
            ? plan.sesiones.map((s) => `${s.dia} ${s.horaInicio}-${s.horaFin} (${s.tipo}) en ${s.aula || "aula no indicada"}, docente ${s.docente}`).join("\n")
            : "No se detectó horario en el plan docente.")
      ),
    });

    out.push({
      id: id("evaluacion"), materia: mat, tipo: "evaluacion",
      texto: cortar(
        `[${mat} · Método de evaluación]\n` +
          plan.evaluacion.map((e) => `Bimestre ${e.bimestre}: ${e.actividad} (${e.instrumento}) ${e.ponderacionPct}%`).join("\n")
      ),
    });

    out.push({
      id: id("fechas"), materia: mat, tipo: "fechas",
      texto: cortar(
        `[${mat} · Fechas importantes]\n` +
          plan.fechasImportantes.map((f) => `Bimestre ${f.bimestre}: ${f.actividad}, semana ${f.semana}, del ${fmt(f.desde)} al ${fmt(f.hasta)}`).join("\n")
      ),
    });

    out.push({
      id: id("docente"), materia: mat, tipo: "docente",
      texto: `[${mat} · Docentes]\n` + plan.docentes.map((d) => `${d.nombre}${d.correo ? " · " + d.correo : ""}`).join("\n"),
    });

    for (const s of plan.semanas) {
      const ini = inicioSemana(s.numero, p.semana1, p.receso);
      const fin = finSemana(s.numero, p.semana1, p.receso);
      out.push({
        id: id(`semana-${s.numero}`), materia: mat, tipo: "semana", semana: s.numero,
        texto: cortar(
          `[${mat} · Semana ${s.numero} · ${fmt(ini)} al ${fmt(fin)}]\n${s.unidad}\nContenidos: ${s.contenidos.join("; ")}\nActividades: ` +
            s.actividades.map((a) => `${a.titulo}${a.descripcion ? " — " + a.descripcion : ""}${a.horas ? ` (${a.horas} h)` : ""}`).join(" | ")
        ),
      });
    }
  });
  return out;
}
