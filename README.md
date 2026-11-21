# RAG Tecnologías Emergentes — Asistente de Planes Docentes

Next.js 15 + Gemini (`gemini-3.5-flash`, `gemini-embedding-001`) + Upstash Redis + Nodemailer. Desplegado en Vercel.

- `/` Cómo funciona (qué es RAG, integrantes, comparación sin IA)
- `/demo` Subir PDF → revisar → chat RAG → agente de resumen semanal

## Desarrollo
1. `cp .env.example .env.local` y completa las variables.
2. `npm ci && npm run dev`
3. `npm run test:cal` valida el calendario.

Integrantes: Jean Villavicencio, Sebastián Mendieta, Cristian Jiménez, Samuel Reyes.
