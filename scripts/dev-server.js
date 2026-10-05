#!/usr/bin/env node
// Lokálny dev server pre GOSko bez závislostí (iba node:*).
//
// Cieľ: lokálne sa web správa ako na Verceli.
//  - statika z koreňa projektu, hlavičky sa berú z `headers` vo vercel.json (rovnaké pravidlá ako v produkcii),
//  - súbory z .vercelignore sa neservírujú (v produkcii tam nie sú),
//  - /api/* sa routuje na súbory v api/ ako súborový routing Vercelu (vrátane [id], [...slug]),
//  - handlery dostanú Vercel-like req (query, body, cookies) a res (status, json, send, redirect),
//  - premenné z .env.local sa načítajú do process.env (existujúce sa neprepíšu).
//
// Spustenie: node scripts/dev-server.js   (PORT, HOST sa dajú zmeniť cez prostredie; default 127.0.0.1:3000)
//
//  - `rewrites` z vercel.json ako na Verceli: až keď pre cestu neexistuje súbor (skutočné adresy webu, napr. /eventy -> /index.html).
//
// Obmedzenia: pravidlá `headers`/`rewrites` s `has`/`missing` sa ignorujú, `redirects`/`cleanUrls` sa
// nepodporujú (GOSko ich nepoužíva). Handler sa pri zmene súboru načíta znova,
// ale pomocné moduly, ktoré importuje (napr. api/_lib/*), sa znova nenačítajú: po ich zmene server reštartuj.

import http from 'node:http';
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- hlavičky z vercel.json

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Prevedie `source` z vercel.json (podmnožina path-to-regexp) na RegExp. */
export function sourceToRegExp(source) {
  const n = source.length;
  let out = '';
  let i = 0;
  const groupEnd = start => {
    let depth = 0;
    for (let j = start; j < n; j++) {
      const c = source[j];
      if (c === '\\') { j++; continue; }
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) return j + 1;
    }
    throw new Error(`Nevyvážená zátvorka v source: ${source}`);
  };
  while (i < n) {
    const c = source[i];
    if (c === '\\') { out += escapeRe(source[i + 1] ?? ''); i += 2; continue; }
    let piece = null;
    if (c === '(') {
      const end = groupEnd(i);
      piece = source.slice(i, end);
      i = end;
    } else if (c === ':' && /[A-Za-z_]/.test(source[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && /\w/.test(source[j])) j++;
      i = j;
      if (source[i] === '(') { const end = groupEnd(i); piece = source.slice(i, end); i = end; }
      else piece = '([^/]+)';
    }
    if (piece === null) { out += escapeRe(c); i++; continue; }
    const mod = source[i];
    if (mod === '*' || mod === '+' || mod === '?') {
      i++;
      // `/:name*` v path-to-regexp znamená opakovanie segmentov spolu s lomkou pred nimi
      if (out.endsWith('/')) out = out.slice(0, -1) + `(?:/${piece})${mod}`;
      else out += piece + mod;
    } else out += piece;
  }
  return new RegExp(`^${out}$`);
}

/** Hlavičky, ktoré pre `pathname` určujú pravidlá `headers`. Neskoršie pravidlo prepíše skoršie. Vracia [[kľúč, hodnota], ...]. */
export function matchHeaders(config, pathname) {
  const merged = new Map();
  for (const rule of config?.headers ?? []) {
    if (rule.has?.length || rule.missing?.length) continue;
    if (!sourceToRegExp(rule.source).test(pathname)) continue;
    for (const { key, value } of rule.headers ?? []) merged.set(key.toLowerCase(), [key, value]);
  }
  return [...merged.values()];
}

/** Cieľ prvého pravidla `rewrites`, ktoré sedí na `pathname` (bez `has`/`missing`), inak null. */
export function matchRewrite(config, pathname) {
  for (const rule of config?.rewrites ?? []) {
    if (rule.has?.length || rule.missing?.length) continue;
    if (sourceToRegExp(rule.source).test(pathname)) return rule.destination;
  }
  return null;
}

// ---------------------------------------------------------------- .vercelignore

// Vstavané ochrany: Vercel CLI tieto súbory nenahráva nikdy, .env* navyše nechceme servírovať ani lokálne.
const BUILTIN_IGNORE = ['.git/', '.vercel/', 'node_modules/', '.DS_Store', '.gitignore', '.env*'].join('\n');

function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') { out += '(?:.*/)?'; i += 2; }
        else { out += '.*'; i += 1; }
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else out += escapeRe(c);
  }
  return new RegExp(`^${out}$`);
}

/** Matcher so syntaxou .gitignore (komentáre, `/kotva`, `dir/`, `*`, `**`, `!negácia`). Vracia (relPath, isDir) => bool. */
export function createIgnore(text = '') {
  const rules = [];
  for (let line of String(text).split(/\r?\n/)) {
    line = line.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    let negate = false;
    if (line.startsWith('!')) { negate = true; line = line.slice(1); }
    else if (line.startsWith('\\#') || line.startsWith('\\!')) line = line.slice(1);
    let dirOnly = false;
    if (line.endsWith('/')) { dirOnly = true; line = line.slice(0, -1); }
    if (!line) continue;
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    rules.push({ negate, dirOnly, anchored, re: globToRegExp(line) });
  }
  const verdict = (rel, isDir) => {
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    let ignored = false;
    for (const r of rules) {
      if (r.dirOnly && !isDir) continue;
      if (r.re.test(r.anchored ? rel : base)) ignored = !r.negate;
    }
    return ignored;
  };
  return (relPath, isDir = false) => {
    const parts = String(relPath).split('/').filter(Boolean);
    for (let k = 0; k < parts.length; k++) {
      // ak je ignorovaný niektorý nadradený priečinok, je ignorované všetko pod ním
      if (verdict(parts.slice(0, k + 1).join('/'), k < parts.length - 1 || isDir)) return true;
    }
    return false;
  };
}

// ---------------------------------------------------------------- .env

/** Jednoduchý parser .env: KEY=VALUE, `export`, úvodzovky, komentáre. */
export function parseEnv(text) {
  const env = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const q = value[0];
    if (q === '"' || q === "'") {
      let end = -1;
      for (let i = 1; i < value.length; i++) {
        if (q === '"' && value[i] === '\\') { i++; continue; }
        if (value[i] === q) { end = i; break; }
      }
      value = end === -1 ? value.slice(1) : value.slice(1, end);
      if (q === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    env[key] = value;
  }
  return env;
}

/** Načíta súbor do `env`, existujúce premenné neprepíše. Vracia zoznam nastavených kľúčov. */
export function loadEnvFile(file, env = process.env) {
  if (!existsSync(file)) return [];
  const loaded = [];
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (!(k in env)) { env[k] = v; loaded.push(k); }
  }
  return loaded;
}

// ---------------------------------------------------------------- routovanie /api

const FN_EXT = new Set(['.js', '.mjs', '.cjs']);
const RE_DYN = /^\[([A-Za-z_]\w*)\]$/;
const RE_CATCH = /^\[\.\.\.([A-Za-z_]\w*)\]$/;
const RE_OPTCATCH = /^\[\[\.\.\.([A-Za-z_]\w*)\]\]$/;

async function walk(dir, segs, params) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }
  const files = new Map();
  const dirs = new Map();
  for (const e of entries) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue; // _lib a pod. nie sú routy
    if (e.isDirectory()) dirs.set(e.name, join(dir, e.name));
    else if (e.isFile() && FN_EXT.has(extname(e.name))) files.set(e.name.slice(0, -extname(e.name).length), join(dir, e.name));
  }
  const optional = () => {
    for (const [name, file] of files) { const m = RE_OPTCATCH.exec(name); if (m) return { file, params: { ...params, [m[1]]: segs } }; }
    return null;
  };
  if (segs.length === 0) return files.has('index') ? { file: files.get('index'), params } : optional();

  const [head, ...rest] = segs;
  // 1. presná zhoda (statický segment má prednosť pred dynamickým)
  if (rest.length === 0 && files.has(head)) return { file: files.get(head), params };
  if (dirs.has(head)) { const r = await walk(dirs.get(head), rest, params); if (r) return r; }
  // 2. [id]
  for (const [name, d] of dirs) {
    const m = RE_DYN.exec(name);
    if (m) { const r = await walk(d, rest, { ...params, [m[1]]: head }); if (r) return r; }
  }
  if (rest.length === 0) {
    for (const [name, file] of files) { const m = RE_DYN.exec(name); if (m) return { file, params: { ...params, [m[1]]: head } }; }
  }
  // 3. [...slug] (aspoň jeden segment), 4. [[...slug]] (aj žiadny)
  for (const [name, file] of files) { const m = RE_CATCH.exec(name); if (m) return { file, params: { ...params, [m[1]]: segs } }; }
  return optional();
}

/** Nájde súbor funkcie pre `pathname` (napr. /api/nft/metadata/7). Vracia { file, params } alebo null. */
export async function resolveApiRoute(root, pathname) {
  let segs;
  try { segs = pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { return null; }
  if (segs[0] !== 'api' || segs.some(s => s === '.' || s === '..' || s.includes('\0'))) return null;
  return walk(join(root, 'api'), segs.slice(1), {});
}

// ---------------------------------------------------------------- Vercel-like req/res

const BODY_LIMIT = 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(new HttpError(413, 'Telo požiadavky je väčšie ako 1 MB')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseBody(buffer, contentTypeHeader) {
  const [type, ...params] = String(contentTypeHeader || 'text/plain').split(';').map(s => s.trim());
  const charset = params.map(p => /^charset=(.+)$/i.exec(p)?.[1]).find(Boolean)?.replace(/"/g, '').toLowerCase();
  const encoding = Buffer.isEncoding(charset ?? '') ? charset : 'utf8';
  const text = buffer.toString(encoding);
  switch (type.toLowerCase()) {
    case 'application/json':
    case 'application/ld+json':
      if (!text.trim()) return {};
      try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
    case 'application/x-www-form-urlencoded': {
      const out = Object.create(null);
      for (const [k, v] of new URLSearchParams(text)) out[k] = k in out ? [].concat(out[k], v) : v;
      return out;
    }
    case 'text/plain':
      return text;
    default:
      return buffer;
  }
}

function parseQuery(search, params) {
  const query = Object.create(null);
  for (const [k, v] of new URLSearchParams(search)) query[k] = k in query ? [].concat(query[k], v) : v;
  return Object.assign(query, params); // parametre cesty majú prednosť pred query
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    if (key && !(key in out)) { try { out[key] = decodeURIComponent(part.slice(eq + 1).trim()); } catch { out[key] = part.slice(eq + 1).trim(); } }
  }
  return out;
}

function decorateResponse(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.send = body => {
    if (body === undefined || body === null) { res.end(); return res; }
    if (Buffer.isBuffer(body)) {
      if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', body.length);
      res.end(body);
    } else if (typeof body === 'object') {
      res.json(body);
    } else {
      const text = String(body);
      if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(text));
      res.end(text);
    }
    return res;
  };
  res.json = body => {
    const text = JSON.stringify(body);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(text ?? ''));
    res.end(text);
    return res;
  };
  res.redirect = (a, b) => {
    const [status, url] = typeof a === 'string' ? [307, a] : [a ?? 307, b];
    res.statusCode = status;
    res.setHeader('Location', url);
    res.end();
    return res;
  };
}

// ---------------------------------------------------------------- statika

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.xml': 'application/xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
};

const textResponse = (res, status, text) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.end(text);
};

// ---------------------------------------------------------------- server

/**
 * @param {{ root?: string, log?: (line: string) => void, loadEnv?: boolean }} [opts]
 * @returns {{ server: http.Server, root: string, envLoaded: string[], listen(port?: number, host?: string): Promise<{port:number, host:string, url:string}>, close(): Promise<void> }}
 */
export function createDevServer({ root = resolve(import.meta.dirname, '..'), log = console.log, loadEnv = true } = {}) {
  root = resolve(root);
  const envLoaded = loadEnv ? loadEnvFile(join(root, '.env.local')) : [];

  // vercel.json a .vercelignore sa čítajú pri každej zmene súboru, takže ich úpravy netreba reštartovať
  const cached = (file, parse) => {
    let key = null, value = null;
    return () => {
      let k = 'none';
      try { const s = statSync(file); k = `${s.mtimeMs}:${s.size}`; } catch { /* súbor neexistuje */ }
      if (k !== key) {
        key = k;
        try { value = k === 'none' ? parse(null) : parse(readFileSync(file, 'utf8')); }
        catch (e) { log(`CHYBA pri čítaní ${file}: ${e.message}`); value = parse(null); }
      }
      return value;
    };
  };
  const getConfig = cached(join(root, 'vercel.json'), text => (text === null ? null : JSON.parse(text)));
  const getIgnore = cached(join(root, '.vercelignore'), text => createIgnore(`${BUILTIN_IGNORE}\n${text ?? ''}`));

  const modules = new Map();
  async function loadHandler(file) {
    const s = await stat(file);
    const key = `${s.mtimeMs}-${s.size}`;
    let entry = modules.get(file);
    if (!entry || entry.key !== key) {
      entry = { key, mod: await import(`${pathToFileURL(file).href}?v=${key}`) };
      modules.set(file, entry);
    }
    const fn = entry.mod.default;
    if (typeof fn !== 'function') throw new Error(`${file}: chýba export default funkcia (req, res)`);
    return fn;
  }

  async function serveStatic(req, res, pathname, rewritten = false) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return textResponse(res, 405, 'METHOD_NOT_ALLOWED');
    }
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return textResponse(res, 400, 'BAD_REQUEST'); }
    if (decoded.includes('\0')) return textResponse(res, 400, 'BAD_REQUEST');

    const trailingSlash = decoded.endsWith('/');
    // posix.normalize nikdy nevyjde nad koreň: '/../x' sa zmení na '/x'
    let rel = posix.normalize(`/${decoded}`).replace(/^\/+/, '').replace(/\/+$/, '');
    const ignores = getIgnore();
    // zdrojáky funkcií a package.json Vercel ako statiku nepodáva
    const notStatic = r => r === 'package.json' || r === 'api' || r.startsWith('api/');
    if (notStatic(rel) || ignores(rel, trailingSlash)) return textResponse(res, 404, 'NOT_FOUND');

    let file = join(root, rel);
    let st = await stat(file).catch(() => null);
    if (st?.isDirectory()) {
      rel = rel ? `${rel}/index.html` : 'index.html';
      if (ignores(rel)) return textResponse(res, 404, 'NOT_FOUND');
      file = join(root, rel);
      st = await stat(file).catch(() => null);
    } else if (trailingSlash) st = null; // /subor.txt/ nie je súbor
    if (!st?.isFile()) {
      // rewrites sa uplatnia, až keď súbor neexistuje (filesystem má na Verceli prednosť)
      const dest = rewritten ? null : matchRewrite(getConfig(), pathname);
      if (dest && !dest.startsWith('/api')) return serveStatic(req, res, dest, true);
      return textResponse(res, 404, 'NOT_FOUND');
    }

    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', st.mtime.toUTCString());
    if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
    res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', st.size);
    res.statusCode = 200;
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }

  async function serveApi(req, res, pathname, search, route) {
    let fn;
    try { fn = await loadHandler(route.file); }
    catch (e) {
      log(`CHYBA pri načítaní ${route.file}:\n${e.stack ?? e}`);
      return textResponse(res, 500, 'A server error has occurred\n\nFUNCTION_INVOCATION_FAILED');
    }
    try {
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      req.query = parseQuery(search, route.params);
      req.cookies = parseCookies(req.headers.cookie);
      req.body = hasBody ? parseBody(await readBody(req), req.headers['content-type']) : undefined;
      decorateResponse(res);
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) {
        if (!res.headersSent) return textResponse(res, e.status, e.message);
        return res.end();
      }
      log(`CHYBA vo funkcii ${pathname}:\n${e?.stack ?? e}`);
      if (!res.headersSent) return textResponse(res, 500, 'A server error has occurred\n\nFUNCTION_INVOCATION_FAILED');
      res.end();
    }
  }

  async function handle(req, res) {
    const target = req.url ?? '/';
    if (!target.startsWith('/')) return textResponse(res, 400, 'BAD_REQUEST');
    const q = target.indexOf('?');
    const pathname = q === -1 ? target : target.slice(0, q);
    const search = q === -1 ? '' : target.slice(q + 1);

    // hlavičky z vercel.json idú na každú odpoveď (aj 404 a /api); handler ich môže prepísať
    for (const [key, value] of matchHeaders(getConfig(), pathname)) res.setHeader(key, value);

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const route = await resolveApiRoute(root, pathname);
      if (!route) return textResponse(res, 404, 'NOT_FOUND');
      return serveApi(req, res, pathname, search, route);
    }
    return serveStatic(req, res, pathname);
  }

  const server = http.createServer((req, res) => {
    const started = Date.now();
    res.on('finish', () => log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started} ms`));
    handle(req, res).catch(e => {
      log(`CHYBA ${req.method} ${req.url}:\n${e?.stack ?? e}`);
      if (!res.headersSent) textResponse(res, 500, 'INTERNAL_ERROR');
      else res.end();
    });
  });

  return {
    server,
    root,
    envLoaded,
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((ok, fail) => {
        server.once('error', fail);
        server.listen(port, host, () => {
          server.off('error', fail);
          const addr = server.address();
          ok({ port: addr.port, host, url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${addr.port}` });
        });
      });
    },
    close() {
      return new Promise(done => { server.close(() => done()); server.closeAllConnections?.(); });
    },
  };
}

// ---------------------------------------------------------------- CLI

async function main() {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  const dev = createDevServer();
  try {
    const { url } = await dev.listen(port, host);
    console.log(`GOSko dev server: ${url}`);
  } catch (e) {
    if (e.code === 'EADDRINUSE') console.error(`Port ${port} je obsadený. Spusti s iným: PORT=3001 node scripts/dev-server.js`);
    else console.error(e);
    process.exit(1);
  }
  if (existsSync(join(dev.root, '.env.local'))) console.log(`.env.local: načítaných ${dev.envLoaded.length} nových premenných`);
  else console.log('.env.local nie je, API beží bez tajomstiev (vytvor ho z .env.example)');
  console.log('Ctrl+C ukončí server.');
  const stop = () => dev.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
