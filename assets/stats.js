/* RD stats: verejný live counter návštevnosti.
   Vlož na stránku:  <script src="https://durica.si/stats.js" defer></script>
   Každý návštevník vidí v rohu malý odznak "● N online" (počíta sa zvlášť pre každú stránku).
   Po kliknutí na odznak sa rozbalí: dnes / týždeň / mesiac. */
(function () {
  var URL_ = "https://znsrokpaoczljisaoulu.supabase.co";
  var KEY = "sb_publishable_9bRi6q6rnTTr5_Rszk5IiQ_MBBoti45";
  var PING_MS = 30000;

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

  var pill = null, dot = null, label = null, open = false, last = null;

  function build() {
    var css = document.createElement("style");
    css.textContent =
      "@keyframes rdpulse{0%,100%{opacity:1}50%{opacity:.35}}" +
      "#rd-stats{position:fixed;left:10px;bottom:10px;z-index:2147483647;" +
      "font:12px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;" +
      "background:rgba(10,14,30,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);" +
      "padding:7px 11px;border-radius:999px;cursor:pointer;user-select:none;" +
      "border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;gap:7px;" +
      "-webkit-tap-highlight-color:transparent}" +
      "#rd-stats i{width:7px;height:7px;border-radius:50%;background:#3ddc84;flex:none;" +
      "animation:rdpulse 2s ease-in-out infinite}" +
      "@media (prefers-reduced-motion:reduce){#rd-stats i{animation:none}}";
    document.head.appendChild(css);

    pill = document.createElement("div");
    pill.id = "rd-stats";
    pill.setAttribute("role", "button");
    pill.setAttribute("tabindex", "0");
    pill.setAttribute("aria-label", "Počet ľudí online na tejto stránke");
    dot = document.createElement("i");
    label = document.createElement("span");
    pill.appendChild(dot);
    pill.appendChild(label);
    function toggle() { open = !open; paint(); }
    pill.addEventListener("click", toggle);
    pill.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    document.body.appendChild(pill);
  }

  function paint() {
    if (!last || !pill) return;
    label.textContent = open
      ? last.online + " online · dnes " + last.today + " · týždeň " + last.week + " · mesiac " + last.month
      : last.online + " online";
  }

  function render(d) {
    if (!d || typeof d.online !== "number") return;
    last = d;
    if (!pill) build();
    paint();
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
