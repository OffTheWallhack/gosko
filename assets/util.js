/* Čisté pomocné funkcie bez DOM (testujú sa v Node): bezpečné odkazy, export CSV a ICS,
   escapovanie HTML a prenos passov zo starej domény. */

/* Chyba, ktorej text sa ukáže používateľovi vo formulári. */
export class UserError extends Error {}

/* Odkaz z databázy alebo od používateľa: prejde len http(s) s hostiteľom, inak null.
   Odmietne aj riadiace znaky a medzery (javascript:, data:, „java\nscript:“, vložené riadky do ICS). */
export function safeUrl(u) {
  if (typeof u !== 'string') return null;
  const s = u.trim();
  if (!/^https?:\/\/[^\s/?#\\]/i.test(s) || /[\u0000- \u007f]/.test(s)) return null;
  try { new URL(s); } catch { return null; }
  return s;
}

/* Bunka CSV v úvodzovkách. Text, ktorý Excel alebo Sheets vyhodnotí ako vzorec (= + - @ tab CR),
   dostane na začiatok apostrof. Čisté čísla ostanú bez zmeny. */
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/;
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
/* Celé CSV pre Excel: BOM (kvôli diakritike), bodkočiarka, CRLF. */
export const csvRows = (keys, rows) => '﻿' + [keys.map(csvCell).join(';'), ...rows.map(r => keys.map(k => csvCell(r[k])).join(';'))].join('\r\n');

/* Text do vlastnosti ICS (RFC 5545, TEXT): nové riadky aj CR ako \n, escapovaná lomka, bodkočiarka a čiarka. */
export const icsText = s => String(s ?? '')
  .replace(/\r\n|\r|\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
  .replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');

/* Escapovanie do HTML (pre innerHTML a atribúty). */
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENT[c]);

/* ---------- prenos passov zo starej domény (GitHub Pages → nová doména) ----------
   Stará stránka (redirect/index.html) zakóduje passy z localStorage do hashu
   #/import-passes/<base64url(JSON)> a nová doména si ich uloží. Prenáša sa len to, čo pass ukazuje. */
export const MAX_PASSES = 20;
export const PASS_FIELDS = ['token', 'eventId', 'event', 'date', 'name', 'category'];

export function encodePasses(list) {
  const slim = (Array.isArray(list) ? list : []).slice(0, MAX_PASSES).map(p => Object.fromEntries(PASS_FIELDS.map(k => [k, String(p[k] ?? '')])));
  const bytes = new TextEncoder().encode(JSON.stringify(slim));
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
export function decodePasses(s) {
  if (typeof s !== 'string' || !/^[\w-]+$/.test(s) || s.length > 20000) return [];
  let data;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const p of data) {
    if (out.length >= MAX_PASSES) break;
    if (!p || typeof p !== 'object') continue;
    const token = str(p.token, 65), eventId = str(p.eventId, 65), date = str(p.date, 10), category = str(p.category, 21);
    if (!/^[\w-]{8,64}$/.test(token) || !/^[\w-]{1,64}$/.test(eventId)) continue;
    out.push({ token, eventId, event: str(p.event, 80), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', name: str(p.name, 80), category: /^[\w-]{0,20}$/.test(category) ? category : '' });
  }
  return out;
}

/* Doplní prenesené passy k uloženým (podľa tokenu), uložené nemení. Najnovšie sú prvé. */
export function mergePasses(existing, incoming, now = Date.now()) {
  const have = new Set(existing.map(p => p.token));
  const add = [];
  for (const p of incoming) if (!have.has(p.token)) { have.add(p.token); add.push({ ...p, created: now }); }
  if (!add.length) return existing;
  return [...add, ...existing].sort((a, b) => (b.created || 0) - (a.created || 0));
}

/* Kam ísť po importe: len hash routa tohto webu (napr. starý odkaz #/checkin/<token>), inak úvod. */
export function importTarget(raw) {
  let t;
  try { t = decodeURIComponent(raw || ''); } catch { return '#/'; }
  if (t.startsWith('/')) t = '#' + t;
  if (!/^#\/[\w\-/]*$/.test(t) || t.startsWith('#/import-passes')) return '#/';
  return t;
}
