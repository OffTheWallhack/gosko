import { renderBoardImage, loadLogo } from './board.js';

const FONT = '"Archivo", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const W = 1080, H = 1920;

function stretch(ctx, v) { if ('fontStretch' in ctx) ctx.fontStretch = v; }
function fit(ctx, text, weight, maxW, size) {
  for (; size > 10; size -= 2) { ctx.font = `${weight} ${size}px ${FONT}`; if (ctx.measureText(text).width <= maxW) break; }
  return size;
}
function grain(ctx, x, y, w, h, alpha, light) {
  const n = Math.round(w * h / 90);
  for (let i = 0; i < n; i++) {
    const g = light ? 200 + Math.random() * 55 : Math.random() * 40;
    ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * alpha})`;
    ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 2, 2);
  }
}
function tornBand(ctx, y, h, color, seed) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, y);
  let r = seed;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let x = 0; x <= W; x += 30) ctx.lineTo(x, y + rnd() * 16);
  for (let x = W; x >= 0; x -= 30) ctx.lineTo(x, y + h - rnd() * 16);
  ctx.closePath(); ctx.fill();
}

/* rider: { name, points, ranks: ['1. v rebríčku Open'], lines: ['GOSko Bratislava: 1. miesto'], badges: [{name}] , stickers } */
export async function riderCard(rider) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, W, H);
  grain(x, 0, 0, W, H, .5, true);

  // hlavička
  tornBand(x, 70, 230, '#A01414', 7);
  grain(x, 70, 70, W, 230, .35, false);
  const logo = await loadLogo();
  const lh = 250, lw = lh * logo.width / logo.height;
  x.drawImage(logo, 60, 40, lw, lh);
  x.fillStyle = '#F3EBDD'; x.textBaseline = 'middle'; stretch(x, 'expanded');
  fit(x, 'GAME OF S.K.A.T.E.', 900, W - lw - 120, 64); x.fillText('GAME OF S.K.A.T.E.', 90 + lw, 150);
  stretch(x, 'condensed'); x.font = `600 44px ${FONT}`; x.fillText(`SEZÓNA ${rider.season}`, 90 + lw, 222);

  // doska
  const board = await renderBoardImage(rider.stickers, { width: 900, height: 1060 });
  x.drawImage(board, (W - 900) / 2, 300);

  // meno
  x.save(); x.translate(70, 1440); x.transform(1, 0, -.1, 1, 0, 0);
  stretch(x, 'expanded'); const name = rider.name.toLocaleUpperCase('sk');
  const s = fit(x, name, 900, W - 140, 128);
  x.fillStyle = '#A01414'; x.fillText(name, 6, 6);
  x.fillStyle = '#F3EBDD'; x.fillText(name, 0, 0);
  x.restore();

  // body a poradie
  let y = 1440 + s * .55 + 50;
  stretch(x, 'condensed'); x.fillStyle = '#F3EBDD'; x.textBaseline = 'alphabetic';
  x.font = `700 58px ${FONT}`; x.fillText(`${rider.points} BODOV`, 70, y);
  x.font = `500 40px ${FONT}`; x.fillStyle = '#B8AEA0';
  for (const line of [...rider.ranks, ...rider.lines].slice(0, 3)) { y += 54; x.fillText(line, 70, y); }

  // odznaky
  y += 40; let bx = 70;
  stretch(x, 'normal'); x.font = `800 34px ${FONT}`;
  for (const b of rider.badges.slice(0, 6)) {
    const w = x.measureText(b.name).width + 48;
    if (bx + w > W - 70) { bx = 70; y += 70; }
    x.fillStyle = '#F3EBDD'; x.beginPath(); x.roundRect ? x.roundRect(bx, y, w, 56, 28) : x.rect(bx, y, w, 56); x.fill();
    x.fillStyle = '#A01414'; x.textBaseline = 'middle'; x.fillText(b.name, bx + 24, y + 29);
    bx += w + 14;
  }

  // päta
  tornBand(x, H - 150, 150, '#F3EBDD', 3);
  x.fillStyle = '#A01414'; x.textBaseline = 'middle'; stretch(x, 'expanded');
  fit(x, '@G.O.S.KO', 900, W - 140, 64); x.fillText('@G.O.S.KO', 70, H - 72);
  return c;
}

export function canvasToFile(canvas, name) {
  return new Promise(res => canvas.toBlob(b => res(new File([b], name, { type: 'image/png' })), 'image/png'));
}
