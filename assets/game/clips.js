/* Pridanie klipu zo spotu: video (do 60 s a 50 MB), fotka (zmenší sa na JPEG bez EXIF) alebo odkaz
   na Instagram, TikTok či YouTube. Súbor ide priamo do súkromného bucketu media do priečinka hráča
   (RLS v 016 pustí len hráča so súhlasmi), potom add_clip. Keď add_clip zlyhá, súbor sa zmaže. */
import { T } from './i18n-sk.js';
import { parseEmbed, validateMedia } from './logic.js';
import { h, icon } from './ui.js';
import { UserError } from '../util.js';

const PHOTO_MAX_PX = 1600;

/* Dĺžka videa v sekundách z metadát (prehliadač). Neznáma = NaN. */
export function readVideoDuration(file, { timeout = 10_000 } = {}) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = d => { clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(d); };
    const timer = setTimeout(() => done(NaN), timeout);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : NaN);
    v.onerror = () => done(NaN);
    v.src = url;
  });
}

/* Fotka -> JPEG najviac PHOTO_MAX_PX na dlhšej strane. Canvas zahodí EXIF (aj GPS polohu). */
export async function preparePhoto(file, max = PHOTO_MAX_PX, quality = 0.84) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  let src = bmp, w, hgt, url = null;
  if (bmp) { w = bmp.width; hgt = bmp.height; } else {
    const img = new Image(); url = URL.createObjectURL(file); img.src = url; await img.decode();
    src = img; w = img.naturalWidth; hgt = img.naturalHeight;
  }
  const s = Math.min(1, max / Math.max(w, hgt));
  const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(hgt * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  if (url) URL.revokeObjectURL(url);
  bmp?.close?.();
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new UserError(T.clips.errType);
  return blob;
}

/* Overí, nahrá a zverejní klip. Vráti výsledok add_clip ({ id, verified, … }).
   args: { playerId, spotId, cfg, file?, duration?, embedUrl?, trick?, uuid?, prepare? } */
export async function submitClip(api, { playerId, spotId, cfg, file = null, duration = NaN, embedUrl = '', trick = '', uuid = () => crypto.randomUUID(), prepare = preparePhoto }) {
  const p_trick = String(trick || '').replace(/\s+/g, ' ').trim().slice(0, 60) || null;
  if (!file) {
    const e = parseEmbed(embedUrl);
    if (!e) throw new UserError(embedUrl ? T.clips.errEmbed : T.clips.needOne);
    return api.addClip({ p_spot: spotId, p_kind: 'embed', p_embed_url: e.url, p_trick });
  }
  const v = validateMedia({ type: file.type, size: file.size, duration }, cfg);
  if (v.error) throw new UserError(v.error);
  let blob = file, type = file.type;
  if (v.kind === 'photo') {
    blob = await prepare(file);
    type = 'image/jpeg';
    if (blob.size > cfg.photo_max_mb * 1024 * 1024) throw new UserError(T.clips.errPhotoBig(cfg.photo_max_mb));
  }
  const path = `${playerId}/${uuid()}.${v.ext}`;
  await api.uploadMedia(path, blob, type);
  try {
    return await api.addClip({ p_spot: spotId, p_kind: v.kind, p_media_path: path, ...(v.kind === 'video' ? { p_duration_s: v.duration } : {}), p_trick });
  } catch (err) {
    await Promise.resolve(api.removeMedia(path)).catch(() => {});
    throw err;
  }
}

/* Formulár klipu ako sheet nad mapou. opts: { spot, api, me, cfg, onDone(res), onClose } */
export function clipSheet(host, { spot, api, me, cfg, onDone, onClose }) {
  const msg = h('p', { class: 'g-msg', role: 'alert' });
  const fileIn = h('input', { type: 'file', name: 'file', accept: 'video/mp4,video/quicktime,video/webm,image/*' });
  const linkIn = h('input', { type: 'url', name: 'link', inputmode: 'url', placeholder: T.clips.linkPh, maxlength: 300, autocomplete: 'off' });
  const trickIn = h('input', { name: 'trick', maxlength: 60, placeholder: T.clips.trickPh, autocomplete: 'off' });
  const info = h('p', { class: 'g-hint', role: 'status' });
  const submit = h('button', { class: 'g-btn g-btn-in', type: 'submit' }, T.clips.submit);
  let duration = NaN;
  fileIn.addEventListener('change', async () => {
    msg.textContent = ''; info.textContent = ''; duration = NaN;
    const f = fileIn.files[0];
    if (!f) return;
    linkIn.value = '';
    if (f.type.startsWith('video/')) duration = await readVideoDuration(f);
    const v = validateMedia({ type: f.type, size: f.size, duration }, cfg);
    if (v.error) msg.textContent = v.error;
    else info.textContent = v.kind === 'video' ? `${v.duration} s · ${(f.size / 1048576).toFixed(1).replace('.', ',')} MB` : '';
  });
  linkIn.addEventListener('input', () => { if (linkIn.value && fileIn.value) { fileIn.value = ''; info.textContent = ''; } });
  const form = h('form', { class: 'g-form', novalidate: true },
    h('h2', { class: 'wide g-form-title' }, T.clips.title),
    h('p', { class: 'g-coords cond' }, spot.name),
    h('p', { class: 'g-hint' }, T.clips.lead),
    h('label', { class: 'g-field' }, h('span', {}, T.clips.file), fileIn, h('small', {}, T.clips.fileHint)),
    h('p', { class: 'g-or cond' }, T.clips.orLink),
    h('label', { class: 'g-field' }, h('span', {}, T.clips.link), linkIn),
    h('label', { class: 'g-field' }, h('span', {}, T.clips.trick), trickIn),
    h('p', { class: 'g-hint ok' }, T.clips.verifiedHint),
    info, msg,
    h('div', { class: 'g-actions' }, submit, h('button', { class: 'g-btn g-btn-ghost', type: 'button', onclick: () => onClose() }, T.clips.cancel)));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = '';
    submit.disabled = true; submit.textContent = T.clips.uploading;
    try {
      const res = await submitClip(api, { playerId: me.id, spotId: spot.id, cfg, file: fileIn.files[0] || null, duration, embedUrl: linkIn.value, trick: trickIn.value });
      onDone(res);
    } catch (err) {
      if (!(err instanceof UserError)) console.error(err);
      msg.textContent = err instanceof UserError ? err.message : T.err.UNKNOWN;
    } finally { if (submit.isConnected) { submit.disabled = false; submit.textContent = T.clips.submit; } }
  });
  const sheet = h('div', { class: 'g-sheet g-sheet-form', role: 'dialog', 'aria-label': T.clips.title },
    h('button', { class: 'g-x', type: 'button', 'aria-label': T.clips.cancel, onclick: () => onClose() }, icon('close')), form);
  host.append(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
  return { el: sheet, close() { sheet.remove(); } };
}
