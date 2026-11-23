import { GoogleGenAI } from "@google/genai";

export const MODEL = "gemini-3.5-flash";

/**
 * Obtiene todas las API keys configuradas.
 * Soporta:
 * 1. Claves separadas por comas en GEMINI_API_KEY o GEMINI_API_KEYS (ej: "key1,key2,key3")
 * 2. Variables numeradas: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3...
 */
function obtenerApiKeys(): string[] {
  const keys: string[] = [];

  const rawPrincipal = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  for (const k of rawPrincipal.split(",")) {
    const trimmed = k.trim();
    if (trimmed) keys.push(trimmed);
  }

  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }

  return Array.from(new Set(keys)).filter(Boolean);
}

let indiceKeyActual = 0;

function rotarKey(motivo?: string): number {
  const keys = obtenerApiKeys();
  if (keys.length <= 1) return 0;
  const previa = indiceKeyActual;
  indiceKeyActual = (indiceKeyActual + 1) % keys.length;
  console.warn(
    `[Gemini Key Rotation] Rotando a clave #${indiceKeyActual + 1} de ${keys.length} (Anterior: #${previa + 1}). Motivo: ${motivo || "cuota o error"}`
  );
  return indiceKeyActual;
}

function esErrorDeCuota(e: unknown): boolean {
  const msg = (e as Error)?.message || String(e);
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("quota") ||
    msg.toLowerCase().includes("rate limit")
  );
}

/**
 * Ejecuta una operación con la API de Gemini. Si la clave actual arroja 429 (cuota agotada)
 * o error transitorio, rota automáticamente a la siguiente clave disponible y reintenta.
 */
export async function ejecutarConFallback<T>(
  operacion: (client: GoogleGenAI) => Promise<T>,
  intentosMaximos = 4
): Promise<T> {
  const keys = obtenerApiKeys();
  if (keys.length === 0) {
    throw new Error("No hay ninguna GEMINI_API_KEY configurada.");
  }

  let ultimoError: unknown;
  const totalIntentos = Math.max(keys.length * 2, intentosMaximos);

  for (let i = 0; i < totalIntentos; i++) {
    const key = keys[indiceKeyActual % keys.length];
    const client = new GoogleGenAI({ apiKey: key });

    try {
      return await operacion(client);
    } catch (e) {
      ultimoError = e;
      const errMsg = (e as Error)?.message || String(e);

      if (esErrorDeCuota(e)) {
        if (keys.length > 1) {
          rotarKey("Límite de cuota alcanzado (429)");
          // Siguiente clave inmediatamente sin esperar
          continue;
        } else {
          // Solo 1 clave: esperar brevemente
          await new Promise((r) => setTimeout(r, 2000));
        }
      } else if (errMsg.startsWith("An error occurred") || errMsg.includes("transitoria") || errMsg.includes("JSON")) {
        rotarKey("Error transitorio o respuesta corrupta de Gemini");
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        rotarKey(`Fallo: ${errMsg.slice(0, 100)}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw ultimoError;
}

export async function generarJSON(system: string, user: string, maxOutputTokens = 32768): Promise<unknown> {
  return await ejecutarConFallback(async (ai) => {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: user,
      config: {
        systemInstruction: system,
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const t = (res.text ?? "").replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    if (!t || (!t.startsWith("{") && !t.startsWith("["))) {
      throw new Error(`Respuesta no es JSON válido de Gemini: ${t.slice(0, 100)}`);
    }
    return JSON.parse(t);
  });
}

export type Turno = { role: "user" | "assistant"; content: string };

export async function generarTexto(system: string, historial: Turno[], pregunta: string): Promise<string> {
  const contents = [
    ...historial.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    { role: "user", parts: [{ text: pregunta }] },
  ];
  return await ejecutarConFallback(async (ai) => {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: system,
        temperature: 0.2,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const t = (res.text ?? "").trim();
    if (!t || t.startsWith("An error occurred")) {
      throw new Error(`Respuesta transitoria inválida de Gemini: ${t.slice(0, 100)}`);
    }
    return t;
  });
}

const normalizar = (v: number[]) => {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / n) * 1e4) / 1e4);
};

export async function embed(textos: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const LOTE = 40;
  const lotes: string[][] = [];
  for (let i = 0; i < textos.length; i += LOTE) {
    lotes.push(textos.slice(i, i + LOTE));
  }

  const resultados = await Promise.all(
    lotes.map((lote) =>
      ejecutarConFallback(async (ai) => {
        const r = await ai.models.embedContent({
          model: "gemini-embedding-001",
          contents: lote,
          config: { taskType: task, outputDimensionality: 256 },
        });
        return (r.embeddings ?? []).map((e) => normalizar(e.values ?? []));
      })
    )
  );

  return resultados.flat();
}
