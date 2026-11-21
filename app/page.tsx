import Link from "next/link";

const integrantes = ["Jean Villavicencio", "Sebastián Mendieta", "Cristian Jiménez", "Samuel Reyes"];

const pasos = [
  ["1", "Documentos", "Tus planes docentes en PDF."],
  ["2", "Fragmentos + embeddings", "Se dividen por materia y semana y se convierten en vectores."],
  ["3", "Búsqueda", "Tu pregunta busca los fragmentos más parecidos."],
  ["4", "Respuesta", "El modelo responde solo con esos fragmentos y cita la fuente."],
];

const filas = [
  ["Preparación inicial", "20 a 40 min por materia leyendo y copiando", "1 a 2 min por materia, con revisión"],
  ["Consultas sueltas", "Buscar manualmente en el PDF", "Pregunta en lenguaje natural, con fuente"],
  ["Aviso semanal", "Depende de que te acuerdes", "Correo automático cada viernes"],
  ["Errores", "Humanos (copiar mal una fecha)", "Posibles alucinaciones; se mitigan con revisión y citas"],
  ["Costo", "Tu tiempo", "Cero (planes gratuitos)"],
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <span className="chip">RAG + Agente de IA</span>
        <h1 className="text-4xl font-bold tracking-tight">Tus planes docentes, convertidos en un asistente</h1>
        <p className="muted max-w-2xl text-lg">Sube los PDF de tus materias, pregunta cuándo es cada prueba y recibe cada viernes un resumen de tu semana siguiente, con una sugerencia de estudio.</p>
        <Link href="/demo" className="btn btn-primary">Probar la demo →</Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">¿Qué es RAG?</h2>
        <p className="max-w-3xl">RAG significa <b>Retrieval-Augmented Generation</b> (generación aumentada por recuperación). En lugar de que un modelo de IA responda de memoria, primero <b>busca en tus propios documentos</b> los fragmentos relevantes y responde usando solo esos fragmentos. Así las respuestas están ancladas a información real y verificable. Aquí se combina con un <b>agente</b>: un flujo que planifica y ejecuta tareas por sí mismo (armar y enviar tu resumen semanal).</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {pasos.map(([n, t, d]) => (
            <div key={n} className="card"><div className="chip mb-2">Paso {n}</div><div className="font-semibold">{t}</div><div className="muted text-sm">{d}</div></div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">¿Qué hace el aplicativo?</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card"><b>📄 Lee tus planes</b><p className="muted text-sm">Detecta materia, paralelos, horarios, evaluaciones, temas por semana y fechas importantes. Tú revisas y confirmas.</p></div>
          <div className="card"><b>💬 Responde tus dudas</b><p className="muted text-sm">«¿Cuándo es la prueba?», «¿Qué veo en la semana 8?». Responde con la fuente.</p></div>
          <div className="card"><b>📬 Te avisa cada viernes</b><p className="muted text-sm">Un agente arma tu agenda de la semana siguiente y la envía por correo, con una sugerencia de estudio.</p></div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Con IA vs. sin IA</h2>
        <p className="muted max-w-3xl">La alternativa sin IA es una hoja de cálculo o un calendario manual: abrir cada PDF, copiar fechas y horarios y revisarlos a mano cada semana.</p>
        <div className="card overflow-x-auto">
          <table className="t">
            <thead><tr><th>Aspecto</th><th>Sin IA (Excel o calendario manual)</th><th>Con RAG + agente</th></tr></thead>
            <tbody>{filas.map((f) => (<tr key={f[0]}><td><b>{f[0]}</b></td><td>{f[1]}</td><td>{f[2]}</td></tr>))}</tbody>
          </table>
        </div>
        <p className="muted text-xs">Los tiempos sin IA son estimaciones del equipo.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Integrantes</h2>
        <div className="flex flex-wrap gap-2">{integrantes.map((n) => (<span key={n} className="chip" style={{ fontSize: 14, padding: "6px 14px" }}>{n}</span>))}</div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Cómo probar la demo</h2>
        <ol className="list-decimal space-y-1 pl-6">
          <li>Entra a <b>Demo</b> y sube uno o varios PDF de planes docentes.</li>
          <li>Revisa lo detectado: elige tu <b>paralelo</b>, corrige horarios y escribe tu correo.</li>
          <li>Haz preguntas en el chat.</li>
          <li>Pulsa <b>«Enviarme el resumen ahora»</b> para ver el correo semanal sin esperar al viernes.</li>
        </ol>
        <Link href="/demo" className="btn btn-primary">Ir a la demo →</Link>
      </section>
    </div>
  );
}
