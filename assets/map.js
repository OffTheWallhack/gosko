import { loadScript, loadCss } from './qr.js';

const LEAFLET = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
export const SK_CENTER = [48.67, 19.7];

export async function loadLeaflet() {
  await Promise.all([loadCss(LEAFLET + 'leaflet.css'), loadScript(LEAFLET + 'leaflet.js')]);
  return window.L;
}

function pinIcon(L, kind = 'spot') {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="pin pin-${kind}" aria-hidden="true"></span>`,
    iconSize: [34, 44], iconAnchor: [17, 42], popupAnchor: [0, -38],
  });
}

function baseMap(L, el, opts = {}) {
  const map = L.map(el, { scrollWheelZoom: false, tap: true, ...opts }).setView(SK_CENTER, 7);
  // tmavá mapa v farbách webu, nech piny (červený park, zlaté GOSko, krémový spot) vyskočia
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  }).addTo(map);
  return map;
}

/* points: [{ lat, lng, kind: 'spot'|'event', popup: HTMLElement }] */
export async function mountMap(el, points) {
  const L = await loadLeaflet();
  if (!el.isConnected) return () => {};
  const inner = document.createElement('div'); inner.className = 'map-inner'; el.replaceChildren(inner);
  // koliesko myši približuje (na mobile sa mapa približuje dvoma prstami ako doteraz)
  const map = baseMap(L, inner, { scrollWheelZoom: true });
  const markers = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map(p => {
    const m = L.marker([p.lat, p.lng], { icon: pinIcon(L, p.kind), title: p.title || '', riseOnHover: true }).bindPopup(p.popup);
    if (p.label) m.bindTooltip(p.label, { permanent: true, direction: 'right', offset: [12, -22], className: 'pin-label' });
    return m;
  });
  // názvy pri pinoch sa ukážu od priblíženia, aby sa v Bratislave neprekrývali
  const labels = () => inner.classList.toggle('no-labels', map.getZoom() < 9);
  /* blízke piny (napr. tri parky v Bratislave) sa pri odzoomovaní zlúčia do jedného s číslom; ťuk ho priblíži */
  const layer = L.layerGroup().addTo(map);
  const clusterIcon = n => L.divIcon({ className: 'pin-wrap', html: `<span class="pin-cluster">${n}</span>`, iconSize: [38, 38], iconAnchor: [19, 19] });
  const render = () => {
    layer.clearLayers(); labels();
    const z = map.getZoom(), cells = [];
    for (const m of markers) {
      const pt = map.project(m.getLatLng(), z), c = cells.find(c => Math.hypot(c.x - pt.x, c.y - pt.y) < 34);
      if (c) c.items.push(m); else cells.push({ x: pt.x, y: pt.y, items: [m] });
    }
    for (const c of cells) {
      if (c.items.length === 1) { c.items[0].addTo(layer); continue; }
      const ll = L.featureGroup(c.items).getBounds();
      L.marker(ll.getCenter(), { icon: clusterIcon(c.items.length), title: `${c.items.length} spoty, priblíž` }).addTo(layer).on('click', () => map.fitBounds(ll.pad(.5), { maxZoom: 16 }));
    }
  };
  map.on('zoomend', render);
  if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(.12), { maxZoom: 13 });
  render();
  setTimeout(() => map.invalidateSize(), 60);
  const stop = () => map.remove();
  /* karta skateparku: ukáž ho na mape (priblíž a otvor popup) */
  stop.focus = (lat, lng) => {
    map.flyTo([lat, lng], 15, { duration: .8 });
    const m = markers.find(x => { const ll = x.getLatLng(); return Math.abs(ll.lat - lat) < 1e-6 && Math.abs(ll.lng - lng) < 1e-6; });
    if (m) map.once('moveend', () => setTimeout(() => { render(); m.openPopup(); }, 60));
  };
  return stop;
}

/* Výber presného bodu: ťuk na mapu alebo potiahnutie pinu. onChange({lat,lng}) */
export async function mountPicker(el, onChange, initial) {
  const L = await loadLeaflet();
  const map = baseMap(L, el, { scrollWheelZoom: true });
  let marker = null;
  const set = (lat, lng, zoom) => {
    const ll = [+lat.toFixed(6), +lng.toFixed(6)];
    if (!marker) { marker = L.marker(ll, { icon: pinIcon(L), draggable: true }).addTo(map); marker.on('dragend', () => { const p = marker.getLatLng(); onChange({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); }); }
    else marker.setLatLng(ll);
    if (zoom) map.setView(ll, zoom);
    onChange({ lat: ll[0], lng: ll[1] });
  };
  map.on('click', e => set(e.latlng.lat, e.latlng.lng));
  /* úprava existujúceho spotu: pin je hneď na jeho mieste */
  if (initial && Number.isFinite(initial.lat) && Number.isFinite(initial.lng)) set(initial.lat, initial.lng, 15);
  setTimeout(() => map.invalidateSize(), 80);
  return {
    locate() {
      return new Promise((res, rej) => {
        if (!navigator.geolocation) return rej(new Error('Tvoj prehliadač nevie zistiť polohu.'));
        navigator.geolocation.getCurrentPosition(p => { set(p.coords.latitude, p.coords.longitude, 17); res(); },
          () => rej(new Error('Polohu sa nepodarilo zistiť. Ťukni na mapu a pin polož ručne.')), { enableHighAccuracy: true, timeout: 12000 });
      });
    },
    destroy() { map.remove(); },
  };
}

export const navLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
