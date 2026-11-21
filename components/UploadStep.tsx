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

type Item = {
  file: File;
  estado: "pendiente" | "leyendo" | "extrayendo" | "listo" | "error";
  plan?: PlanDocente;
  msg?: string;
};

export default function UploadStep({ onListo }: { onListo: (planes: PlanDocente[]) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [ocupado, setOcupado] = useState(false);

  async function extraerUnArchivo(
    file: File,
    onEstado: (e: Partial<Item>) => void
  ): Promise<PlanDocente> {
    if (file.size > 15 * 1024 * 1024) throw new Error("Pesa más de 15 MB.");
    onEstado({ estado: "leyendo" });
    const texto = await pdfATexto(file);
    if (texto.trim().length < 500)
      throw new Error("Parece un PDF escaneado. Sube el PDF original del plan docente.");
    onEstado({ estado: "extrayendo" });
    const r = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Error al extraer.");
    onEstado({ estado: "listo", plan: j.plan });
    return j.plan as PlanDocente;
  }

  async function procesar(files: FileList | null) {
    if (!files || !files.length) return;
    const lista = Array.from(files)
      .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
      .slice(0, 10);
    if (!lista.length) return;

    setOcupado(true);
    const nuevos: Item[] = lista.map((file) => ({ file, estado: "pendiente" }));
    setItems(nuevos);

    const planesListos: PlanDocente[] = [];
    let huboError = false;

    // Procesamiento estrictamente secuencial para cuidar cuota y evitar timeouts simultáneos
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      try {
        const plan = await extraerUnArchivo(f, (patch) => {
          setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        });
        planesListos.push(plan);
      } catch (e) {
        huboError = true;
        setItems((prev) =>
          prev.map((x, j) => (j === i ? { ...x, estado: "error", msg: (e as Error).message } : x))
        );
      }
      if (i < lista.length - 1) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    setOcupado(false);

    // Si todos terminaron exitosamente sin errores, avanza automáticamente
    if (!huboError && planesListos.length > 0) {
      onListo(planesListos);
    }
  }

  async function reintentar(indice: number) {
    const item = items[indice];
    if (!item || ocupado) return;
    setOcupado(true);
    try {
      const plan = await extraerUnArchivo(item.file, (patch) => {
        setItems((prev) => prev.map((x, j) => (j === indice ? { ...x, ...patch } : x)));
      });
      setItems((prev) => {
        const actualizados = prev.map((x, j) =>
          j === indice ? { ...x, estado: "listo" as const, plan, msg: undefined } : x
        );
        const todosListos = actualizados.every((x) => x.estado === "listo" && x.plan);
        if (todosListos) {
          onListo(actualizados.map((x) => x.plan!));
        }
        return actualizados;
      });
    } catch (e) {
      setItems((prev) =>
        prev.map((x, j) => (j === indice ? { ...x, estado: "error", msg: (e as Error).message } : x))
      );
    } finally {
      setOcupado(false);
    }
  }

  const planesListos = items.filter((x) => x.estado === "listo" && x.plan).map((x) => x.plan!);
  const tieneErrores = items.some((x) => x.estado === "error");

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-xl font-semibold">1. Sube tus planes docentes</h2>
        <p className="muted text-sm">
          PDF originales de la UTPL (uno por materia, hasta 10). Se procesan uno a uno para mayor
          estabilidad.
        </p>
      </div>

      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-3xl">📄</span>
        <span className="font-semibold">
          {ocupado ? "Procesando planes secuencialmente…" : "Haz clic para elegir tus PDF"}
        </span>
        <span className="muted text-sm">Cada plan puede tardar entre 15 y 35 segundos</span>
        <input
          type="file"
          accept="application/pdf"
          multiple
          hidden
          disabled={ocupado}
          onChange={(e) => procesar(e.target.files)}
        />
      </label>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-medium">{it.file.name}</span>
              <div className="flex items-center gap-2">
                <span className={it.estado === "error" ? "err" : "muted"}>
                  {it.estado === "pendiente" && "⏳ En cola…"}
                  {it.estado === "leyendo" && "📖 Leyendo PDF…"}
                  {it.estado === "extrayendo" && "🤖 Extrayendo con IA…"}
                  {it.estado === "listo" && "✅ Listo"}
                  {it.estado === "error" && `❌ ${it.msg}`}
                </span>
                {it.estado === "error" && !ocupado && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "2px 8px" }}
                    onClick={() => reintentar(i)}
                  >
                    🔄 Reintentar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botón para avanzar si algunos fallaron pero el usuario desea continuar con los listos */}
      {tieneErrores && !ocupado && planesListos.length > 0 && (
        <div className="pt-2">
          <button className="btn btn-primary" onClick={() => onListo(planesListos)}>
            Continuar con los {planesListos.length}{" "}
            {planesListos.length === 1 ? "plan listo" : "planes listos"} →
          </button>
        </div>
      )}
    </div>
  );
}
