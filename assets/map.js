import { loadScript, loadCss } from './qr.js';

const LEAFLET = 'assets/vendor/leaflet-1.9.4/';   // uložené na webe, pozri assets/vendor/SOURCES.txt
export const SK_CENTER = [48.67, 19.7];

export async function loadLeaflet() {
  await Promise.all([loadCss(LEAFLET + 'leaflet.css'), loadScript(LEAFLET + 'leaflet.js')]);
  return window.L;
}

function pinIcon(L, kind = 'spot') {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="pin pin-${kind}" aria-hidden="true"></span>`,
    iconSize: [30, 40], iconAnchor: [15, 38], popupAnchor: [0, -34],
  });
}

function baseMap(L, el, opts = {}) {
  const map = L.map(el, { scrollWheelZoom: false, tap: true, ...opts }).setView(SK_CENTER, 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

/* points: [{ lat, lng, kind: 'spot'|'event', popup: HTMLElement }] */
export async function mountMap(el, points) {
  const L = await loadLeaflet();
  if (!el.isConnected) return () => {};
  const inner = document.createElement('div'); inner.className = 'map-inner'; el.replaceChildren(inner);
  const map = baseMap(L, inner);
  const markers = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map(p =>
    L.marker([p.lat, p.lng], { icon: pinIcon(L, p.kind), title: p.title || '' }).addTo(map).bindPopup(p.popup));
  if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(.3), { maxZoom: 13 });
  setTimeout(() => map.invalidateSize(), 60);
  return () => map.remove();
}

/* Výber presného bodu: ťuk na mapu alebo potiahnutie pinu. onChange({lat,lng}) */
export async function mountPicker(el, onChange) {
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
