import nodemailer from "nodemailer";
import type { Redaccion } from "./agent";

export type ClaseDia = { materia: string; tipo: string; hora: string; aula: string };
export type DiaAgenda = { fecha: string; etiqueta: string; clases: ClaseDia[] };
export type EvalItem = { materia: string; actividad: string; cuando: string; ponderacion?: number };
export type TemaItem = { materia: string; unidad: string; contenidos: string[] };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const COLORES = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#dc2626", "#0d9488"];
const TIPO: Record<string, string> = { CLAS: "Clase", PRAC: "Práctica", TUTO: "Tutoría" };

export type DatosCorreo = {
  semana: number; rango: string; materias: string[]; agenda: DiaAgenda[];
  evaluaciones: EvalItem[]; temas: TemaItem[]; texto: Redaccion; bajaUrl: string; appUrl: string;
};

export function renderCorreo(d: DatosCorreo): string {
  const color = (m: string) => COLORES[Math.max(0, d.materias.indexOf(m)) % COLORES.length];
  const chip = (m: string) => `<span style="display:inline-block;background:${color(m)};color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600">${esc(m)}</span>`;

  const dias = d.agenda
    .filter((a) => a.clases.length)
    .map(
      (a) => `<tr><td style="padding:12px 0;border-top:1px solid #e4e4e7"><div style="font-weight:700;text-transform:capitalize;margin-bottom:6px">${esc(a.etiqueta)}</div>${a.clases
        .map((c) => `<div style="margin:4px 0;font-size:14px">${chip(c.materia)} <b>${esc(c.hora)}</b> · ${TIPO[c.tipo] ?? esc(c.tipo)} · <span style="color:#71717a">${esc(c.aula)}</span></div>`)
        .join("")}</td></tr>`
    )
    .join("");

  const evals = d.evaluaciones.length
    ? `<div style="background:#fef3c7;border-radius:12px;padding:14px 16px;margin:16px 0"><div style="font-weight:700;margin-bottom:6px">📌 Evaluaciones y fechas clave</div>${d.evaluaciones
        .map((e) => `<div style="font-size:14px;margin:4px 0">${chip(e.materia)} <b>${esc(e.actividad)}</b> · ${esc(e.cuando)}${e.ponderacion ? ` · vale ${e.ponderacion}%` : ""}</div>`)
        .join("")}</div>`
    : "";

  const destacados = d.texto.destacados.length
    ? `<ul style="margin:8px 0 0 18px;padding:0;font-size:14px">${d.texto.destacados.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
    : "";

  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#18181b">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#4f46e5;color:#fff;padding:22px 24px"><div style="font-size:13px;opacity:.85">Tu resumen semanal</div><div style="font-size:22px;font-weight:700">Semana ${d.semana} · ${esc(d.rango)}</div></td></tr>
<tr><td style="padding:20px 24px"><p style="margin:0;font-size:15px;line-height:1.5">${esc(d.texto.introduccion)}</p>${destacados}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">${dias || '<tr><td style="padding:12px 0;color:#71717a">No hay clases registradas para esta semana.</td></tr>'}</table>
${evals}
<div style="background:#eef2ff;border-radius:12px;padding:14px 16px;margin:16px 0"><div style="font-weight:700;margin-bottom:6px">📚 Para estudiar esta semana</div><div style="font-size:14px;line-height:1.5">${esc(d.texto.sugerenciaEstudio)}</div></div>
</td></tr>
<tr><td style="padding:16px 24px;background:#fafafa;font-size:12px;color:#71717a;line-height:1.5">Resumen generado por IA a partir de tus planes docentes; verifica las fechas en el plan oficial.<br><a href="${d.appUrl}/demo" style="color:#4f46e5">Abrir el asistente</a> · <a href="${d.bajaUrl}" style="color:#71717a">Dejar de recibir este correo</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function renderTexto(d: DatosCorreo): string {
  const l = [`Semana ${d.semana} · ${d.rango}`, "", d.texto.introduccion, ""];
  for (const a of d.agenda) if (a.clases.length) {
    l.push(a.etiqueta.toUpperCase());
    a.clases.forEach((c) => l.push(`  - ${c.materia}: ${c.hora} (${TIPO[c.tipo] ?? c.tipo}) ${c.aula}`));
  }
  if (d.evaluaciones.length) { l.push("", "EVALUACIONES"); d.evaluaciones.forEach((e) => l.push(`  - ${e.materia}: ${e.actividad} · ${e.cuando}`)); }
  l.push("", "PARA ESTUDIAR", d.texto.sugerenciaEstudio, "", `Dejar de recibir: ${d.bajaUrl}`);
  return l.join("\n");
}

export async function enviarCorreo(to: string, subject: string, html: string, text: string) {
  const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  await t.sendMail({ from: `Planes Docentes IA <${process.env.GMAIL_USER}>`, to, subject, html, text });
}
