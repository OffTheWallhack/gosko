/* Karta jazdca na zdieľanie: nakreslí tú istú kartu ako stránka #/karta/… (fotka, poradie, 3D doska, štatistiky, holo fólia)
   a z nej urobí obrázok na stories (PNG 1080×1920) alebo krátke video, v ktorom sa karta pomaly otáča. */

const FD = '"Anton", Impact, "Arial Narrow", sans-serif';
const FM = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
const FB = '"Archivo", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const RATIO = 4.25 / 3;   // výška / šírka karty, rovnako ako .kt-card v style.css
const STORY_W = 1080, STORY_H = 1920;

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
const loadImg = async src => { const i = new Image(); i.src = new URL(src, document.baseURI).href; await i.decode(); return i; };

function roundPath(x, X, Y, W, H, R) {
  x.beginPath();
  if (x.roundRect) { x.roundRect(X, Y, W, H, R); return; }
  x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath();
}
function spaced(x, px) { if ('letterSpacing' in x) x.letterSpacing = px + 'px'; }

/* Načíta fotku, logo, písma. Vráti údaje pripravené na kreslenie.
   d = { name, rank, cat, season, stats: [[číslo, 'bodov'], …], photo, photoPos, photoFlip, board (canvas s doskou), url } */
export async function prepareCard(d) {
  await Promise.all([document.fonts.load(`48px Anton`), document.fonts.load(`600 20px "IBM Plex Mono"`), document.fonts.load(`800 20px Archivo`)].map(p => p.catch(() => {})));
  const [photoImg, mark, ghost] = await Promise.all([
    d.photo ? loadImg(d.photo).catch(() => null) : null,
    loadImg('img/gosko-wordmark-cream.svg').catch(() => null),
    d.photo ? null : loadImg('img/ghost-cream.svg').catch(() => null),
  ]);
  return { ...d, photoImg, mark, ghost };
}

/* karta bez fólie (základ); fólia a odlesk sa pridávajú zvlášť, aby sa dali hýbať */
function cardBase(P, W) {
  const H = Math.round(W * RATIO), k = W / 340, c = mk(W, H), x = c.getContext('2d');
  x.save(); roundPath(x, 0, 0, W, H, 22 * k); x.clip();
  x.fillStyle = '#17161a'; x.fillRect(0, 0, W, H);
  if (P.photoImg) {
    const im = P.photoImg, s = Math.max(W / im.naturalWidth, H / im.naturalHeight), dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    const [px, py] = (P.photoPos || '50% 50%').split(/\s+/).map(v => parseFloat(v) / 100);
    x.save(); x.translate(W / 2, H / 2); x.scale(P.photoFlip ? -1.2 : 1.2, 1.2); x.translate(-W / 2, -H / 2);
    if ('filter' in x) x.filter = 'saturate(1.08) contrast(1.06)';
    x.drawImage(im, (W - dw) * (isNaN(px) ? .5 : px), (H - dh) * (isNaN(py) ? .5 : py), dw, dh); x.restore();
  } else {
    const g = x.createLinearGradient(0, 0, W * .5, H); g.addColorStop(0, '#2a2630'); g.addColorStop(1, '#141217'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const r = x.createRadialGradient(W / 2, H * .35, 0, W / 2, H * .35, W * .9); r.addColorStop(0, 'rgba(160,20,20,.55)'); r.addColorStop(.7, 'rgba(160,20,20,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H);
    if (P.ghost) { const gw = W * .5, gh = gw * P.ghost.naturalHeight / P.ghost.naturalWidth; x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 16 * k; x.shadowOffsetY = 10 * k; x.drawImage(P.ghost, (W - gw) / 2, H / 2 - gh / 2 - .11 * W, gw, gh); x.shadowColor = 'transparent'; }
  }
  const sh = x.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, 'rgba(11,10,12,.55)'); sh.addColorStop(.26, 'rgba(11,10,12,0)'); sh.addColorStop(.5, 'rgba(11,10,12,0)'); sh.addColorStop(1, 'rgba(11,10,12,.94)');
  x.fillStyle = sh; x.fillRect(0, 0, W, H);

  // poradie a kategória
  x.textBaseline = 'top'; x.fillStyle = '#F3EBDD';
  x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 14 * k; x.shadowOffsetY = 3 * k;
  x.font = `400 ${48 * k}px ${FD}`; x.fillText(P.rank ? `#${P.rank}` : 'GOSko', 16 * k, 12 * k);
  x.shadowColor = 'transparent';
  x.font = `500 ${9.9 * k}px ${FM}`; spaced(x, .8 * k);
  const cat = `${P.cat} · ${P.season}`.toLocaleUpperCase('sk'), cw = x.measureText(cat).width + 18 * k, chh = 9.9 * k * 1.5 + 8 * k;
  roundPath(x, W - 16 * k - cw, 12 * k + 6 * k, cw, chh, chh / 2); x.fillStyle = 'rgba(11,10,12,.7)'; x.fill(); x.lineWidth = k; x.strokeStyle = 'rgba(243,235,221,.35)'; x.stroke();
  x.fillStyle = '#F3EBDD'; x.fillText(cat, W - 16 * k - cw + 9 * k, 12 * k + 6 * k + 4 * k + 9.9 * k * .2); spaced(x, 0);
  if (P.mark) { const mw = 76 * k, mh = mw * P.mark.naturalHeight / P.mark.naturalWidth; x.globalAlpha = .9; x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 6 * k; x.shadowOffsetY = 2 * k; x.drawImage(P.mark, 16 * k, 66 * k, mw, mh); x.globalAlpha = 1; x.shadowColor = 'transparent'; }

  // 3D doska
  if (P.board) {
    const bh = H * .46, bw = bh * P.board.width / P.board.height, cx = W * .98 - bw / 2, cy = H * .81 - bh / 2;
    x.save(); x.translate(cx, cy); x.rotate(12 * Math.PI / 180);
    x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 14 * k; x.shadowOffsetY = 14 * k;
    x.drawImage(P.board, -bw / 2, -bh / 2, bw, bh); x.restore();
  }

  // meno a čísla
  const colW = (W - 32 * k) / 3, statTop = H - 14 * k - (8 * k + 24 * k + 12 * k);
  x.strokeStyle = 'rgba(243,235,221,.3)'; x.lineWidth = k; x.beginPath(); x.moveTo(16 * k, statTop); x.lineTo(W - 16 * k, statTop); x.stroke();
  P.stats.forEach(([n, label], i) => {
    const sx = 16 * k + i * colW;
    x.fillStyle = '#F3EBDD'; x.font = `400 ${24 * k}px ${FD}`; x.fillText(String(n), sx, statTop + 8 * k);
    x.fillStyle = 'rgba(243,235,221,.7)'; x.font = `500 ${9.3 * k}px ${FM}`; spaced(x, .56 * k); x.fillText(String(label).toLocaleUpperCase('sk'), sx, statTop + 8 * k + 26 * k); spaced(x, 0);
  });
  const name = P.name.toLocaleUpperCase('sk'); let fs = 33 * k;
  for (; fs > 12 * k; fs -= k) { x.font = `400 ${fs}px ${FD}`; if (x.measureText(name).width <= W - 32 * k) break; }
  x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 14 * k; x.shadowOffsetY = 3 * k; x.fillStyle = '#F3EBDD'; x.textBaseline = 'alphabetic';
  x.fillText(name, 16 * k, statTop - 10 * k); x.shadowColor = 'transparent';
  x.restore();
  return c;
}

/* holo fólia, odlesk a okraj; mx, my sú 0 až 1 (kde sa karta leskne), px, py −1 až 1 (náklon) */
function finish(x, W, H, mx, my, px, py) {
  const k = W / 340;
  x.save(); roundPath(x, 0, 0, W, H, 22 * k); x.clip();
  x.globalCompositeOperation = 'color-dodge'; x.globalAlpha = .3;
  const bw = W * 2.4, bh = H * 2.4, bx = (W - bw) * mx, by = (H - bh) * my, a = 115 * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), len = Math.abs(bw * dx) + Math.abs(bh * dy);
  const g = x.createLinearGradient(bx + bw / 2 - dx * len / 2, by + bh / 2 - dy * len / 2, bx + bw / 2 + dx * len / 2, by + bh / 2 + dy * len / 2);
  [[.3, 'rgba(255,61,129,0)'], [.4, '#ff3d81'], [.47, '#ffd54a'], [.54, '#3dffb0'], [.61, '#3da5ff'], [.68, '#b66bff'], [.78, 'rgba(182,107,255,0)']].forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff';
  for (let yy = 0; yy < H + 40 * k; yy += 26 * k) for (let xx = 0; xx < W + 40 * k; xx += 26 * k) { x.beginPath(); x.arc(xx + 4.7 * k + px * 14 * k, yy + 7.3 * k + py * 14 * k, .9 * k, 0, 7); x.fill(); }
  for (let yy = 0; yy < H + 40 * k; yy += 34 * k) for (let xx = 0; xx < W + 40 * k; xx += 34 * k) { x.beginPath(); x.arc(xx + 9 * k + 23.8 * k - px * 10 * k, yy + 13 * k + 20.4 * k - py * 10 * k, .9 * k, 0, 7); x.fill(); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'overlay';
  const gx = mx * W, gy = my * H, far = Math.max(Math.hypot(gx, gy), Math.hypot(W - gx, gy), Math.hypot(gx, H - gy), Math.hypot(W - gx, H - gy));
  const r = x.createRadialGradient(gx, gy, 0, gx, gy, far * .46); r.addColorStop(0, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  roundPath(x, 1.5 * k, 1.5 * k, W - 3 * k, H - 3 * k, 21 * k); x.lineWidth = 3 * k; x.strokeStyle = 'rgba(255,255,255,.22)'; x.stroke();
  x.restore();
  roundPath(x, k, k, W - 2 * k, H - 2 * k, 21 * k); x.lineWidth = 2 * k; x.strokeStyle = '#e2b53c'; x.stroke();
}

/* pozadie stories: rozmazaná fotka s červeným závojom, ako na stránke karty */
function aura(P) {
  const s = mk(54, 96), x = s.getContext('2d');
  x.fillStyle = '#0b0a0c'; x.fillRect(0, 0, 54, 96);
  if (P.photoImg) {
    const im = P.photoImg, sc = Math.max(54 / im.naturalWidth, 96 / im.naturalHeight) * 1.2;
    x.globalAlpha = .55; x.save(); x.translate(27, 48); if (P.photoFlip) x.scale(-1, 1); x.drawImage(im, -im.naturalWidth * sc / 2, -im.naturalHeight * sc / 2, im.naturalWidth * sc, im.naturalHeight * sc); x.restore(); x.globalAlpha = 1;
  }
  const out = mk(STORY_W, STORY_H), o = out.getContext('2d');
  o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  o.drawImage(s, 0, 0, STORY_W, STORY_H);
  o.fillStyle = 'rgba(11,10,12,.35)'; o.fillRect(0, 0, STORY_W, STORY_H);
  const r = o.createRadialGradient(STORY_W / 2, STORY_H * .3, 0, STORY_W / 2, STORY_H * .3, STORY_H * .55);
  r.addColorStop(0, 'rgba(160,20,20,.42)'); r.addColorStop(1, 'rgba(160,20,20,0)'); o.fillStyle = r; o.fillRect(0, 0, STORY_W, STORY_H);
  return out;
}
function footer(o, P) {
  o.textAlign = 'center'; o.textBaseline = 'alphabetic';
  o.fillStyle = '#F3EBDD'; o.font = `800 54px ${FB}`; o.fillText('@gosko.sk', STORY_W / 2, 1640);
  o.fillStyle = 'rgba(243,235,221,.65)'; o.font = `500 30px ${FM}`; spaced(o, 2); o.fillText(`GAME OF S.K.A.T.E. · ${P.season}`, STORY_W / 2, 1696); spaced(o, 0); o.textAlign = 'start';
}

const CARD_W = 760;   // šírka karty na stories

/* PNG na výšku (1080×1920) na Instagram Story */
export async function riderStoryPng(data) {
  const P = await prepareCard(data);
  const out = aura(P), o = out.getContext('2d');
  const base = cardBase(P, CARD_W), H = base.height;
  finish(base.getContext('2d'), CARD_W, H, .5, .45, .1, .1);
  const X = (STORY_W - CARD_W) / 2, Y = 330;
  roundPath(o, X, Y, CARD_W, H, 22 * CARD_W / 340); o.fillStyle = '#17161a';
  o.shadowColor = 'rgba(226,181,60,.5)'; o.shadowBlur = 80; o.fill();
  o.shadowColor = 'rgba(0,0,0,.85)'; o.shadowBlur = 110; o.shadowOffsetY = 60; o.fill(); o.shadowColor = 'transparent';
  o.drawImage(base, X, Y);
  footer(o, P);
  return canvasToFile(out, `gosko-${data.slug || 'karta'}.png`);
}

export const videoSupported = () => typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];   // radšej H.264 (mp4), ktoré prehrá aj Instagram

/* Karta v perspektíve: stĺpec po stĺpci sa zmenšuje podľa vzdialenosti od kamery. */
function drawTurned(o, card, cx, cy, ang, shadow) {
  const Wc = card.width, Hc = card.height, f = Wc * 3.4, cs = Math.cos(ang), sn = Math.sin(ang);
  const proj = u => { const Z = u * sn, s = f / (f - Z); return [cx + u * cs * s, s]; };
  if (shadow) {
    const r = 22 * Wc / 340, [lx, ls] = proj(-Wc / 2 + r), [rx, rs] = proj(Wc / 2 - r), hh = Hc / 2 - r;   // tieň o kúsok vnútri, aby nevytŕčal za zaoblenými rohmi
    o.beginPath(); o.moveTo(lx, cy - hh * ls); o.lineTo(rx, cy - hh * rs); o.lineTo(rx, cy + hh * rs); o.lineTo(lx, cy + hh * ls); o.closePath();
    o.fillStyle = '#17161a'; o.shadowColor = 'rgba(226,181,60,.45)'; o.shadowBlur = 70; o.fill();
    o.shadowColor = 'rgba(0,0,0,.85)'; o.shadowBlur = 100; o.shadowOffsetY = 50; o.fill(); o.shadowColor = 'transparent'; o.shadowOffsetY = 0;
  }
  const step = 3;
  for (let sx = 0; sx < Wc; sx += step) {
    const w = Math.min(step, Wc - sx), [x0, s0] = proj(sx - Wc / 2), [x1, s1] = proj(sx + w - Wc / 2), s = (s0 + s1) / 2, dh = Hc * s;
    o.drawImage(card, sx, 0, w, Hc, x0, cy - dh / 2, x1 - x0 + .7, dh);
  }
}

/* Video: karta sa asi 6 sekúnd pomaly otáča sem a tam, fólia sa pritom leskne. Nahráva sa naživo, preto to trvá, kým video je. */
export async function riderVideo(data, { seconds = 6, onProgress } = {}) {
  if (!videoSupported()) throw new Error('video-unsupported');
  const P = await prepareCard(data);
  const SC = .75, VW = Math.round(STORY_W * SC), VH = Math.round(STORY_H * SC);
  const cardW = Math.round(CARD_W * SC), base = cardBase(P, cardW), CH = base.height, bx = base.getContext('2d');
  const work = mk(cardW, CH), wx = work.getContext('2d');
  const bg = mk(VW, VH); bg.getContext('2d').drawImage(aura(P), 0, 0, VW, VH);
  const fo = mk(VW, VH), fx = fo.getContext('2d'); fx.scale(SC, SC); footer(fx, P);
  const out = mk(VW, VH), o = out.getContext('2d');
  const type = VIDEO_TYPES.find(t => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('video-unsupported');
  const stream = out.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 7e6 }), parts = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
  const done = new Promise((res, rej) => { rec.onstop = res; rec.onerror = e => rej(e.error || new Error('video-failed')); });
  const frame = t => {
    const ph = t / seconds * Math.PI * 2, ang = Math.sin(ph) * 30 * Math.PI / 180, px = Math.sin(ph), py = Math.cos(ph * 2) * .25;
    wx.clearRect(0, 0, cardW, CH); wx.drawImage(base, 0, 0);
    finish(wx, cardW, CH, .5 + px * .5, .5 + py * .5, px, py);
    o.drawImage(bg, 0, 0);
    drawTurned(o, work, VW / 2, 330 * SC + CH / 2, ang, true);
    o.drawImage(fo, 0, 0);
  };
  frame(0);
  rec.start(250);
  await new Promise(res => {
    const t0 = performance.now();
    const tick = now => {
      const t = (now - t0) / 1000;
      if (t >= seconds) { frame(seconds); res(); return; }
      frame(t); onProgress?.(t / seconds); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise(r => setTimeout(r, 120));
  rec.stop(); await done; stream.getTracks().forEach(t => t.stop());
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  return new File([new Blob(parts, { type: type.split(';')[0] })], `gosko-${data.slug || 'karta'}.${ext}`, { type: type.split(';')[0] });
}

export function canvasToFile(canvas, name) {
  return new Promise(res => canvas.toBlob(b => res(new File([b], name, { type: 'image/png' })), 'image/png'));
}
