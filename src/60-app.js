/* ================= iCalPad: the worksheet interface =================
   The page is free-form: every region has an x, y position and can sit anywhere.
   Regions are calculated in reading order (top to bottom, then left to right).
   On a narrow screen the same regions are shown as one column, in that order. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = Core.escH;
const IC = {
  side: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  set: '<path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8"/><path d="M12 17h.01"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>', pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  pen: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
  erase: '<path d="M8 20h11"/><path d="M5.6 14.4 13.9 6a2 2 0 0 1 2.8 0l2.3 2.3a2 2 0 0 1 0 2.8L10.8 19.3a2 2 0 0 1-1.4.6H8.2a2 2 0 0 1-1.4-.6l-1.2-1.2a2.6 2.6 0 0 1 0-3.7z"/><path d="M9.6 10.4l5 5"/>', arrow: '<path d="M5 19 19 5M10 5h9v9"/>', label: '<path d="M5 6h14M12 6v13M9 19h6"/>',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const LS = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
/* The worksheet itself (which may hold pictures) is kept in IndexedDB, with localStorage as a fallback. */
const DB = {
  db: null,
  open() { return new Promise(res => { try { const r = indexedDB.open('icalpad', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { DB.db = r.result; res(true); }; r.onerror = () => res(false); } catch (e) { res(false); } }); },
  get(k) { return new Promise(res => { if (!DB.db) return res(null); try { const r = DB.db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (e) { res(null); } }); },
  set(k, v) { if (!DB.db) return false; try { DB.db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); return true; } catch (e) { return false; } },
};
let seq = 0;
const nid = () => 'r' + Date.now().toString(36).slice(-5) + (seq++).toString(36);
const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const narrow = () => window.matchMedia('(max-width: 860px)').matches;
const framed = !!(window.claude && window.claude.use);
const snap = v => Math.round(v / 8) * 8;

const S = { doc: null, active: null, cursor: null, results: new Map(), vars: [], set: { sig: 4, system: 'auto', theme: 'auto' }, hist: [], hpos: -1, dirty: false };
let FREE = !narrow();
const rgsEl = $('#rgs'), els = new Map(), plots = new Map();
const crossEl = el('<div class="cross" hidden></div>'), blankEl = el('<div class="blank" hidden>Click anywhere and start typing. Drop a picture to add it.</div>');
const docFrom = (script, title) => ({ v: 2, title: title || '', by: '', date: today(), sheet: '1', auto: true, images: {}, regions: fromScript(script).map((r, i) => ({ id: nid(), x: 26, y: 14 + i * 50, ...r })) });
const region = id => S.doc.regions.find(r => r.id === id);
const indexOfRegion = id => S.doc.regions.findIndex(r => r.id === id);

// ---------- small UI helpers ----------
let toastT = 0;
function toast(msg) {
  $$('.toast').forEach(t => t.remove());
  const t = el(`<div class="toast" role="status">${esc(msg)}</div>`); document.body.append(t);
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3400);
}
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; $$('[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false')); } }
/* items: {label, note, kbd, sel, act} | '-' | {hd} | {html} */
function openMenu(anchor, items, wire) {
  const reopen = menuEl && menuEl._for === anchor; closeMenu(); if (reopen) return null;
  items = items.filter((it, i, a) => it !== '-' || (i > 0 && i < a.length - 1 && a[i - 1] !== '-'));
  const acts = [];
  const html = items.map(it => it === '-' ? '<hr>' : it.hd ? `<div class="hd">${esc(it.hd)}</div>` : it.html ? it.html
    : `<button class="mi${it.sel ? ' sel' : ''}" role="menuitem" data-i="${acts.push(it.act) - 1}"><span>${esc(it.label)}${it.note ? `<small>${esc(it.note)}</small>` : ''}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ''}</button>`).join('');
  menuEl = el(`<div class="menu" role="menu">${html}</div>`); menuEl._for = anchor; document.body.append(menuEl);
  menuEl.addEventListener('click', e => { const b = e.target.closest('.mi'); if (b) { const f = acts[+b.dataset.i]; closeMenu(); if (f) f(); } });
  if (wire) wire(menuEl);
  const r = anchor.getBoundingClientRect(), mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  menuEl.style.left = Math.max(8, Math.min(r.left, innerWidth - mw - 8)) + 'px';
  menuEl.style.top = (r.bottom + 4 + mh > innerHeight - 8 && r.top - mh - 4 > 8 ? r.top - mh - 4 : Math.min(r.bottom + 4, Math.max(8, innerHeight - mh - 8))) + 'px';
  if (anchor.hasAttribute('aria-haspopup')) anchor.setAttribute('aria-expanded', 'true');
  return menuEl;
}
document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target) && !(menuEl._for && menuEl._for.contains(e.target))) closeMenu(); }, true);
function dialog({ title, body, buttons = [], small }) {
  const d = el(`<div class="scrim"><div class="dlg${small ? ' sm' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="btn icon" data-x aria-label="Close">${ic('x')}</button></header><div class="dbody">${body}</div>${buttons.length ? `<div class="dfoot">${buttons.map((b, i) => `<button class="btn ${b.kind || 'line'}" data-b="${i}">${esc(b.label)}</button>`).join('')}</div>` : ''}</div></div>`);
  const close = () => { d.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) close(); const b = e.target.closest('[data-b]'); if (b) { close(); const f = buttons[+b.dataset.b].act; if (f) f(); } });
  document.addEventListener('keydown', onKey, true); document.body.append(d);
  (d.querySelector('.dfoot .solid') || d.querySelector('[data-x]')).focus();
  return d;
}
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

// ---------- history, storage ----------
let cmT = 0, svT = 0, warned = false;
const snapshot = () => JSON.stringify({ ...S.doc, images: undefined });
function persist() { if (!DB.set('doc', S.doc) && !LS.set('icalpad.doc', S.doc) && !warned) { warned = true; toast('This worksheet is too large to keep in the browser. Use File, then Save as a file.'); } }
function commit() {
  clearTimeout(cmT); const s = snapshot();
  if (S.hist[S.hpos] === s) return;
  S.hist = S.hist.slice(0, S.hpos + 1); S.hist.push(s); if (S.hist.length > 120) S.hist.shift();
  S.hpos = S.hist.length - 1; syncUndo();
}
const commitSoon = () => { clearTimeout(cmT); cmT = setTimeout(commit, 800); };
function touch() { S.dirty = true; commitSoon(); clearTimeout(svT); svT = setTimeout(persist, 500); }
function syncUndo() { for (const id of ['#b-undo', '#b-undo2']) $(id).disabled = S.hpos <= 0; $('#b-redo').disabled = S.hpos >= S.hist.length - 1; }
function restore(i) { S.hpos = i; S.doc = { ...JSON.parse(S.hist[i]), images: S.doc.images }; S.active = null; renderAll(); persist(); syncUndo(); }
function undo() { commit(); if (S.hpos > 0) restore(S.hpos - 1); }
function redo() { if (S.hpos < S.hist.length - 1) restore(S.hpos + 1); }
function loadDoc(doc, fresh) {
  S.doc = doc; S.active = null; S.cursor = null; S.dirty = false;
  if (fresh) { S.hist = []; S.hpos = -1; }
  renderAll(); commit(); persist(); $('#desk').scrollTo(0, 0);
}
const IMG_OK = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
function cleanDoc(d) {                      // accept only the fields a worksheet has
  if (!d || !Array.isArray(d.regions)) throw new Error('not a worksheet');
  const str = (v, n = 20000) => String(v == null ? '' : v).slice(0, n), num = (v, lo, hi, def) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : def;
  const images = {}, keys = new Map(); let auto = !!d.auto;
  const regions = d.regions.slice(0, 2000).map((r, i) => {
    r = r || {}; if (!Number.isFinite(+r.x) || !Number.isFinite(+r.y)) auto = true;
    const base = { id: nid(), x: num(r.x, 0, 20000, 26), y: num(r.y, 0, 200000, 14 + i * 50) }; if (r.side) base.side = true;
    if (r.type === 'plot') return { ...base, type: 'plot', exprs: str(r.exprs, 2000), xvar: str(r.xvar, 40) || 'x', x0: str(r.x0, 200), x1: str(r.x1, 200), anim: ['param', 'trace'].includes(r.anim) ? r.anim : 'none', pvar: str(r.pvar, 40) || 't', p0: str(r.p0, 200), p1: str(r.p1, 200), dur: num(r.dur, 0.5, 120, 4), w: num(r.w, 240, 1600, 520), h: num(r.h, 140, 1200, 240) };
    if (r.type === 'image') {
      let key = '';
      const src = r.img && d.images && d.images[r.img];
      if (typeof src === 'string' && src.length < 12e6 && IMG_OK.test(src)) { key = keys.get(r.img) || 'i' + nid(); keys.set(r.img, key); images[key] = src; }
      const ann = (Array.isArray(r.ann) ? r.ann : []).slice(0, 400).map(a => a && a.t === 'text' ? { t: 'text', c: num(a.c, 0, 4, 0) | 0, x: num(a.x, -200, 1200, 0), y: num(a.y, -200, 5000, 0), s: str(a.s, 120) }
        : a && (a.t === 'pen' || a.t === 'arrow') && Array.isArray(a.p) ? { t: a.t, c: num(a.c, 0, 4, 0) | 0, p: a.p.slice(0, a.t === 'arrow' ? 4 : 4000).map(v => Math.round(num(v, -500, 6000, 0))) } : null).filter(Boolean);
      return { ...base, type: 'image', img: key, w: num(r.w, 60, 1600, 360), ar: num(r.ar, 0.05, 8, 0.62), ann };
    }
    if (r.type === 'text') return { ...base, type: 'text', src: str(r.src), w: num(r.w, 120, 1600, 640) };
    return { ...base, type: 'math', src: str(r.src) };
  });
  return { v: 2, title: str(d.title, 200), by: str(d.by, 80), date: str(d.date, 80), sheet: str(d.sheet, 20), auto, images, regions };
}

// ---------- geometry: where things are ----------
function place(e, rg) {
  const st = e.style;
  if (FREE) {
    st.left = rg.x + 'px'; st.top = rg.y + 'px';
    st.width = rg.type === 'math' ? '' : rg.w + 18 + 'px'; st.maxWidth = '';
  } else { st.left = st.top = ''; st.width = ''; st.maxWidth = rg.type === 'image' ? rg.w + 28 + 'px' : ''; }
  if (rg.type === 'plot') e.querySelector('canvas').style.height = FREE ? rg.h + 'px' : '';
  if (rg.type === 'image') e.querySelector('.fig').style.aspectRatio = String(1 / rg.ar);
}
function sortRegions() {                    // reading order: rows from the top, each row left to right
  const a = S.doc.regions.slice().sort((p, q) => p.y - q.y || p.x - q.x), out = [];
  for (let i = 0; i < a.length;) { let j = i + 1; while (j < a.length && a[j].y - a[i].y < 18) j++; out.push(...a.slice(i, j).sort((p, q) => p.x - q.x || p.y - q.y)); i = j; }
  S.doc.regions = out;
  if (!FREE) for (const r of out) { const e = els.get(r.id); if (e && e !== els.get(S.active)) rgsEl.append(e); }
  if (!FREE && S.active && els.get(S.active)) { const i = indexOfRegion(S.active), nx = out[i + 1] && els.get(out[i + 1].id); if (nx) nx.before(els.get(S.active)); }
}
function fitCanvas() {
  blankEl.hidden = S.doc.regions.length > 0;
  if (!FREE) { rgsEl.style.height = ''; $('#sheet').style.width = ''; return; }
  let b = 0, r = 0;
  for (const rg of S.doc.regions) { const e = els.get(rg.id); if (e) { b = Math.max(b, rg.y + e.offsetHeight); r = Math.max(r, rg.x + e.offsetWidth); } }
  rgsEl.style.height = Math.max(520, b + 340) + 'px'; $('#sheet').style.width = r + 48 > 900 ? r + 48 + 'px' : '';
}
function autoLayout() {                     // stack an untouched worksheet neatly from its script order
  if (!FREE) return;
  let y = 14, rowBottom = 14, prev = null;
  for (const rg of S.doc.regions) {
    const e = els.get(rg.id), head = rg.type === 'text' && rg.src[0] === '#';
    if (rg.side && prev) { rg.x = snap(prev.x + els.get(prev.id).offsetWidth + 34); rg.y = prev.y; }
    else { y = rowBottom + (prev ? (head ? 16 : rg.type === 'plot' || rg.type === 'image' ? 10 : 4) : 0); rg.x = 26; rg.y = Math.round(y); }
    place(e, rg); rowBottom = rg.side ? Math.max(rowBottom, rg.y + e.offsetHeight) : rg.y + e.offsetHeight; prev = rg;
  }
  sortRegions(); fitCanvas();
}
function makeRoom(x, y, h, skip) {          // push lower regions down when a new one would land on top of them
  const hit = S.doc.regions.some(r => { const e = els.get(r.id); return r.id !== skip && e && r.y >= y - 6 && r.y < y + h && r.x < x + 280 && r.x + e.offsetWidth > x; });
  if (!hit) return;
  for (const r of S.doc.regions) if (r.id !== skip && r.y >= y - 6) { r.y += h + 8; place(els.get(r.id), r); }
}
function setCursor(p) {
  S.cursor = p; crossEl.hidden = !p || !FREE;
  if (p) { crossEl.style.left = p.x + 'px'; crossEl.style.top = p.y + 14 + 'px'; }
}
const canvasPt = ev => { const r = rgsEl.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
function spot() {                           // where the next new region goes
  if (FREE && S.cursor) return { x: S.cursor.x, y: S.cursor.y, room: false };
  const a = region(S.active);
  if (a) return { x: a.x, y: a.y + els.get(a.id).offsetHeight + 8, room: true };
  let b = 14; for (const r of S.doc.regions) { const e = els.get(r.id); if (e) b = Math.max(b, r.y + e.offsetHeight + 8); }
  return { x: 26, y: b, room: false };
}
/* Drag to move or resize. A press without movement counts as a click. */
let skipClick = 0;
function startDrag(ev, rg, mode, onClick) {
  const e = els.get(rg.id), sx = ev.clientX, sy = ev.clientY, o = { x: rg.x, y: rg.y, w: rg.w, h: rg.h }; let moved = false;
  const onMove = m => {
    const dx = m.clientX - sx, dy = m.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; e.classList.add('drag'); closeMenu(); setCursor(null); }
    const sn = m.altKey ? Math.round : snap;
    if (mode === 'move') { rg.x = Math.max(0, sn(o.x + dx)); rg.y = Math.max(0, sn(o.y + dy)); }
    else if (rg.type === 'text') rg.w = Math.max(120, sn(o.w + dx));
    else if (rg.type === 'plot') { rg.w = Math.max(240, sn(o.w + dx)); rg.h = Math.max(140, sn(o.h + dy)); }
    else rg.w = Math.max(60, sn(o.w + Math.max(dx, dy / rg.ar)));
    place(e, rg); const P = plots.get(rg.id); if (P && mode !== 'move') draw(P);
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
    skipClick = Date.now(); e.classList.remove('drag');
    if (moved) { S.doc.auto = false; sortRegions(); fitCanvas(); touch(); recalc(); commit(); } else if (onClick) onClick();
  };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
}
/* Wire a region's body so a mouse press drags it and a plain click runs onClick. */
function grab(target, rg, onClick, guard) {
  target.addEventListener('pointerdown', ev => { if (!FREE || ev.pointerType === 'touch' || ev.button !== 0 || (guard && !guard(ev))) return; ev.preventDefault(); startDrag(ev, rg, 'move', () => onClick(ev)); });
  target.addEventListener('click', ev => { if (Date.now() - skipClick < 350 || (guard && !guard(ev))) return; onClick(ev); });
}

// ---------- building regions ----------
const KEYS = [[':=', ':='], ['=', '='], ['→', ' ->'], ['^', '^'], ['√', 'sqrt(|)'], ['π', 'pi'], ['( )', '(|)'], ['x₁', '_'], ['∫', 'int(|, x)'], ['d/dx', 'diff(|, x)'], ['Σ', 'sum(|, k, 1, n)'], ['[ ]', '[|, ; , ]']];
const WORDS = [['solve', 'solve(| = 0, x)'], ['simplify', ' -> simplify'], ['expand', ' -> expand'], ['factor', ' -> factor']];
const UNIT_KEYS = { SI: ['m', 'mm', 'kg', 's', 'N', 'kN', 'MPa'], US: ['ft', 'in', 'lb', 's', 'lbf', 'kip', 'psi'] };
const keysEl = el('<div class="keys" role="toolbar" aria-label="Math symbols"></div>');
function fillKeys() {
  keysEl.innerHTML = KEYS.map(([l, v]) => `<button class="key" type="button" data-v="${esc(v)}" tabindex="-1">${esc(l)}</button>`).join('')
    + WORDS.map(([l, v]) => `<button class="key w" type="button" data-v="${esc(v)}" tabindex="-1">${esc(l)}</button>`).join('')
    + UNIT_KEYS[Core.C.sysNow === 'US' ? 'US' : 'SI'].map(u => `<button class="key w" type="button" data-v=" ${u}" tabindex="-1">${u}</button>`).join('');
}
keysEl.addEventListener('pointerdown', e => e.preventDefault());       // keep the caret in the input
keysEl.addEventListener('click', e => {
  const b = e.target.closest('.key'), inp = keysEl.parentElement && keysEl.parentElement.querySelector('.src'); if (!b || !inp) return;
  const v = b.dataset.v, at = v.indexOf('|'), ins = v.replace('|', ''), p = inp.selectionStart;
  inp.setRangeText(ins, p, inp.selectionEnd, 'end');
  if (at >= 0) inp.setSelectionRange(p + at, p + at);
  inp.focus(); inp.dispatchEvent(new Event('input', { bubbles: true }));
});
const hdlHtml = `<button class="hdl" type="button" aria-label="Move this, or open its menu" title="Drag to move. Click for options.">${ic('grip')}</button>`;
function wireHandle(e, rg) {
  const h = e.querySelector('.hdl');
  h.addEventListener('pointerdown', ev => { if (!FREE || ev.button > 0) return; ev.preventDefault(); startDrag(ev, rg, 'move', () => regionMenu(rg, h)); });
  h.addEventListener('click', () => { if (Date.now() - skipClick < 350) return; regionMenu(rg, h); });
  const z = e.querySelector('.rz');
  if (z) z.addEventListener('pointerdown', ev => { if (!FREE) return; ev.preventDefault(); ev.stopPropagation(); startDrag(ev, rg, 'size'); });
}
function dropEmpty(rg) { const i = indexOfRegion(rg.id); removeRegion(rg.id); const nb = S.doc.regions[Math.max(0, i - 1)]; if (nb && (nb.type === 'math' || nb.type === 'text')) setActive(nb.id, true); }

function buildMath(rg) {
  const e = el(`<section class="rg math" data-id="${rg.id}">${hdlHtml}<div class="body"><div class="view"></div><div class="edit"><input class="src" id="in-${rg.id}" type="text" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Math line" placeholder="Type math, for example  A := pi*r^2 ="></div><div class="msg" hidden></div></div></section>`);
  const inp = e.querySelector('.src'); inp.value = rg.src || ''; let auto = -1;
  inp.addEventListener('focus', () => setActive(rg.id, false));
  inp.addEventListener('input', ev => {
    if (ev.inputType === 'insertText') {    // typing : gives := in one keystroke
      const p = inp.selectionStart;
      if (ev.data === ':' && inp.value[p] !== '=') { inp.setRangeText(':=', p - 1, p, 'end'); auto = p + 1; }
      else { if (ev.data === '=' && auto === p - 1 && inp.value.slice(p - 3, p) === ':==') inp.setRangeText('', p - 1, p, 'end'); auto = -1; }
    }
    rg.src = inp.value; touch(); recalcSoon();
  });
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); addRegion('math', { below: rg.id }); }
    else if (ev.key === 'Backspace' && !inp.value) { ev.preventDefault(); dropEmpty(rg); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); step(rg.id, -1); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); step(rg.id, 1); }
    else if (ev.key === 'Escape') { inp.blur(); setActive(null); }
  });
  grab(e.querySelector('.view'), rg, ev => { const r = ev.target.closest && ev.target.closest('.res'); if (r && r.dataset.u) { setActive(rg.id, false); unitMenu(rg, r); return; } setActive(rg.id, true); });
  return e;
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(40, ta.scrollHeight + 2) + 'px'; }
function buildText(rg) {
  const e = el(`<section class="rg text" data-id="${rg.id}">${hdlHtml}<div class="body"><div class="view"></div><div class="edit"><textarea class="tsrc" id="in-${rg.id}" rows="1" aria-label="Note" placeholder="Write a note. Start with # for a heading. Put math between $ signs."></textarea></div></div><span class="rz w" title="Drag to change the width"></span></section>`);
  const ta = e.querySelector('.tsrc'), view = e.querySelector('.view'); ta.value = rg.src || '';
  const paintText = () => { view.innerHTML = rg.src.trim() ? Core.mdToHtml(rg.src) : '<p class="ph">Empty note</p>'; };
  e._paint = paintText; paintText();
  ta.addEventListener('focus', () => { setActive(rg.id, false); autosize(ta); });
  ta.addEventListener('input', () => { rg.src = ta.value; autosize(ta); touch(); outlineSoon(); });
  ta.addEventListener('blur', paintText);
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ta.blur(); setActive(null); }
    else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey || (/^#{1,3}\s/.test(ta.value) && !ta.value.includes('\n')))) { ev.preventDefault(); addRegion('math', { below: rg.id }); }
    else if (ev.key === 'Backspace' && !ta.value) { ev.preventDefault(); dropEmpty(rg); }
  });
  grab(view, rg, () => setActive(rg.id, true));
  return e;
}
function buildPlot(rg) {
  const f = (cls, key, label, extra = '') => `<label class="${cls}">${label}<input data-k="${key}" id="in-${rg.id}-${key}" type="text" spellcheck="false" autocapitalize="off" autocomplete="off" ${extra}></label>`;
  const e = el(`<section class="rg plot" data-id="${rg.id}">${hdlHtml}<div class="body">
    <div class="pwrap"><canvas aria-label="Plot"></canvas><div class="tip" hidden></div></div>
    <div class="pbar"><div class="legend"></div><div class="anim" hidden><button class="btn line icon play" type="button" aria-label="Play"></button><input type="range" min="0" max="1000" value="0" aria-label="Position" id="in-${rg.id}-scrub"><output></output></div></div>
    <div class="edit pform">
      ${f('wide', 'exprs', 'Plot (separate several with ;)')}${f('tiny', 'xvar', 'against')}${f('nar', 'x0', 'from')}${f('nar', 'x1', 'to')}
      <label>Motion<select data-k="anim" id="in-${rg.id}-anim"><option value="none">None</option><option value="param">Sweep a value</option><option value="trace">Trace the curve</option></select></label>
      <span class="pp" style="display:contents">${f('tiny', 'pvar', 'value')}${f('nar', 'p0', 'from')}${f('nar', 'p1', 'to')}</span>
      <label class="tiny dd">seconds<input data-k="dur" id="in-${rg.id}-dur" type="number" min="0.5" max="120" step="0.5"></label>
    </div><div class="msg" hidden></div></div><span class="rz" title="Drag to resize"></span></section>`);
  const P = { rg, el: e, cv: e.querySelector('canvas'), tip: e.querySelector('.tip'), data: null, frac: rg.anim === 'trace' ? 1 : rg.anim === 'param' ? 0.4 : 0, playing: false, range: null, hover: null, hold: 0 };
  P.ctx = P.cv.getContext('2d'); plots.set(rg.id, P);
  const sync = () => { e.querySelector('.pp').style.display = rg.anim === 'param' ? 'contents' : 'none'; e.querySelector('.dd').style.display = rg.anim === 'none' ? 'none' : ''; };
  for (const c of $$('[data-k]', e)) {
    c.value = rg[c.dataset.k] == null ? '' : rg[c.dataset.k];
    c.addEventListener('focus', () => setActive(rg.id, false));
    c.addEventListener('input', () => {
      rg[c.dataset.k] = c.dataset.k === 'dur' ? Math.min(120, Math.max(0.5, +c.value || 4)) : c.value;
      if (c.dataset.k === 'anim') { P.playing = false; P.frac = rg.anim === 'trace' ? 1 : rg.anim === 'param' ? 0.4 : 0; sync(); }
      touch(); recalcSoon();
    });
    c.addEventListener('keydown', ev => { if (ev.key === 'Escape') { c.blur(); setActive(null); } });
  }
  sync();
  e.querySelector('.play').addEventListener('click', () => play(P, !P.playing));
  e.querySelector('input[type=range]').addEventListener('input', ev => { P.playing = false; P.frac = +ev.target.value / 1000; draw(P); syncAnim(P); });
  grab(P.cv, rg, () => setActive(rg.id, false));
  P.cv.addEventListener('pointermove', ev => { if (!e.classList.contains('drag')) hover(P, ev); });
  P.cv.addEventListener('pointerleave', () => { P.hover = null; P.tip.hidden = true; draw(P); });
  return e;
}

// ---------- pictures, sketches and marking them up ----------
const ACOL = ['var(--a0)', 'var(--a1)', 'var(--ink)', 'var(--a3)', 'var(--a4)'], ANAME = ['Red', 'Blue', 'Ink', 'Amber', 'Green'];
function annHtml(list) {
  let h = '';
  for (const a of list) {
    const c = ACOL[a.c] || ACOL[0];
    if (a.t === 'pen') { let pts = ''; for (let i = 0; i + 1 < a.p.length; i += 2) pts += a.p[i] + ',' + a.p[i + 1] + ' '; h += a.p.length === 2 ? `<circle cx="${a.p[0]}" cy="${a.p[1]}" r="5" style="fill:${c}"/>` : `<polyline points="${pts}" fill="none" style="stroke:${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`; }
    else if (a.t === 'arrow') {
      const [x1, y1, x2, y2] = a.p, ang = Math.atan2(y2 - y1, x2 - x1), L = Math.min(40, Math.hypot(x2 - x1, y2 - y1) * 0.6), w = 0.45;
      const bx = x2 - L * 0.8 * Math.cos(ang), by = y2 - L * 0.8 * Math.sin(ang), p = k => `${(x2 - L * Math.cos(ang + k)).toFixed(1)},${(y2 - L * Math.sin(ang + k)).toFixed(1)}`;
      h += `<line x1="${x1}" y1="${y1}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" style="stroke:${c}" stroke-width="7" stroke-linecap="round"/><polygon points="${x2},${y2} ${p(w)} ${p(-w)}" style="fill:${c}"/>`;
    } else if (a.t === 'text') h += `<text x="${a.x}" y="${a.y}" style="fill:${c}" font-size="46" font-weight="500" font-family="Barlow, 'Segoe UI', system-ui, sans-serif">${esc(a.s)}</text>`;
  }
  return h;
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}
function annHit(a, x, y, r) {                // does the eraser at (x, y) with radius r touch this mark?
  if (a.t === 'pen') {
    if (a.p.length === 2) return Math.hypot(a.p[0] - x, a.p[1] - y) < r + 5;
    for (let i = 0; i + 3 < a.p.length; i += 2) if (segDist(x, y, a.p[i], a.p[i + 1], a.p[i + 2], a.p[i + 3]) < r + 4) return true;
    return false;
  }
  if (a.t === 'arrow') return segDist(x, y, a.p[0], a.p[1], a.p[2], a.p[3]) < r + 5;
  const w = a.s.length * 25;
  return x > a.x - r && x < a.x + w + r && y > a.y - 42 - r && y < a.y + 10 + r;
}
function buildImage(rg) {
  const src = rg.img && S.doc.images[rg.img];
  const e = el(`<section class="rg image" data-id="${rg.id}">${hdlHtml}<div class="body"><div class="fig${src ? '' : ' sk'}">${src ? `<img alt="Picture on the worksheet" draggable="false">` : ''}<svg preserveAspectRatio="none" aria-hidden="true"></svg></div>
    <div class="edit itools" role="toolbar" aria-label="Drawing tools">
      ${[['move', 'Move'], ['pen', 'Pen'], ['arrow', 'Arrow'], ['label', 'Label'], ['erase', 'Eraser']].map(([k, l]) => `<button class="btn line tl" type="button" data-tool="${k}" aria-pressed="false">${ic(k)}${l}</button>`).join('')}
      <span class="cols">${ACOL.map((c, i) => `<button class="col" type="button" data-col="${i}" aria-label="${ANAME[i]}" title="${ANAME[i]}" style="--sw:${c}"></button>`).join('')}</span>
      <button class="btn line" type="button" data-do="undo">Undo mark</button><button class="btn line" type="button" data-do="clear">Clear marks</button>
    </div></div><span class="rz" title="Drag to resize"></span></section>`);
  if (src) e.querySelector('img').src = src;
  const fig = e.querySelector('.fig'), svg = fig.querySelector('svg'); let tool = 'move', col = src ? 0 : 2, live = null, ring = null;
  const marks = [];                         // this picture's own undo list: {add} or {erased: [[index, mark], ...]}
  const H = () => Math.round(1000 * rg.ar);
  const paint = () => {
    svg.setAttribute('viewBox', `0 0 1000 ${H()}`);
    svg.innerHTML = annHtml(live ? [...rg.ann, live] : rg.ann) + (ring ? `<circle cx="${ring.x}" cy="${ring.y}" r="${ring.r.toFixed(1)}" fill="none" style="stroke:var(--ink2)" stroke-width="3" stroke-dasharray="7 6"/>` : '');
  };
  /* Which tool a press uses: the eraser end of a stylus always erases, and a pen on a selected picture draws. */
  const toolFor = ev => (ev.buttons & 32) ? 'erase' : tool === 'move' && ev.pointerType === 'pen' && S.active === rg.id ? 'pen' : tool;
  const syncTools = () => { for (const b of $$('[data-tool]', e)) b.setAttribute('aria-pressed', b.dataset.tool === tool); for (const b of $$('[data-col]', e)) b.classList.toggle('on', +b.dataset.col === col); fig.classList.toggle('tool', tool !== 'move'); };
  e._setTool = t => { tool = t; syncTools(); }; e._paint = paint; paint(); syncTools();
  const pt = ev => { const r = svg.getBoundingClientRect(); return [Math.round((ev.clientX - r.left) / r.width * 1000), Math.round((ev.clientY - r.top) / r.height * H())]; };
  e.querySelector('.itools').addEventListener('click', ev => {
    const t = ev.target.closest('[data-tool]'), c = ev.target.closest('[data-col]'), d = ev.target.closest('[data-do]');
    if (t) { tool = t.dataset.tool; syncTools(); }
    if (c) { col = +c.dataset.col; if (tool === 'move') tool = 'pen'; syncTools(); }
    if (d) {
      if (d.dataset.do === 'clear') { if (rg.ann.length) marks.push({ erased: rg.ann.map((a, i) => [i, a]) }); rg.ann = []; }
      else { const h = marks.pop(); if (h && h.erased) { for (const [i, a] of h.erased) rg.ann.splice(i, 0, a); } else rg.ann.pop(); }
      paint(); touch(); commit();
    }
  });
  e._clear = () => { if (rg.ann.length) { marks.push({ erased: rg.ann.map((a, i) => [i, a]) }); rg.ann = []; paint(); touch(); commit(); } };
  fig.addEventListener('pointerdown', ev => {
    const use = toolFor(ev);
    if (use === 'move' || ev.button > 0) return;
    if (ev.pointerType === 'touch' && S.penSeen) return;              // palm rejection: once a stylus is used, fingers do not draw
    ev.preventDefault(); ev.stopPropagation(); setActive(rg.id, false);
    const [x, y] = pt(ev);
    try { fig.setPointerCapture(ev.pointerId); } catch (err) { /* older browsers */ }
    if (use === 'erase') {
      const erased = [], r = 14 * 1000 / Math.max(1, svg.getBoundingClientRect().width);
      const rub = m => {
        const [a, b] = pt(m); ring = { x: a, y: b, r };
        for (let i = rg.ann.length - 1; i >= 0; i--) if (annHit(rg.ann[i], a, b, r)) erased.push([i, rg.ann.splice(i, 1)[0]]);
        paint();
      };
      const up = () => { fig.removeEventListener('pointermove', rub); fig.removeEventListener('pointerup', up); fig.removeEventListener('pointercancel', up); ring = null; paint(); if (erased.length) { marks.push({ erased: erased.sort((p, q) => p[0] - q[0]) }); touch(); commit(); } };
      rub(ev); fig.addEventListener('pointermove', rub); fig.addEventListener('pointerup', up); fig.addEventListener('pointercancel', up);
      return;
    }
    if (use === 'label') {
      const r = fig.getBoundingClientRect(), inp = el('<input class="lbl" type="text" aria-label="Label text" placeholder="Label">');
      inp.style.left = ev.clientX - r.left + 'px'; inp.style.top = ev.clientY - r.top - 14 + 'px'; fig.append(inp); setTimeout(() => inp.focus(), 0);
      let done = false; const fin = keep => { if (done) return; done = true; const s = inp.value.trim(); inp.remove(); if (keep && s) { rg.ann.push({ t: 'text', c: col, x, y: y + 16, s: s.slice(0, 120) }); paint(); touch(); commit(); } };
      inp.addEventListener('keydown', k => { k.stopPropagation(); if (k.key === 'Enter') fin(true); else if (k.key === 'Escape') fin(false); });
      inp.addEventListener('blur', () => fin(true)); inp.addEventListener('pointerdown', k => k.stopPropagation());
      return;
    }
    live = use === 'pen' ? { t: 'pen', c: col, p: [x, y] } : { t: 'arrow', c: col, p: [x, y, x, y] }; paint();
    const gap = ev.pointerType === 'pen' ? 2 : 4;   // a stylus sends many more points, so keep finer detail
    const mv = m => {
      if (live.t === 'pen') {
        const evs = m.getCoalescedEvents ? m.getCoalescedEvents() : [];
        for (const q of evs.length ? evs : [m]) { const [a, b] = pt(q), n = live.p.length; if (Math.hypot(a - live.p[n - 2], b - live.p[n - 1]) > gap && n < 6000) live.p.push(a, b); }
      } else { const [a, b] = pt(m); live.p[2] = a; live.p[3] = b; }
      paint();
    };
    const up = () => { fig.removeEventListener('pointermove', mv); fig.removeEventListener('pointerup', up); fig.removeEventListener('pointercancel', up); if (live && (live.t === 'pen' || Math.hypot(live.p[2] - live.p[0], live.p[3] - live.p[1]) > 12)) { rg.ann.push(live); marks.push({ add: true }); } live = null; paint(); touch(); commit(); };
    fig.addEventListener('pointermove', mv); fig.addEventListener('pointerup', up); fig.addEventListener('pointercancel', up);
  });
  grab(fig, rg, () => setActive(rg.id, false), ev => toolFor(ev) === 'move');
  return e;
}
function readImage(file) {                  // -> {src, w, h}; large photos are scaled down so worksheets stay small
  return new Promise((res, rej) => {
    if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) return rej(new Error('type'));
    const fr = new FileReader(); fr.onerror = () => rej(new Error('read'));
    fr.onload = () => {
      const im = new Image(); im.onerror = () => rej(new Error('decode'));
      im.onload = () => {
        const w = im.naturalWidth || 400, h = im.naturalHeight || 300, big = Math.max(w, h);
        if (file.type === 'image/svg+xml' || file.type === 'image/gif' || (big <= 1600 && file.size < 700e3)) return res({ src: fr.result, w, h });
        const k = Math.min(1, 1600 / big), cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        let src = file.type === 'image/png' ? cv.toDataURL('image/png') : ''; if (!src || src.length > 1.2e6) src = cv.toDataURL('image/jpeg', 0.86);
        res({ src, w: cv.width, h: cv.height });
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function addPictures(files, at) {
  let p = at || spot(), n = 0;
  for (const f of files) {
    let im; try { im = await readImage(f); } catch (e) { continue; }
    const key = 'i' + nid(); S.doc.images[key] = im.src;
    const w = Math.min(420, Math.max(60, im.w)), rg = insertRegion({ type: 'image', img: key, w, ar: im.h / im.w, ann: [] }, p);
    p = { x: p.x + 24, y: p.y + 24, room: false }; n++; setActive(rg.id, false);
  }
  if (!n) toast('That file is not a picture this page can show.'); else commit();
}
function build(rg) { const e = rg.type === 'math' ? buildMath(rg) : rg.type === 'text' ? buildText(rg) : rg.type === 'plot' ? buildPlot(rg) : buildImage(rg); wireHandle(e, rg); els.set(rg.id, e); place(e, rg); return e; }
function renderAll() {
  FREE = !narrow(); rgsEl.className = 'rgs ' + (FREE ? 'free' : 'flow');
  rgsEl.textContent = ''; els.clear(); plots.clear(); rgsEl.append(blankEl, crossEl);
  for (const rg of S.doc.regions) rgsEl.append(build(rg));
  $('#f-title').value = S.doc.title || ''; $('#f-by').value = S.doc.by || ''; $('#f-date').value = S.doc.date || ''; $('#f-sheet').value = S.doc.sheet || '';
  if (S.active && !els.has(S.active)) S.active = null;
  if (S.active) els.get(S.active).classList.add('on');
  setCursor(FREE ? S.cursor : null);
  recalc();
  if (S.doc.auto && FREE) autoLayout(); else { if (!S.doc.auto) sortRegions(); fitCanvas(); }
  for (const P of plots.values()) draw(P);
}

// ---------- selecting, adding, moving ----------
function focusRegion(id) {
  const e = els.get(id); if (!e) return;
  const c = e.querySelector('.src, .tsrc, .pform input');
  if (c) { c.focus({ preventScroll: true }); if (c.setSelectionRange && c.type !== 'number') { const n = c.value.length; c.setSelectionRange(n, n); } if (c.classList.contains('tsrc')) autosize(c); }
  const r = e.getBoundingClientRect(), d = $('#desk').getBoundingClientRect();
  if (r.top < d.top + 8 || r.bottom > d.bottom - 110) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function setActive(id, focus) {
  if (S.active !== id) {
    const oldId = S.active, old = els.get(oldId), oldRg = old && region(oldId);
    if (old) { old.classList.remove('on'); if (old._paint) old._paint(); if (old._setTool) old._setTool('move'); }
    S.active = id; const e = els.get(id);
    if (e) { e.classList.add('on'); setCursor(null); if (e.classList.contains('math')) e.querySelector('.edit').append(keysEl); const P = plots.get(id); if (P) requestAnimationFrame(() => draw(P)); }
    if (oldRg && (oldRg.type === 'math' || oldRg.type === 'text') && !oldRg.src.trim()) removeRegion(oldId);     // empty lines do not linger
    commit(); fitCanvas();
  }
  if (id && focus) focusRegion(id);
}
function step(id, dir) { for (let i = indexOfRegion(id) + dir; i >= 0 && i < S.doc.regions.length; i += dir) { const nb = S.doc.regions[i]; if (nb.type === 'math' || nb.type === 'text') { setActive(nb.id, true); return; } } }
const BLANK = {
  math: () => ({ type: 'math', src: '' }), text: () => ({ type: 'text', src: '', w: 420 }),
  plot: () => ({ type: 'plot', exprs: 'sin(x)', xvar: 'x', x0: '0', x1: '2*pi', anim: 'none', pvar: 't', p0: '0', p1: '1', dur: 4, w: 480, h: 240 }),
  sketch: () => ({ type: 'image', img: '', w: 360, ar: 0.62, ann: [] }),
};
const EST = { math: 44, text: 44, plot: 330, image: 240 };
function flowPositions() { for (const r of S.doc.regions) { const e = els.get(r.id); if (e) { r.x = 26; r.y = e.offsetTop; } } }
function insertRegion(r, p) {
  const rg = { id: nid(), x: Math.max(0, Math.round(p.x)), y: Math.max(0, Math.round(p.y)), ...r };
  S.doc.regions.push(rg); const e = build(rg); rgsEl.append(e);
  if (p.room) makeRoom(rg.x, rg.y, rg.type === 'image' ? rg.w * rg.ar + 20 : EST[rg.type], rg.id);
  if (FREE) S.doc.auto = false;
  sortRegions(); setCursor(null); touch(); recalc(); fitCanvas();
  return rg;
}
function addRegion(kind, opt = {}) {
  if (!FREE && S.doc.auto) flowPositions();   // one-column view of an untouched page: take positions from the column
  let p;
  if (opt.below) { const a = region(opt.below), e = els.get(opt.below), edit = FREE ? 0 : (e.querySelector('.edit').offsetHeight || 0); p = { x: a.x, y: a.y + e.offsetHeight - edit + 6, room: true }; }
  else p = opt.at || spot();
  const rg = insertRegion({ ...BLANK[kind](), ...(opt.src ? { src: opt.src } : {}) }, p);
  setActive(rg.id, rg.type !== 'image');
  if (kind === 'sketch') els.get(rg.id)._setTool('pen');
  commit(); return rg;
}
function removeRegion(id) {
  const i = indexOfRegion(id); if (i < 0) return;
  const e = els.get(id); if (keysEl.parentElement && e.contains(keysEl)) keysEl.remove();
  const rg = S.doc.regions[i]; S.doc.regions.splice(i, 1); e.remove(); els.delete(id); plots.delete(id);
  if (S.active === id) S.active = null;
  if (FREE && !S.doc.regions.length) setCursor({ x: 26, y: 14 });
  if (FREE && rg.src !== '') S.doc.auto = false;
  touch(); recalc(); fitCanvas();
}
function moveInColumn(id, dir) {            // narrow screens: swap places with the neighbour
  const i = indexOfRegion(id), j = i + dir, a = S.doc.regions[i], b = S.doc.regions[j]; if (!b) return;
  [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y]; if (a.y === b.y) { if (dir > 0) a.y += 20; else b.y += 20; }
  S.doc.regions[i] = b; S.doc.regions[j] = a;
  const ea = els.get(a.id), eb = els.get(b.id); if (dir < 0) eb.before(ea); else eb.after(ea);
  touch(); recalc(); commit();
}
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast(what + ' copied'); }
  catch (e) { dialog({ title: 'Copy this text', body: `<textarea class="tsrc" style="height:220px;overflow:auto" readonly id="copy-box">${esc(text)}</textarea>`, small: true }); const b = $('#copy-box'); b.focus(); b.select(); }
}
function regionTex(rg) {
  const r = S.results.get(rg.id);
  if (rg.type === 'math') return r && r.tex ? r.tex + (r.res || '') : '';
  return rg.type === 'text' ? rg.src : '';
}
function regionMenu(rg, anchor) {
  const id = rg.id, r = S.results.get(id), e = els.get(id), P = plots.get(id);
  const extra = rg.type === 'image' ? ['-', ...['pen', 'arrow', 'label', 'erase'].map(t => ({ label: { pen: 'Draw with the pen', arrow: 'Draw an arrow', label: 'Add a label', erase: 'Erase marks' }[t], act: () => { setActive(id, false); e._setTool(t); } })), { label: 'Clear all marks', act: () => e._clear() }]
    : rg.type === 'plot' && rg.anim !== 'none' && P && P.data ? ['-', { label: P.playing ? 'Pause' : 'Play', act: () => play(P, !P.playing) }]
    : rg.type === 'math' || rg.type === 'text' ? ['-', { label: 'Edit', act: () => setActive(id, true) }] : [];
  openMenu(anchor, [
    ...extra.slice(1), '-',
    ...(FREE ? [] : [{ label: 'Move up', act: () => moveInColumn(id, -1) }, { label: 'Move down', act: () => moveInColumn(id, 1) }]),
    { label: 'Duplicate', act: () => { const { id: _, side: __, ...copy } = JSON.parse(JSON.stringify(rg)); const n = insertRegion(copy, FREE ? { x: rg.x + 24, y: rg.y + 24 } : { x: rg.x, y: rg.y + els.get(id).offsetHeight + 8, room: true }); setActive(n.id, false); commit(); } },
    ...(rg.type === 'math' ? ['-', { label: 'Copy as LaTeX', act: () => copyText(regionTex(rg), 'LaTeX') }, { label: 'Copy the answer', act: () => copyText(r && r.text || '', 'Answer') }, { label: 'Copy what I typed', act: () => copyText(rg.src, 'Line') }] : []),
    '-', { label: 'Delete', act: () => { removeRegion(id); commit(); } },
  ]);
}
rgsEl.addEventListener('pointerdown', e => {
  if (e.target !== rgsEl && e.target !== blankEl) return;
  if (typing()) document.activeElement.blur();
  setActive(null);
  if (FREE) { const p = canvasPt(e); setCursor({ x: Math.max(0, snap(p.x - 4)), y: Math.max(0, snap(p.y - 20)) }); }
});
$('#desk').addEventListener('pointerdown', e => { if (e.target === $('#desk') || e.target === $('#sheet')) { setActive(null); setCursor(null); } });

// ---------- calculating and painting ----------
let rcT = 0, olT = 0;
const recalcSoon = () => { clearTimeout(rcT); rcT = setTimeout(recalc, 20); };
const outlineSoon = () => { clearTimeout(olT); olT = setTimeout(outline, 250); };
const stamp = ok => `<span class="stamp ${ok ? 'ok' : 'ng'}" title="${ok ? 'This is true' : 'This is false'}">${ok ? 'OK' : 'NG'}</span>`;
function paintMath(rg, e) {
  const r = S.results.get(rg.id), view = e.querySelector('.view'), msg = e.querySelector('.msg');
  let h = '', m = '', note = false;
  if (!rg.src.trim()) h = '<span class="ph">Type math here</span>';
  else if (r) {
    h = r.tex ? Core.texToHtml(r.tex) : `<span class="raw">${esc(rg.src)}</span>`;
    if (r.pending) h += '<span class="pend">solving…</span>';
    else if (r.err) m = esc(r.err);
    else {
      if (r.subTex) h += `<span class="sub">${Core.texToHtml(r.subTex)}</span>`;
      if (r.check !== undefined) h += stamp(r.check);
      else if (r.res) { const canUnit = r.res[0] === '=' && r.value; h += `<span class="res"${canUnit ? ' data-u="1" role="button" tabindex="0" title="Change the units"' : ''}>${Core.texToHtml(r.res)}</span>`; }
      if (r.hint) {
        note = true;
        m = Adv.state === 'ready' ? 'Neither solver found a closed form for this. With numbers for every value you can still get a decimal answer with =.'
          : Adv.state === 'loading' ? 'Waiting for the advanced solver to finish loading.'
          : 'The built-in solver could not finish this one. <button type="button" data-adv>Turn on the advanced solver</button> to try again.';
      }
    }
  }
  const sig = h + '\u0001' + m + (note ? 1 : 0);
  if (e._sig !== sig) { e._sig = sig; view.innerHTML = h; msg.hidden = !m; msg.className = 'msg' + (note ? ' note' : ''); msg.innerHTML = m; }
  e.classList.toggle('bad', !!(r && r.err));
}
rgsEl.addEventListener('click', e => { if (e.target.closest('[data-adv]')) solverMenu($('#b-solver').offsetParent ? $('#b-solver') : $('#b-more')); });
rgsEl.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('res')) { e.preventDefault(); const rg = region(e.target.closest('.rg').dataset.id); if (rg) unitMenu(rg, e.target); } });
function recalc() {
  clearTimeout(rcT);
  Core.C.sig = S.set.sig; Core.C.system = S.set.system;
  const t0 = performance.now(); let out;
  try { out = Core.evalDoc(S.doc.regions); } catch (e) { console.error(e); toast('Something went wrong while calculating. ' + (e.message || '')); return; }
  S.results = out.results; S.vars = out.vars;
  for (const rg of S.doc.regions) {
    const e = els.get(rg.id); if (!e) continue;
    if (rg.type === 'math') paintMath(rg, e); else if (rg.type === 'plot') paintPlot(plots.get(rg.id));
  }
  outline(); fillKeys();
  const n = S.doc.regions.length;
  $('#st-lines').textContent = `${n} ${n === 1 ? 'item' : 'items'} on the page`;
  $('#st-time').textContent = `Calculated in ${Math.max(1, Math.round(performance.now() - t0))} ms`;
  $('#st-units').textContent = `Showing ${Core.C.sysNow === 'US' ? 'US customary' : 'SI'} units`;
}

// ---------- choosing units for an answer ----------
const COMPOSITE = {
  '2,1,-2': ['J', 'kJ', 'N*m', 'kN*m', 'kWh', 'cal', 'BTU', 'ft*lbf', 'kip*ft'], '0,1,-2': ['N/m', 'kN/m', 'N/mm', 'lbf/ft', 'lbf/in', 'kip/ft'], '3,1,-2': ['N*m^2', 'kN*m^2', 'kip*ft^2', 'kip*in^2'],
  '-2,1,-2': ['N/m^3', 'kN/m^3', 'pcf'], '0,0,-1': ['1/s', 'rad/s', 'Hz', 'rpm'], '1,0,-1': ['m/s', 'km/hr', 'ft/s', 'mi/hr'], '1,0,-2': ['m/s^2', 'ft/s^2', 'g'], '-3,1,0': ['kg/m^3', 'gm/cm^3', 'lb/ft^3'], '0,0,0': ['deg'],
  '3,0,-1': ['m^3/s', 'liter/s', 'liter/min', 'gal/min'],
};
function unitMenu(rg, anchor) {
  const r = S.results.get(rg.id); if (!r || !r.value) return;
  let n; try { n = Core.numericC(r.value); } catch (e) { return; }
  const q = Core.quant(n.t === 'm' ? n.r[0][0] : n); if (!q) return;
  const d = Core.dimsOf(q.u), dk = d.slice(0, 3).join(','), rest = d.slice(3).every(v => !v);
  let list = [];
  for (const [name, u] of Object.entries(Core.UNITS)) if (!['sec', 'lbm', 'g', 'rad', 'um'].includes(name) && d.some(v => v) && Core.sameDims(u.d, d)) list.push(name);
  if (rest && d[1] === 0 && d[2] === 0 && d[0] >= 2 && d[0] <= 4) list = [...['mm', 'cm', 'm', 'in', 'ft'].map(u => `${u}^${d[0]}`), ...list];
  if (rest && COMPOSITE[dk]) list = [...new Set([...COMPOSITE[dk], ...list])];
  if (!list.length) return;
  const base = () => { const s = rg.src.trimEnd(); if (r.kind === 'eval' && !/=\s*[^=<>!]*$/.test(s)) return s + ' ='; const i = s.lastIndexOf('='); return i >= 0 && s[i - 1] !== ':' ? s.slice(0, i + 1) : s + ' ='; };
  const apply = u => { rg.src = base() + (u ? ' ' + u : ''); els.get(rg.id).querySelector('.src').value = rg.src; touch(); recalc(); commit(); };
  openMenu(anchor, [{ hd: 'Show this answer in' }, ...list.slice(0, 16).map(u => ({ label: u.replace(/\*/g, '·'), act: () => apply(u) })), '-', { label: 'Automatic', act: () => apply('') }]);
}

// ---------- plots ----------
let themeCache = null;
function theme() {
  if (!themeCache) { const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim(); themeCache = { ink: v('--ink'), ink2: v('--ink2'), ink3: v('--ink3'), rule: v('--rule'), rule2: v('--rule2'), paper: v('--paper'), c: [1, 2, 3, 4, 5, 6].map(i => v('--c' + i)) }; }
  return themeCache;
}
function niceTicks(lo, hi, n) {
  if (lo > hi) [lo, hi] = [hi, lo];
  const raw = (hi - lo) / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { out, step };
}
const tickText = (v, step) => { const a = Math.abs(v); if (a !== 0 && (a >= 1e6 || a < 1e-4)) return v.toExponential(1).replace('e+', 'e').replace('.0e', 'e'); return String(+v.toFixed(Math.max(0, Math.min(8, -Math.floor(Math.log10(step) - 1e-9))))); };
function yRange(d, mode) {
  const ys = [], args = [0, 0], nx = mode === 'param' ? 140 : 420, np = mode === 'param' ? 19 : 1;
  for (let k = 0; k < np; k++) {
    args[1] = d.p0 + (d.p1 - d.p0) * (np > 1 ? k / (np - 1) : 0);
    for (let i = 0; i <= nx; i++) { args[0] = d.a + (d.b - d.a) * i / nx; for (const c of d.curves.slice(0, 6)) { const y = c.f(args); if (Number.isFinite(y)) ys.push(y); } }
  }
  if (!ys.length) return [-1, 1];
  ys.sort((a, b) => a - b);
  let lo = ys[0], hi = ys[ys.length - 1]; const p2 = ys[Math.floor(ys.length * 0.02)], p98 = ys[Math.floor(ys.length * 0.98)];
  if (p98 > p2 && hi - lo > 25 * (p98 - p2)) { lo = p2 - 0.3 * (p98 - p2); hi = p98 + 0.3 * (p98 - p2); }   // ignore spikes near asymptotes
  if (lo === hi) { const m = Math.abs(lo) || 1; lo -= m / 2; hi += m / 2; }
  if (lo > 0 && lo < 0.3 * hi) lo = 0; if (hi < 0 && hi > 0.3 * lo) hi = 0;
  const pad = (hi - lo) * 0.07; return [lo === 0 ? 0 : lo - pad, hi === 0 ? 0 : hi + pad];
}
function geom(P) {
  const W = P.cv.clientWidth, H = P.cv.clientHeight, d = P.data, yr = P.range || (P.range = yRange(d, P.rg.anim));
  const yt = niceTicks(yr[0] / d.yu.f, yr[1] / d.yu.f, H / 55), g = P.ctx;
  g.font = '12px Barlow, "Segoe UI", system-ui, sans-serif';
  const ml = Math.max(34, Math.ceil(Math.max(...yt.out.map(v => g.measureText(tickText(v, yt.step)).width))) + 14), mr = 14, mt = 22, mb = 34;
  const pw = W - ml - mr, ph = H - mt - mb;
  return { W, H, ml, mr, mt, mb, pw, ph, yr, yt, X: x => ml + (x - d.a) / (d.b - d.a) * pw, Y: y => mt + (1 - (y - yr[0]) / (yr[1] - yr[0])) * ph };
}
function draw(P) {
  const cv = P.cv, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = P.ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const d = P.data; if (!d) return;
  const th = theme(), G = geom(P), { ml, mt, pw, ph, yr, X, Y } = G, mode = P.rg.anim;
  const pval = mode === 'param' ? d.p0 + (d.p1 - d.p0) * P.frac : 0, xend = mode === 'trace' ? d.a + (d.b - d.a) * P.frac : d.b;
  g.lineWidth = 1; g.font = '12px Barlow, "Segoe UI", system-ui, sans-serif'; g.fillStyle = th.ink2; g.textBaseline = 'middle'; g.textAlign = 'right';
  for (const v of G.yt.out) { const y = Math.round(Y(v * d.yu.f)) + 0.5; if (y < mt - 1 || y > mt + ph + 1) continue; g.strokeStyle = v === 0 ? th.ink3 : th.rule2; g.beginPath(); g.moveTo(ml, y); g.lineTo(ml + pw, y); g.stroke(); g.fillText(tickText(v, G.yt.step), ml - 7, y); }
  const xt = niceTicks(d.a / d.xu.f, d.b / d.xu.f, pw / 80); g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of xt.out) { const x = Math.round(X(v * d.xu.f)) + 0.5; if (x < ml - 1 || x > ml + pw + 1) continue; g.strokeStyle = th.rule2; g.beginPath(); g.moveTo(x, mt); g.lineTo(x, mt + ph); g.stroke(); g.fillText(tickText(v, xt.step), x, mt + ph + 6); }
  g.strokeStyle = th.rule; g.beginPath(); g.moveTo(ml + 0.5, mt); g.lineTo(ml + 0.5, mt + ph + 0.5); g.lineTo(ml + pw, mt + ph + 0.5); g.stroke();
  g.fillStyle = th.ink3; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillText(d.xv + (d.xu.text ? ` (${d.xu.text})` : ''), ml + pw, G.H - 5);
  if (d.yu.text) { g.textAlign = 'left'; g.fillText(`(${d.yu.text})`, ml + 4, mt - 8); }
  g.save(); g.beginPath(); g.rect(ml, mt - 1, pw, ph + 2); g.clip();
  const n = Math.max(120, Math.min(1400, Math.round(pw * 1.5))), args = [0, pval], span = yr[1] - yr[0], ends = [];
  d.curves.slice(0, 6).forEach((c, ci) => {
    g.strokeStyle = th.c[ci]; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
    let pen = false, py = 0, last = null;
    for (let i = 0; i <= n; i++) {
      const x = d.a + (xend - d.a) * i / n; args[0] = x; const y = c.f(args);
      if (!Number.isFinite(y) || (pen && Math.abs(y - py) > 4 * span)) { pen = false; continue; }
      const sx = X(x), sy = Math.max(-1e4, Math.min(1e4, Y(y)));
      if (pen) g.lineTo(sx, sy); else g.moveTo(sx, sy);
      pen = true; py = y; last = [sx, sy];
    }
    g.stroke(); ends.push(last);
  });
  const dot = (x, y, col) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = th.paper; g.fill(); g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fillStyle = col; g.fill(); };
  if (mode === 'trace' && P.frac < 1) ends.forEach((p, i) => p && dot(p[0], p[1], th.c[i]));
  if (P.hover !== null && P.hover <= Math.max(xend, d.a) && P.hover >= Math.min(xend, d.a)) {
    const hx = Math.round(X(P.hover)) + 0.5; g.strokeStyle = th.ink3; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, mt); g.lineTo(hx, mt + ph); g.stroke();
    args[0] = P.hover; d.curves.slice(0, 6).forEach((c, i) => { const y = c.f(args); if (Number.isFinite(y)) dot(X(P.hover), Y(y), th.c[i]); });
  }
  g.restore();
}
const short = v => { const f = Core.fmtNum(v, 4); return f.e !== undefined ? `${f.m}e${f.e}` : f.m; };
function hover(P, ev) {
  const d = P.data; if (!d) return;
  const G = geom(P), r = P.cv.getBoundingClientRect(), mx = ev.clientX - r.left;
  if (mx < G.ml || mx > G.ml + G.pw) { P.hover = null; P.tip.hidden = true; draw(P); return; }
  const x = d.a + (mx - G.ml) / G.pw * (d.b - d.a); P.hover = x; draw(P);
  const args = [x, P.rg.anim === 'param' ? d.p0 + (d.p1 - d.p0) * P.frac : 0];
  P.tip.innerHTML = `<b>${esc(d.xv)} = ${short(x / d.xu.f)}${d.xu.text ? ' ' + esc(d.xu.text) : ''}</b>` + d.curves.slice(0, 6).map((c, i) => { const y = c.f(args); return `<br><i style="background:var(--c${i + 1})"></i>${Number.isFinite(y) ? short(y / d.yu.f) + (d.yu.text ? ' ' + esc(d.yu.text) : '') : 'no value'}`; }).join('');
  P.tip.hidden = false;
  const tw = P.tip.offsetWidth; P.tip.style.left = Math.max(0, Math.min(G.W - tw, mx + (mx > G.W / 2 ? -tw - 12 : 12))) + 'px'; P.tip.style.top = G.mt + 4 + 'px';
}
function syncAnim(P) {
  const d = P.data, box = P.el.querySelector('.anim'), mode = P.rg.anim;
  box.hidden = !d || mode === 'none'; if (box.hidden) return;
  const b = box.querySelector('.play'), want = P.playing ? 'pause' : 'play';
  if (b.dataset.icon !== want) { b.dataset.icon = want; b.innerHTML = ic(want); b.setAttribute('aria-label', P.playing ? 'Pause' : 'Play'); }   // rebuilding it every frame swallowed clicks
  box.querySelector('input').value = Math.round(P.frac * 1000);
  const [nm, v, u] = mode === 'param' ? [d.pv, d.p0 + (d.p1 - d.p0) * P.frac, d.pu] : [d.xv, d.a + (d.b - d.a) * P.frac, d.xu];
  box.querySelector('output').textContent = `${nm} = ${short(v / u.f)}${u.text ? ' ' + u.text : ''}`;
}
function paintPlot(P) {
  if (!P) return;
  const r = S.results.get(P.rg.id), msg = P.el.querySelector('.msg');
  P.data = r && r.plot ? r : null; P.range = null;
  let m = r && r.err ? esc(r.err) : r && r.pending ? 'Waiting for the solver…' : '';
  if (P.data && P.data.curves.length > 6) m = 'Only the first 6 curves are drawn.';
  if (P.data && P.data.curves.some(c => c.mismatch)) m = 'These curves have different kinds of units, so they share one axis in base units.';
  msg.hidden = !m; msg.innerHTML = m; msg.className = 'msg' + (r && r.err ? '' : ' note'); P.el.classList.toggle('bad', !!(r && r.err));
  P.el.querySelector('.legend').innerHTML = P.data ? P.data.curves.slice(0, 6).map((c, i) => `<span><i style="background:var(--c${i + 1})"></i>${Core.texToHtml(c.tex)}</span>`).join('') : '';
  if (!P.data) P.playing = false;
  draw(P); syncAnim(P);
}
let raf = 0, lastT = 0;
function tick(t) {
  raf = 0; const dt = Math.min(0.1, (t - lastT) / 1000) || 0; lastT = t; let any = false;
  for (const P of plots.values()) {
    if (!P.playing) continue;
    if (!P.data) { P.playing = false; syncAnim(P); continue; }
    any = true;
    if (P.frac >= 1 && P.rg.anim === 'trace') { P.hold += dt; if (P.hold > 0.9) { P.frac = 0; P.hold = 0; } }
    else { P.frac += dt / Math.max(0.5, +P.rg.dur || 4); if (P.frac >= 1) P.frac = P.rg.anim === 'trace' ? 1 : P.frac - 1; }
    draw(P); syncAnim(P);
  }
  if (any) raf = requestAnimationFrame(tick);
}
function play(P, on) {
  P.playing = on && !!P.data;
  if (P.playing) { if (P.rg.anim === 'trace' && P.frac >= 1) { P.frac = 0; P.hold = 0; } lastT = performance.now(); if (!raf) raf = requestAnimationFrame(tick); }
  syncAnim(P);
}
const retheme = () => { themeCache = null; for (const P of plots.values()) draw(P); };
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---------- outline panel ----------
function outline() {
  const p = $('#p-out'); if ($('#side').classList.contains('closed')) return;
  let h = '<div class="cat">Sections</div>', any = false;
  for (const rg of S.doc.regions) if (rg.type === 'text') for (const ln of rg.src.split('\n')) { const m = /^(#{1,3})\s+(.*)$/.exec(ln); if (m) { any = true; h += `<button class="out-h l${m[1].length}" type="button" data-go="${rg.id}">${esc(m[2])}</button>`; } }
  if (!any) h += '<div class="empty">Notes that start with # show up here.</div>';
  h += '<div class="cat">Names</div>';
  const seen = new Map(); for (const v of S.vars) seen.set(v.name, v);
  if (!seen.size) h += '<div class="empty">Names you define with := show up here.</div>';
  for (const v of seen.values()) h += `<button class="var" type="button" data-go="${v.id}"><span>${Core.texToHtml(v.tex)}</span><span>${esc(v.fn ? 'function' : v.text || '')}</span></button>`;
  p.innerHTML = h;
}
$('#p-out').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b || !els.get(b.dataset.go)) return; if (narrow()) toggleSide(false); setActive(b.dataset.go, false); els.get(b.dataset.go).scrollIntoView({ block: 'center', behavior: 'smooth' }); });
let scrim = null;
function toggleSide(open) {
  const s = $('#side'); if (open === undefined) open = s.classList.contains('closed');
  s.classList.toggle('closed', !open); $('#b-side').setAttribute('aria-pressed', open);
  if (scrim) { scrim.remove(); scrim = null; }
  if (open && narrow()) { scrim = el('<div class="drawer-scrim"></div>'); scrim.addEventListener('click', () => toggleSide(false)); document.body.append(scrim); }
  if (!narrow()) LS.set('icalpad.side', open);
  if (open) outline();
}

// ---------- files, export, paste and drop ----------
async function saveFile(filename, data) {
  if (framed) {
    const d = await window.claude.use('downloads');
    if (!d) { toast('Saving a file is not available in this viewer. The worksheet stays in this browser.'); return; }
    try { await d.save({ filename, data }); S.dirty = false; } catch (e) { if (!e || e.code !== 'declined') toast('This viewer could not save the file.'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' })); a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); S.dirty = false;
}
const fileName = () => (S.doc.title || 'worksheet').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'worksheet';
function docJson() { const used = new Set(S.doc.regions.map(r => r.img).filter(Boolean)), images = {}; for (const k of used) if (S.doc.images[k]) images[k] = S.doc.images[k]; return JSON.stringify({ ...S.doc, images }, null, 1); }
function latexDoc() {
  const body = S.doc.regions.map(rg => {
    if (rg.type === 'math') { const t = regionTex(rg); return t ? `\\[ ${t.replace(/\\mathrel\{:=\}/g, ' := ')} \\]` : ''; }
    if (rg.type === 'plot') return `% plot of ${rg.exprs}`;
    if (rg.type === 'image') return '% picture';
    return rg.src.split('\n').map(l => { const m = /^(#{1,3})\s+(.*)$/.exec(l); return m ? `\\${['section', 'subsection', 'subsubsection'][m[1].length - 1]}*{${m[2]}}` : l; }).join('\n');
  }).filter(Boolean).join('\n\n');
  return `\\documentclass{article}\n\\usepackage{amsmath,mathtools}\n\\title{${S.doc.title || 'Calculation'}}\n\\date{${S.doc.date || ''}}\n\\begin{document}\n\\maketitle\n\n${body}\n\n\\end{document}\n`;
}
function replaceDoc(next) {
  if (!S.dirty) { next(); return; }
  dialog({ title: 'Replace this worksheet?', small: true, body: '<p style="margin:0">Your current worksheet has changes. Opening something else replaces it.</p>',
    buttons: [{ label: 'Keep working' }, { label: 'Save a file first', act: () => saveFile(fileName() + '.json', docJson()) }, { label: 'Replace', kind: 'solid', act: next }] });
}
const fileItems = () => [
  { label: 'New worksheet', act: () => replaceDoc(() => { loadDoc({ v: 2, title: '', by: S.doc.by || '', date: today(), sheet: '1', auto: false, images: {}, regions: [] }, true); if (FREE) setCursor({ x: 26, y: 14 }); }) },
  { label: 'Open a file…', act: () => $('#f-open').click() },
  { label: 'Save as a file', kbd: 'Ctrl S', act: () => saveFile(fileName() + '.json', docJson()) },
  '-',
  { label: 'Copy as LaTeX', note: 'The whole worksheet as a LaTeX document', act: () => copyText(latexDoc(), 'LaTeX') },
  ...(framed ? [] : [{ label: 'Print or save as PDF', act: () => { setActive(null); setCursor(null); setTimeout(() => window.print(), 50); } }]),
];
$('#f-open').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const doc = cleanDoc(JSON.parse(await f.text())); replaceDoc(() => loadDoc(doc, true)); }
  catch (err) { toast('That file is not an iCalPad worksheet.'); }
});
$('#f-img').addEventListener('change', e => { const fs = [...e.target.files], at = S.pendingAt; e.target.value = ''; S.pendingAt = null; if (fs.length) addPictures(fs, at || undefined); });
const exampleItems = () => EXAMPLES.map(x => ({ label: x.name, note: x.note, act: () => replaceDoc(() => loadDoc(docFrom(x.s, x.title), true)) }));
function pasteText(text, at) {              // each pasted line becomes a math line when it reads as math, otherwise a note
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim().replace(/^\$\$?|\$\$?$/g, '').replace(/^\\\[|\\\]$/g, '').replace(/^\\\(|\\\)$/g, '').trim()).filter(Boolean).slice(0, 60);
  let p = at || spot(), last = null;
  for (const ln of lines) {
    let math = true; try { Core.parseStatement(ln); } catch (e) { math = false; }
    last = insertRegion(math ? { type: 'math', src: ln } : { type: 'text', src: ln, w: 420 }, p);
    p = { x: p.x, y: p.y + els.get(last.id).offsetHeight + 6, room: p.room };
  }
  if (last) { setActive(last.id, false); commit(); }
}
document.addEventListener('paste', e => {
  const cd = e.clipboardData; if (!cd) return;
  const imgs = [...cd.files].filter(f => f.type.startsWith('image/'));
  if (imgs.length) { e.preventDefault(); addPictures(imgs); return; }
  if (typing()) return;
  const t = cd.getData('text/plain'); if (t && t.trim()) { e.preventDefault(); pasteText(t); }
});
const desk = $('#desk');
desk.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].some(t => t === 'Files' || t === 'text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
desk.addEventListener('drop', e => {
  const dt = e.dataTransfer; if (!dt) return; e.preventDefault();
  const p = canvasPt(e), at = FREE ? { x: Math.max(0, snap(p.x)), y: Math.max(0, snap(p.y)), room: false } : null;
  const imgs = [...dt.files].filter(f => f.type.startsWith('image/'));
  if (imgs.length) addPictures(imgs, at); else { const t = dt.getData('text/plain'); if (t && t.trim()) pasteText(t, at); else if (dt.files.length) toast('Only pictures can be dropped onto the page.'); }
});

// ---------- the optional advanced solver (SymPy, loaded on request) ----------
const PYU = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
const BRIDGE = "__BRIDGE__";
const Adv = { state: 'off', note: '', worker: null, cache: new Map(), wait: new Map(), seq: 0, dog: 0, loadDog: 0 };
function syncSolver() {
  const c = $('#b-solver'); c.className = 'chip wide-only' + (Adv.state === 'ready' ? ' on' : Adv.state === 'loading' ? ' busy' : Adv.state === 'failed' ? ' bad' : '');
  $('#solver-lbl').textContent = Adv.state === 'ready' ? 'Advanced solver on' : Adv.state === 'loading' ? (Adv.note || 'Loading solver…') : Adv.state === 'failed' ? 'Solver did not load' : 'Built-in solver';
}
function advFail(why) {
  if (Adv.worker) { Adv.worker.terminate(); Adv.worker = null; }
  clearTimeout(Adv.loadDog); Adv.state = 'failed'; Adv.note = why; Adv.wait.clear(); syncSolver(); recalc();
}
function advStart() {
  if (Adv.state === 'loading' || Adv.state === 'ready') return;
  Adv.state = 'loading'; Adv.note = 'Downloading solver…'; syncSolver();
  const src = `importScripts(${JSON.stringify(PYU + 'pyodide.js')});
let run = null;
const ready = (async () => {
  const py = await loadPyodide({ indexURL: ${JSON.stringify(PYU)} });
  postMessage({ t: 'stage', v: 'Loading SymPy…' });
  await py.loadPackage('sympy');
  py.runPython(${JSON.stringify(BRIDGE)});
  run = py.globals.get('icp_run');
  postMessage({ t: 'ready' });
})();
ready.catch(e => postMessage({ t: 'fail', v: String(e && e.message || e) }));
onmessage = async e => {
  try { await ready; } catch (_) { return; }
  const { id, op, args } = e.data;
  try { postMessage({ t: 'res', id, out: run(op, args) }); }
  catch (err) { postMessage({ t: 'res', id, err: String(err && err.message || err).trim().split('\\n').pop() }); }
};`;
  let w;
  try { w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); }
  catch (e) { advFail('This browser did not allow the solver to start.'); return; }
  Adv.worker = w;
  w.onerror = () => advFail('The download was blocked or the connection dropped.');
  w.onmessage = ev => {
    const m = ev.data;
    if (m.t === 'stage') { Adv.note = m.v; syncSolver(); }
    else if (m.t === 'fail') advFail('The solver could not be downloaded here.');
    else if (m.t === 'ready') { clearTimeout(Adv.loadDog); Adv.state = 'ready'; LS.set('icalpad.adv', true); syncSolver(); recalc(); toast('Advanced solver is ready'); }
    else if (m.t === 'res') {
      const k = Adv.wait.get(m.id); Adv.wait.delete(m.id); clearTimeout(Adv.dog);
      let v = null;
      if (k !== undefined && m.out && m.out !== 'null') { try { v = Core.fromJ(JSON.parse(m.out)); } catch (e) { v = null; } }
      if (k !== undefined) Adv.cache.set(k, v);
      if (Adv.wait.size) armDog(); recalcSoon();
    }
  };
  Adv.loadDog = setTimeout(() => { if (Adv.state === 'loading') advFail('The download took too long.'); }, 180000);
}
function armDog() {                         // a calculation that runs too long is abandoned and the solver restarted
  clearTimeout(Adv.dog);
  Adv.dog = setTimeout(() => {
    for (const k of Adv.wait.values()) Adv.cache.set(k, null);
    Adv.wait.clear(); if (Adv.worker) Adv.worker.terminate(); Adv.worker = null; Adv.state = 'off';
    toast('The advanced solver gave up on one line after 60 seconds.'); advStart(); recalc();
  }, 60000);
}
Core.C.adv = (op, args) => {
  if (Adv.state === 'loading') throw new Core.Pending();
  if (Adv.state !== 'ready') return null;
  const k = op + '|' + args.map(Core.key).join('|');
  if (Adv.cache.has(k)) return Adv.cache.get(k);
  if (![...Adv.wait.values()].includes(k)) { const id = ++Adv.seq; Adv.wait.set(id, k); Adv.worker.postMessage({ id, op, args: JSON.stringify(args) }); armDog(); }
  throw new Core.Pending();
};
function advStop() { if (Adv.worker) Adv.worker.terminate(); Adv.worker = null; Adv.state = 'off'; Adv.wait.clear(); LS.set('icalpad.adv', false); syncSolver(); recalc(); }
function solverMenu(anchor) {
  const st = Adv.state;
  const head = `<div class="pad"><p><b>Built-in solver.</b> Always on, instant, works offline. Handles everyday algebra, calculus, units and matrices.</p><p style="margin:0"><b>Advanced solver.</b> A full computer algebra system (SymPy) for harder integrals, nonlinear systems, differential equations and Laplace transforms. It is a one-time download of about 20 MB that your browser keeps for next time.</p>${st === 'failed' ? `<p style="margin:8px 0 0;color:var(--ng)">${esc(Adv.note)} It needs an internet connection and a page that is allowed to reach cdn.jsdelivr.net.</p>` : ''}</div>`;
  openMenu(anchor, [{ html: head }, '-',
    st === 'ready' ? { label: 'Turn off the advanced solver', act: advStop }
      : st === 'loading' ? { label: 'Cancel the download', act: advStop }
      : { label: st === 'failed' ? 'Try the download again' : 'Turn on the advanced solver', note: 'Downloads about 20 MB', act: advStart }]);
}

// ---------- settings, help ----------
function applyTheme() {
  const r = document.documentElement;
  if (S.set.theme === 'auto') { if (applyTheme.orig) r.setAttribute('data-theme', applyTheme.orig); else r.removeAttribute('data-theme'); }
  else r.setAttribute('data-theme', S.set.theme);
  themeCache = null;
}
applyTheme.orig = document.documentElement.getAttribute('data-theme');
function settingsMenu(anchor) {
  const opt = (v, cur, label) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
  openMenu(anchor, [{ html: `<div class="row"><label for="set-sig">Digits shown</label><select id="set-sig">${[3, 4, 5, 6, 8].map(n => opt(n, S.set.sig, n)).join('')}</select></div>
    <div class="row"><label for="set-sys">Units for answers</label><select id="set-sys">${opt('auto', S.set.system, 'Follow the worksheet')}${opt('SI', S.set.system, 'SI')}${opt('US', S.set.system, 'US customary')}</select></div>
    <div class="row"><label for="set-th">Appearance</label><select id="set-th">${opt('auto', S.set.theme, 'Match my device')}${opt('light', S.set.theme, 'Light')}${opt('dark', S.set.theme, 'Dark')}</select></div>` }], m => {
    const on = (id, f) => m.querySelector(id).addEventListener('change', e => { f(e.target.value); LS.set('icalpad.set', S.set); recalc(); });
    on('#set-sig', v => { S.set.sig = +v; }); on('#set-sys', v => { S.set.system = v; }); on('#set-th', v => { S.set.theme = v; applyTheme(); });
  });
}
function helpDialog() {
  dialog({ title: 'How iCalPad works', body: `<div class="help">${HELP.map(([h, rows]) => `<h3>${esc(h)}</h3>${rows.map(([c, d]) => `<div class="hr"><code>${esc(c)}</code><span>${esc(d)}</span></div>`).join('')}`).join('')}
    <h3>Keys</h3><div class="hr"><code>Enter</code><span>New line below</span></div><div class="hr"><code>↑ ↓</code><span>Previous or next line</span></div><div class="hr"><code>Esc</code><span>Finish editing</span></div><div class="hr"><code>Alt while dragging</code><span>Move without snapping</span></div>
    <h3>LaTeX</h3><div class="hr"><code>\\frac{w L^2}{8} =</code><span>Any line can be typed or pasted as LaTeX</span></div><div class="hr"><code>Copy as LaTeX</code><span>In a line's menu, and under File for the whole page</span></div></div>` });
}

// ---------- wiring ----------
$('#b-side').innerHTML = ic('side'); $('#b-undo').innerHTML = ic('undo'); $('#b-redo').innerHTML = ic('redo'); $('#b-undo2').innerHTML = ic('undo');
$('#b-help').innerHTML = ic('help'); $('#b-set').innerHTML = ic('set'); $('#b-more').innerHTML = ic('more');
const ADD_LABEL = { math: 'Math', text: 'Note', plot: 'Plot', picture: 'Picture', sketch: 'Sketch' };
function addKind(k) { if (k === 'picture') $('#f-img').click(); else addRegion(k); }
for (const b of $$('[data-add]')) { b.innerHTML = ic('plus') + ADD_LABEL[b.dataset.add]; b.addEventListener('click', () => addKind(b.dataset.add)); b.addEventListener('pointerdown', e => e.preventDefault()); }
$('#b-side').addEventListener('click', () => toggleSide());
$('#b-undo').addEventListener('click', undo); $('#b-undo2').addEventListener('click', undo); $('#b-redo').addEventListener('click', redo);
$('#b-ex').addEventListener('click', e => openMenu(e.currentTarget, [{ hd: 'Open an example worksheet' }, ...exampleItems()]));
$('#b-file').addEventListener('click', e => openMenu(e.currentTarget, fileItems()));
$('#b-solver').addEventListener('click', e => solverMenu(e.currentTarget));
$('#b-set').addEventListener('click', e => settingsMenu(e.currentTarget));
$('#b-help').addEventListener('click', helpDialog);
$('#b-more').addEventListener('click', e => {
  const a = e.currentTarget;
  openMenu(a, [{ label: 'Add a sketch', act: () => addRegion('sketch') }, { label: 'Redo', act: redo }, '-', ...fileItems(), '-',
    { label: Adv.state === 'ready' ? 'Advanced solver is on' : 'Solver…', act: () => setTimeout(() => solverMenu(a), 0) },
    { label: 'How iCalPad works', act: helpDialog }, { label: 'Settings…', act: () => setTimeout(() => settingsMenu(a), 0) }]);
});
for (const [id, k] of [['#f-title', 'title'], ['#f-by', 'by'], ['#f-date', 'date'], ['#f-sheet', 'sheet']]) $(id).addEventListener('input', e => { S.doc[k] = e.target.value; touch(); });
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey, ty = typing();
  if (e.key === 'Escape') { closeMenu(); if (!ty) setActive(null); }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(fileName() + '.json', docJson()); }
  if (mod && e.key.toLowerCase() === 'z' && !ty) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  if (mod && e.key.toLowerCase() === 'y' && !ty) { e.preventDefault(); redo(); }
  if (!ty && !mod && !e.altKey && !menuEl && !$('.scrim')) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.active && region(S.active) && ['plot', 'image'].includes(region(S.active).type)) { e.preventDefault(); removeRegion(S.active); commit(); }
    else if (FREE && S.cursor && e.key.length === 1 && e.key !== ' ') {                 // click a spot, then just type
      e.preventDefault();
      if (e.key === '"') addRegion('text', { at: { ...S.cursor } }); else { const rg = addRegion('math', { at: { ...S.cursor }, src: e.key === ':' ? ':=' : e.key }); const inp = els.get(rg.id).querySelector('.src'); inp.setSelectionRange(inp.value.length, inp.value.length); recalcSoon(); }
    }
  }
});
let wasFree = FREE;
/* Right-click opens iCalPad's own menu. Text boxes keep the browser's menu (spelling, copy, paste),
   and Shift + right-click always gives the browser's menu. */
const pointAnchor = (x, y) => ({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }), contains: () => false, hasAttribute: () => false, setAttribute() { /* not a button */ } });
async function pasteHere(at) {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read(), imgs = [];
      for (const it of items) { const t = it.types.find(x => /^image\/(png|jpeg|gif|webp)$/.test(x)); if (t) imgs.push(await it.getType(t)); }
      if (imgs.length) { addPictures(imgs, at); return; }
    }
    const t = await navigator.clipboard.readText();
    if (t && t.trim()) pasteText(t, at); else toast('The clipboard is empty.');
  } catch (e) { toast('This browser blocked reading the clipboard. Press Ctrl+V (⌘V on a Mac) to paste.'); }
}
desk.addEventListener('contextmenu', e => {
  if (e.shiftKey || e.target.closest('input, textarea, select, .menu')) return;
  e.preventDefault();
  const anchor = pointAnchor(e.clientX, e.clientY), rgEl = e.target.closest('.rg');
  if (rgEl && region(rgEl.dataset.id)) { const rg = region(rgEl.dataset.id); if (S.active !== rg.id) setActive(rg.id, false); regionMenu(rg, anchor); return; }
  let at;
  if (FREE && e.target.closest('#rgs')) { const p = canvasPt(e); at = { x: Math.max(0, snap(p.x - 4)), y: Math.max(0, snap(p.y - 20)), room: false }; setActive(null); setCursor(at); }
  const here = FREE && at ? ' here' : '';
  openMenu(anchor, [
    { label: 'Add math' + here, act: () => addRegion('math', at ? { at } : {}) },
    { label: 'Add a note' + here, act: () => addRegion('text', at ? { at } : {}) },
    { label: 'Add a plot' + here, act: () => addRegion('plot', at ? { at } : {}) },
    { label: 'Add a picture' + here + '…', act: () => { S.pendingAt = at || null; $('#f-img').click(); } },
    { label: 'Add a sketch' + here, act: () => addRegion('sketch', at ? { at } : {}) },
    '-',
    ...(navigator.clipboard && navigator.clipboard.readText ? [{ label: 'Paste' + here, kbd: 'Ctrl V', act: () => pasteHere(at) }] : []),
    { label: 'Undo', kbd: 'Ctrl Z', act: undo }, { label: 'Redo', act: redo },
    '-',
    { label: 'Copy the page as LaTeX', act: () => copyText(latexDoc(), 'LaTeX') },
  ]);
});
/* A stylus such as Apple Pencil: draws on a selected picture, and fingers no longer draw (palm rejection). */
function markPen() { if (!S.penSeen) { S.penSeen = true; document.body.classList.add('pen-mode'); } }
for (const t of ['pointerdown', 'pointermove']) document.addEventListener(t, e => { if (e.pointerType === 'pen') markPen(); }, { capture: true, passive: true });
window.addEventListener('resize', () => { closeMenu(); if (!narrow() !== wasFree) { wasFree = !narrow(); renderAll(); } });
if (window.ResizeObserver) new ResizeObserver(() => { for (const P of plots.values()) draw(P); }).observe($('#sheet'));

// ---------- start ----------
async function start(hot) {
  Object.assign(S.set, LS.get('icalpad.set') || {});
  applyTheme(); syncSolver();
  toggleSide(narrow() ? false : LS.get('icalpad.side') === true);
  await Promise.race([DB.open(), new Promise(r => setTimeout(r, 1200))]);
  let doc = null;
  try { doc = hot && hot.doc ? cleanDoc(hot.doc) : null; } catch (e) { doc = null; }
  if (!doc) { try { const saved = (await DB.get('doc')) || LS.get('icalpad.doc'); doc = saved ? cleanDoc(saved) : null; } catch (e) { doc = null; } }
  loadDoc(doc && doc.regions.length ? doc : docFrom(EXAMPLES[0].s, EXAMPLES[0].title), true);
  if (LS.get('icalpad.adv') === true) advStart();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.doc.auto && S.hpos <= 0) { autoLayout(); persist(); } for (const P of plots.values()) { P.range = null; draw(P); } });
}
const hotApi = window.claude && window.claude.hot;
if (hotApi && hotApi.snapshot) hotApi.snapshot(() => ({ doc: S.doc }));
if (hotApi && hotApi.ready) hotApi.ready(start); else start((hotApi && hotApi.data) || {});
window.iCalPad = { state: S, Core, Adv };
})();
