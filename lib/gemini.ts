import { GoogleGenAI } from "@google/genai";
import { conReintento } from "./utils";

let _ai: GoogleGenAI | null = null;
const ai = () => (_ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
export const MODEL = "gemini-3.5-flash";

export async function generarJSON(system: string, user: string, maxOutputTokens = 32768): Promise<unknown> {
  const res = await conReintento(
    () =>
      ai().models.generateContent({
        model: MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: 0,
          responseMimeType: "application/json",
          maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    3,
    8000
  );
  const t = (res.text ?? "").replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(t);
}

export type Turno = { role: "user" | "assistant"; content: string };

export async function generarTexto(system: string, historial: Turno[], pregunta: string): Promise<string> {
  const contents = [
    ...historial.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    { role: "user", parts: [{ text: pregunta }] },
  ];
  const res = await conReintento(
    () =>
      ai().models.generateContent({
        model: MODEL,
        contents,
        config: { systemInstruction: system, temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    3,
    8000
  );
  return (res.text ?? "").trim();
}

const normalizar = (v: number[]) => {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / n) * 1e4) / 1e4);
};

export async function embed(textos: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < textos.length; i += 40) {
    const lote = textos.slice(i, i + 40);
    const r = await conReintento(
      () =>
        ai().models.embedContent({
          model: "gemini-embedding-001",
          contents: lote,
          config: { taskType: task, outputDimensionality: 256 },
        }),
      4,
      15000
    );
    for (const e of r.embeddings ?? []) out.push(normalizar(e.values ?? []));
  }
  return out;
}
