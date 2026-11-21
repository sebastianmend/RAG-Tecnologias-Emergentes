"use client";
import { useState } from "react";
import type { PlanDocente } from "@/lib/schema";

async function pdfATexto(file: File): Promise<string> {
  // @ts-ignore tipos de la build legacy
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let texto = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    let y: number | null = null;
    for (const it of content.items as { str?: string; transform: number[] }[]) {
      if (typeof it.str !== "string") continue;
      const yy = it.transform[5];
      if (y !== null) texto += Math.abs(yy - y) > 2 ? "\n" : " ";
      texto += it.str;
      y = yy;
    }
    texto += "\n\n";
  }
  return texto;
}

type Estado = { nombre: string; estado: "leyendo" | "extrayendo" | "listo" | "error"; msg?: string };

export default function UploadStep({ onListo }: { onListo: (planes: PlanDocente[]) => void }) {
  const [items, setItems] = useState<Estado[]>([]);
  const [ocupado, setOcupado] = useState(false);

  async function procesar(files: FileList | null) {
    if (!files || !files.length) return;
    const lista = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf")).slice(0, 10);
    if (!lista.length) return;
    setOcupado(true);
    setItems(lista.map((f) => ({ nombre: f.name, estado: "leyendo" })));
    const set = (i: number, e: Partial<Estado>) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...e } : x)));

    const res = await Promise.all(
      lista.map(async (f, i): Promise<PlanDocente | null> => {
        try {
          if (f.size > 15 * 1024 * 1024) throw new Error("Pesa más de 15 MB.");
          const texto = await pdfATexto(f);
          if (texto.trim().length < 500) throw new Error("Parece un PDF escaneado. Sube el PDF original del plan docente.");
          set(i, { estado: "extrayendo" });
          const r = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Error al extraer.");
          set(i, { estado: "listo" });
          return j.plan as PlanDocente;
        } catch (e) {
          set(i, { estado: "error", msg: (e as Error).message });
          return null;
        }
      })
    );
    setOcupado(false);
    const ok = res.filter((x): x is PlanDocente => !!x);
    if (ok.length) onListo(ok);
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-xl font-semibold">1. Sube tus planes docentes</h2>
        <p className="muted text-sm">PDF originales de la UTPL (uno por materia, hasta 10). No se guardan los archivos; solo se usa su texto para extraer los datos.</p>
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center" style={{ borderColor: "var(--border)" }}>
        <span className="text-3xl">📄</span>
        <span className="font-semibold">{ocupado ? "Procesando…" : "Haz clic para elegir tus PDF"}</span>
        <span className="muted text-sm">Cada plan puede tardar entre 20 y 60 segundos</span>
        <input type="file" accept="application/pdf" multiple hidden disabled={ocupado} onChange={(e) => procesar(e.target.files)} />
      </label>
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span>{it.nombre}</span>
          <span className={it.estado === "error" ? "err" : "muted"}>
            {it.estado === "leyendo" && "Leyendo PDF…"}
            {it.estado === "extrayendo" && "Extrayendo con IA…"}
            {it.estado === "listo" && "✅ Listo"}
            {it.estado === "error" && `❌ ${it.msg}`}
          </span>
        </div>
      ))}
    </div>
  );
}
