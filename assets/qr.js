/* QR kódy: vykreslenie vstupenky a skenovanie kamerou na evente. */
const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) loaded.set(src, new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('Nepodarilo sa načítať ' + src));
    document.head.append(s);
  }));
  return loaded.get(src);
}
export function loadCss(href) {
  if (!loaded.has(href)) loaded.set(href, new Promise(res => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; l.onerror = res; document.head.append(l);
  }));
  return loaded.get(href);
}

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const SCAN_LIB = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

export async function qrCanvas(text, size = 560) {
  await loadScript(QR_LIB);
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), quiet = 4, cell = Math.floor(size / (n + quiet * 2));
  const c = document.createElement('canvas'); c.width = c.height = cell * (n + quiet * 2);
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#111';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) x.fillRect((col + quiet) * cell, (r + quiet) * cell, cell, cell);
  return c;
}

/* Spustí kameru vo <video> a volá onCode(text) pri každom nájdenom QR. Vráti stop(). */
export async function startScanner(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true; await video.play();
  let detector = null;
  if ('BarcodeDetector' in window) {
    try { const f = await window.BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch {}
  }
  if (!detector) await loadScript(SCAN_LIB);
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  let alive = true, last = '', lastAt = 0;
  async function tick() {
    if (!alive) return;
    if (video.readyState >= 2) {
      let text = null;
      if (detector) { try { const r = await detector.detect(video); text = r[0]?.rawValue || null; } catch {} }
      else {
        const w = video.videoWidth, h = video.videoHeight, s = Math.min(1, 720 / Math.max(w, h));
        cv.width = Math.round(w * s); cv.height = Math.round(h * s);
        ctx.drawImage(video, 0, 0, cv.width, cv.height);
        const img = ctx.getImageData(0, 0, cv.width, cv.height);
        text = window.jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' })?.data || null;
      }
      const now = performance.now();
      if (text && (text !== last || now - lastAt > 4000)) { last = text; lastAt = now; onCode(text); }
    }
    setTimeout(() => requestAnimationFrame(tick), 150);
  }
  tick();
  return () => { alive = false; stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
}
