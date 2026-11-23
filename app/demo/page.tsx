"use client";
import { useState } from "react";
import UploadStep from "@/components/UploadStep";
import ReviewTable, { type Editable } from "@/components/ReviewTable";
import ChatBox from "@/components/ChatBox";
import AgentPanel from "@/components/AgentPanel";
import type { PlanDocente } from "@/lib/schema";
import { RECESO_DEFECTO, SEMANA1_DEFECTO, inferirSemana1 } from "@/lib/calendar";

const PASOS = ["Subir", "Revisar", "Chat y resumen"];

export default function Demo() {
  const [paso, setPaso] = useState(1);
  const [planes, setPlanes] = useState<Editable[]>([]);
  const [email, setEmail] = useState("");
  const [semana1, setSemana1] = useState(SEMANA1_DEFECTO);
  const [suscrito, setSuscrito] = useState(true);
  const [sesionId, setSesionId] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  function onListo(nuevos: PlanDocente[]) {
    const ed: Editable[] = nuevos.map((plan) => ({
      id: crypto.randomUUID(),
      plan,
      paralelo: plan.paralelosDetectados.length === 1 ? plan.paralelosDetectados[0] : "",
    }));
    setPlanes(ed);
    setSemana1(inferirSemana1(nuevos.flatMap((p) => p.fechasImportantes)));
    setPaso(2);
  }

  async function confirmar() {
    setCargando(true); setError("");
    try {
      const r = await fetch("/api/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, semana1, receso: RECESO_DEFECTO, suscrito, materias: planes.map((p) => ({ plan: p.plan, paraleloElegido: p.paralelo })) }),
      });
      let j: any;
      try {
        j = await r.json();
      } catch {
        if (!r.ok) {
          throw new Error(`El servidor tardó en responder (${r.status} Gateway Timeout). Por favor pulsa Confirmar nuevamente.`);
        }
        throw new Error("Respuesta inválida del servidor al confirmar.");
      }
      if (!r.ok) throw new Error(j?.error || "Error al confirmar.");
      setSesionId(j.sesionId);
      setPaso(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2">
        {PASOS.map((n, i) => (
          <li key={n} className="chip" style={{ opacity: paso === i + 1 ? 1 : 0.5, fontSize: 14, padding: "6px 14px" }}>{i + 1}. {n}</li>
        ))}
      </ol>
      {paso === 1 && <UploadStep onListo={onListo} />}
      {paso === 2 && (
        <ReviewTable planes={planes} setPlanes={setPlanes} email={email} setEmail={setEmail} semana1={semana1} setSemana1={setSemana1} suscrito={suscrito} setSuscrito={setSuscrito} onConfirm={confirmar} cargando={cargando} error={error} />
      )}
      {paso === 3 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChatBox sesionId={sesionId} />
          <AgentPanel sesionId={sesionId} />
        </div>
      )}
    </div>
  );
}
