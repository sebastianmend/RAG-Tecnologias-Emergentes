import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Planes Docentes IA · RAG + Agente",
  description: "Sube tus planes docentes, pregunta lo que quieras y recibe tu resumen semanal por correo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header style={{ borderBottom: "1px solid var(--border)" }}>
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold">📚 Planes Docentes IA</Link>
            <div className="flex gap-2">
              <Link className="btn btn-ghost" href="/">Cómo funciona</Link>
              <Link className="btn btn-primary" href="/demo">Demo</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-sm muted">
          Proyecto «La IA, más allá del asistente» · Tecnologías Emergentes · UTPL. Sube solo planes docentes (no datos sensibles). Contenido generado por IA: verifica fechas en el plan oficial.
        </footer>
      </body>
    </html>
  );
}
