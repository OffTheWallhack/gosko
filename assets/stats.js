/* RD stats: verejný live counter návštevnosti.
   Vlož na stránku:  <script src="stats.js" defer></script>
   Každý návštevník vidí v rohu malý odznak "● N online · M tento mesiac".
   Číslo "tento mesiac" (unikátni ľudia od 1. v mesiaci) sa pri načítaní pripočítava
   po jednom ako kilometrovník a keď príde nový návštevník, cvakne o jedno vyššie.
   Počíta sa zvlášť pre každú stránku. Klik na odznak ukáže aj dnes a týždeň. */
(function () {
  var URL_ = "https://znsrokpaoczljisaoulu.supabase.co";
  var KEY = "sb_publishable_9bRi6q6rnTTr5_Rszk5IiQ_MBBoti45";
  var PING_MS = 30000;
  var H = 1.15; // výška jednej číslice v em

  // kľúč stránky: doména + cesta (bez index.html a koncového lomítka)
  var path = location.pathname.replace(/index\.html$/, "").replace(/\/+$/, "");
  var PAGE = ((location.hostname || "local") + (path || "/")).slice(0, 60);

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }

  var vid = ls("rd_vid");
  if (!vid) {
    vid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    ls("rd_vid", vid);
  }

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var pill = null, onlineEl = null, odo = null, moreEl = null;
  var open = false, cols = [];
  var shown = 0, target = 0, timer = null, ready = false, bumpT = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function makeCol() {
    var d = el("span", "rd-d");
    var b = el("b");
    for (var k = 0; k < 10; k++) b.appendChild(el("span", "", String(k)));
    d.appendChild(b);
    return d;
  }

  function build() {
    var css = document.createElement("style");
    css.textContent =
      "@keyframes rdpulse{0%,100%{opacity:1}50%{opacity:.35}}" +
      "#rd-stats{position:fixed;left:10px;bottom:10px;z-index:2147483647;max-width:calc(100vw - 20px);" +
      "font:12px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;" +
      "background:rgba(10,14,30,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);" +
      "padding:7px 11px;border-radius:999px;cursor:pointer;user-select:none;" +
      "border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;gap:6px;" +
      "white-space:nowrap;overflow:hidden;-webkit-tap-highlight-color:transparent}" +
      "#rd-stats i{width:7px;height:7px;border-radius:50%;background:#3ddc84;flex:none;" +
      "animation:rdpulse 2s ease-in-out infinite}" +
      "#rd-stats .rd-sep{opacity:.4}" +
      "#rd-stats .rd-odo{display:inline-flex;height:" + H + "em;overflow:hidden;font-weight:600;" +
      "font-variant-numeric:tabular-nums;transition:color .3s}" +
      "#rd-stats .rd-d{display:block;width:.62em;height:" + H + "em;overflow:hidden;text-align:center}" +
      "#rd-stats .rd-d.z{opacity:.35}" +
      "#rd-stats .rd-d b{display:block;font-weight:inherit;transition:transform .16s ease-out}" +
      "#rd-stats .rd-d b span{display:block;height:" + H + "em;line-height:" + H + "em}" +
      "#rd-stats.rd-bump .rd-odo{color:#ffd93d}" +
      "#rd-stats .rd-more{display:none}" +
      "#rd-stats.rd-open .rd-more{display:inline}" +
      "@media (prefers-reduced-motion:reduce){#rd-stats i{animation:none}#rd-stats .rd-d b{transition:none}}";
    document.head.appendChild(css);

    pill = el("div");
    pill.id = "rd-stats";
    pill.setAttribute("role", "button");
    pill.setAttribute("tabindex", "0");
    onlineEl = el("span");
    odo = el("span", "rd-odo");
    moreEl = el("span", "rd-more");
    pill.appendChild(el("i"));
    pill.appendChild(onlineEl);
    pill.appendChild(el("span", "rd-sep", "\u00b7"));
    pill.appendChild(odo);
    pill.appendChild(el("span", "", "tento mesiac"));
    pill.appendChild(moreEl);

    function toggle() { open = !open; pill.classList.toggle("rd-open", open); }
    pill.addEventListener("click", toggle);
    pill.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    document.body.appendChild(pill);
  }

  // nastaví číslice kilometrovníka; stĺpce pribúdajú zľava, nikdy neubúdajú
  function setDigits(n, len) {
    var s = String(n);
    while (cols.length < len) {
      var c = makeCol();
      odo.insertBefore(c, odo.firstChild);
      cols.unshift(c);
    }
    var total = cols.length, lead = total - s.length;
    while (s.length < total) s = "0" + s;
    for (var i = 0; i < total; i++) {
      cols[i].firstChild.style.transform = "translateY(-" + (Number(s.charAt(i)) * H) + "em)";
      cols[i].className = "rd-d" + (i < lead ? " z" : "");
    }
  }

  function bump() {
    pill.classList.add("rd-bump");
    clearTimeout(bumpT);
    bumpT = setTimeout(function () { pill.classList.remove("rd-bump"); }, 900);
  }

  function step() {
    if (shown >= target) {
      clearInterval(timer);
      timer = null;
      ready = true;
      return;
    }
    shown = Math.min(target, shown + Math.max(1, Math.ceil((target - shown) / 10)));
    setDigits(shown, String(target).length);
  }

  function tickTo(t) {
    var grew = ready && t > target;
    target = t;
    if (reduce || t < shown) {
      shown = t;
      ready = true;
      setDigits(shown, String(t).length);
      return;
    }
    if (grew) bump();
    if (!timer) timer = setInterval(step, 30);
  }

  function render(d) {
    if (!d || typeof d.online !== "number" || typeof d.month !== "number") return;
    if (!pill) {
      build();
      setDigits(0, String(d.month).length);
    }
    onlineEl.textContent = d.online + " online";
    moreEl.textContent = " \u00b7 dnes " + d.today + " \u00b7 t\u00fd\u017ede\u0148 " + d.week;
    pill.setAttribute(
      "aria-label",
      d.online + " online, tento mesiac " + d.month + " n\u00e1v\u0161tev\u006e\u00edkov, dnes " + d.today + ", za t\u00fd\u017ede\u0148 " + d.week
    );
    tickTo(d.month);
  }

  function ping() {
    if (document.hidden) return;
    fetch(URL_ + "/rest/v1/rpc/stats_ping", {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: "Bearer " + KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_site: PAGE, p_vid: vid })
    })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () {});
  }

  function start() {
    ping();
    setInterval(ping, PING_MS);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) ping();
    });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
