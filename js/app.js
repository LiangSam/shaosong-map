/* 绍宋舆图 — 主程序 */
(function () {
  'use strict';
  const { T, FACTIONS, CITIES, FILL, INIT, PHASES } = window.SS_WORLD;
  const ALL = window.SS_EVENTS;
  const PEOPLE = window.SS_PEOPLE;
  const CHAPTERS = window.SS_CHAPTERS;
  const GEO = window.SS_GEO;
  const NS = 'http://www.w3.org/2000/svg';

  const svgIcon = (body) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const TYPES = {
    // 双剑
    war: { n: '战事', g: '战', v: 'var(--t-war)', icon: svgIcon('<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4M7 17l-3 3M3 19l2 2"/>') },
    // 诏书卷轴
    court: { n: '朝政', g: '政', v: 'var(--t-court)', icon: svgIcon('<path d="M15 12h-5M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>') },
    // 人像
    people: { n: '人事', g: '人', v: 'var(--t-people)', icon: svgIcon('<circle cx="12" cy="7.5" r="3.8"/><path d="M4.5 21v-1.5a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5V21"/>') },
    // 双环相扣：结盟
    diplo: { n: '外交', g: '盟', v: 'var(--t-diplo)', icon: svgIcon('<circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/>') },
    // 宫殿屋檐
    life: { n: '宫闱', g: '宫', v: 'var(--t-life)', icon: svgIcon('<path d="M2.5 9.5 12 4l9.5 5.5"/><path d="M4 9.5c.5 1 1.2 1.5 2.5 1.5h11c1.3 0 2-.5 2.5-1.5"/><path d="M6 11v9M18 11v9M3 20h18"/><path d="M10 20v-4.5h4V20"/>') },
  };
  const VOLS = [
    { n: '第一卷', s: '淮上' }, { n: '第二卷', s: '南阳' }, { n: '第三卷', s: '尧山' },
    { n: '第四卷', s: '白马·西夏' }, { n: '第五卷', s: '北伐' }, { n: '第六卷', s: '获鹿' },
  ];
  const T0 = T(1, 7), T1 = T(10, 8);

  // ── 小工具 ──
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式等情况下忽略 */ } },
  };
  const DIG = '〇一二三四五六七八九';
  function cn(n) {
    if (n <= 10) return n === 10 ? '十' : DIG[n];
    if (n < 20) return '十' + DIG[n - 10];
    return DIG[Math.floor(n / 10)] + '十' + (n % 10 ? DIG[n % 10] : '');
  }
  const yearName = (y) => '建炎' + (y === 1 ? '元' : cn(y)) + '年';
  const MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  const ymOf = (t) => ({ y: Math.floor(t / 12) + 1, m: Math.floor(t % 12) });
  const chKey = (ch) => ch[0] * 1000 + ch[1];
  const ll = (p) => [p[1], p[0]];
  const facColor = (f) => (FACTIONS[f] || FACTIONS.none).color;

  // ── 阅读进度 / 防剧透 ──
  let progress = store.get('ss-progress'); // {v,c} | 'all' | null
  const canSee = (ch) => !progress || progress === 'all' || chKey(ch) <= chKey([progress.v, progress.c]);
  let EV = [];
  const state = { idx: 0, t: T0, playing: false, timer: null, style: store.get('ss-style') || 'yutu', layers: Object.assign({ terr: true, relief: true, water: true, cities: true, emp: true, marks: true }, store.get('ss-layers') || {}) };

  function refreshVisible() {
    EV = ALL.filter((e) => canSee(e.ch));
    const lbl = $('#progressLabel');
    if (!progress || progress === 'all') lbl.textContent = progress === 'all' ? '全书可见' : '阅读进度';
    else lbl.textContent = `读至 ${VOLS[progress.v - 1].n}·第${progress.c}章`;
    const reading = progress && progress !== 'all';
    $('#progressShort').textContent = reading ? `${cn(progress.v)}·${progress.c}` : '';
    $('#progressBtn').classList.toggle('has-short', !!reading);
    $('#nextChBtn').hidden = !progress || progress === 'all';
  }

  const narrow = () => matchMedia('(max-width: 860px)').matches;

  // ── 地图 ──
  const map = L.map('map', {
    zoomControl: false, minZoom: 4, maxZoom: 9, zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 100,
  }).setView([34.6, 113.2], 6);
  L.control.zoom({ position: 'topleft', zoomInTitle: '放大', zoomOutTitle: '缩小' }).addTo(map);
  // 手机竖排时地图占了大半屏：单指留给页面滚动，双指才移动、缩放地图
  const gestureHint = el('div', 'map-hint', '双指移动、缩放地图');
  map.getContainer().appendChild(gestureHint);
  function syncGestures() {
    const twoFinger = narrow() && navigator.maxTouchPoints > 0;
    if (twoFinger) map.dragging.disable(); else map.dragging.enable();
    map.getContainer().classList.toggle('two-finger', twoFinger);
  }
  syncGestures();
  let hintT = 0, hintStart = null;
  map.getContainer().addEventListener('touchstart', (ev) => {
    hintStart = ev.touches.length === 1 ? [ev.touches[0].clientX, ev.touches[0].clientY] : null;
    if (!hintStart) gestureHint.classList.remove('show');
  }, { passive: true });
  map.getContainer().addEventListener('touchmove', (ev) => {
    if (!hintStart || ev.touches.length !== 1 || map.dragging.enabled()) return;
    const dx = Math.abs(ev.touches[0].clientX - hintStart[0]), dy = Math.abs(ev.touches[0].clientY - hintStart[1]);
    // 横着拖说明是想移动地图而不是滚页面，这时才提示
    if (dx < 24 || dx < dy * 1.5) return;
    gestureHint.classList.add('show');
    clearTimeout(hintT); hintT = setTimeout(() => gestureHint.classList.remove('show'), 1600);
  }, { passive: true });

  map.attributionControl.setPrefix(false).addAttribution('底图 Natural Earth · 晕渲 © Esri · 疆域为示意');

  const pane = (name, z) => { const p = map.createPane(name); p.style.zIndex = z; return p; };
  pane('base', 150); pane('water', 300); pane('border', 330); pane('paths', 360); pane('labels', 450); pane('flag', 590);
  map.getPane('labels').style.pointerEvents = 'none';
  const R = (p) => L.svg({ pane: p, padding: 0.35 }).addTo(map);
  const rBase = R('base'), rWater = R('water'), rBorder = R('border'), rPaths = R('paths');

  // 淡墨晕渲：瓦片加载时就把灰度地形图换算成“墨色 + 透明度”画进 canvas。
  // 黑色按 (1 − 亮度) 的透明度盖上去，结果与正片叠底相同，但之后拖动、缩放时不需要任何实时混合或滤镜。
  const INK = { light: { c: [86, 60, 32], k: 0.92, max: 0.78 }, dark: { c: [228, 216, 192], k: 0.34, max: 0.4 } };
  const inkLayers = [];
  const InkRelief = L.TileLayer.extend({
    createTile(coords, done) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // willReadFrequently：用内存画布而不是显卡画布，避免逐张瓦片回读像素、再占一份显存
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 256, 256);
        try {
          const ink = INK[document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light'];
          const d = ctx.getImageData(0, 0, 256, 256), px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
            const a = Math.min(ink.max, Math.max(0, (1 - lum * 1.1) * ink.k));
            px[i] = ink.c[0]; px[i + 1] = ink.c[1]; px[i + 2] = ink.c[2]; px[i + 3] = a * 255;
          }
          ctx.putImageData(d, 0, 0);
        } catch (e) { cv.style.opacity = 0.35; /* 读不到像素（跨域受限）时退回半透明原图 */ }
        done(null, cv);
      };
      img.onerror = (e) => done(e, cv);
      img.src = this.getTileUrl(coords);
      return cv;
    },
  });
  window.SS_INK_RELIEF = (opt) => { const l = new InkRelief('https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', opt); inkLayers.push(l); return l; };
  const relief = window.SS_INK_RELIEF({ maxNativeZoom: 13, maxZoom: 9, updateWhenZooming: false, keepBuffer: 3 });

  // 陆地（同时作为疆域裁剪路径）；先画一圈海岸晕线
  const landLL = GEO.land.map((poly) => poly.map((ring) => ring.map(ll)));
  L.polygon(landLL, { renderer: rBase, className: 'coast-halo h2', fill: false, interactive: false, smoothFactor: 3 }).addTo(map);
  L.polygon(landLL, { renderer: rBase, className: 'coast-halo', fill: false, interactive: false, smoothFactor: 1.2 }).addTo(map);
  const land = L.polygon(landLL, { renderer: rBase, className: 'land-shape', interactive: false, smoothFactor: 1.2 }).addTo(map);
  land._path.id = 'landpath';
  const svgDefs = (renderer, html) => {
    const svg = renderer._container;
    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
    defs.insertAdjacentHTML('beforeend', html);
  };
  svgDefs(rBase, '<clipPath id="landclip"><use href="#landpath"/></clipPath>');

  // 水系
  const water = L.layerGroup();
  GEO.rivers.forEach((r) => {
    const w = r.r <= 3 ? 1.9 : r.r <= 5 ? 1.3 : 0.9;
    L.polyline(r.c.map(ll), { renderer: rWater, className: 'river', weight: w, interactive: false, smoothFactor: 1.5 }).addTo(water);
  });
  GEO.lakes.forEach((k) => L.polygon(k.c.map(ll), { renderer: rWater, className: 'lake', interactive: false }).addTo(water));
  GEO.customLakes.forEach((k) => L.polygon(k.c.map(ll), { renderer: rWater, className: 'lake', interactive: false }).addTo(water));
  GEO.custom.forEach((c) => {
    const cls = c.t === 'he' ? 'river river-he' : c.t === 'canal' ? 'canal' : 'river';
    L.polyline(c.c.map(ll), { renderer: rWater, className: cls, weight: c.t === 'he' ? 2.6 : c.t === 'canal' ? 1.4 : 1.9, interactive: false }).addTo(water);
  });
  const GEO_LABELS = [
    ['太行山', 113.55, 37.3, 'geo'], ['秦　岭', 108.4, 33.75, 'geo'], ['燕　山', 117.6, 40.65, 'geo'], ['阴　山', 110.3, 41.3, 'geo'],
    ['贺兰山', 105.85, 38.95, 'geo small'], ['横　山', 108.6, 37.55, 'geo small'], ['中条山', 111.05, 35.1, 'geo small'], ['伏牛山', 111.9, 33.65, 'geo small'],
    ['大别山', 115.6, 31.2, 'geo small'], ['六盘山', 106.25, 35.75, 'geo small'], ['吕梁山', 111.15, 37.2, 'geo small'], ['长白山', 128.0, 42.0, 'geo small'],
    ['黄　河', 112.2, 34.98, 'water'], ['黄　河', 107.6, 40.7, 'water'], ['淮　河', 116.2, 32.42, 'water'], ['长　江', 116.5, 29.95, 'water'],
    ['汉　水', 112.4, 31.3, 'water'], ['渭　水', 107.9, 34.42, 'water'], ['汾　水', 111.95, 36.95, 'water'], ['汴　河', 116.1, 34.2, 'water'],
    ['梁山泊', 116.45, 35.72, 'water'], ['洞庭湖', 112.9, 29.25, 'water'], ['鄱阳湖', 116.35, 29.05, 'water'], ['太　湖', 120.25, 31.18, 'water'],
  ];
  const geoLabels = L.layerGroup();
  GEO_LABELS.forEach(([n, x, y, k]) => {
    const cls = k.startsWith('water') ? 'lbl lbl-water' : 'lbl lbl-geo ' + (k.includes('small') ? 'small' : '');
    L.marker([y, x], { pane: 'labels', interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="${cls}">${n}</div>` }) }).addTo(geoLabels);
  });

  // ── 疆域：州府控制点 → Voronoi → 按势力合并 ──
  const PTS = [];
  CITIES.forEach(([n, x, y, rg, lv]) => PTS.push({ n, x, y, rg, lv }));
  FILL.forEach(([rg, list]) => list.forEach(([x, y]) => PTS.push({ n: null, x, y, rg, lv: 0 })));
  const crs = L.CRS.EPSG3857;
  const proj = PTS.map((p) => { const q = crs.project(L.latLng(p.y, p.x)); return [q.x, -q.y]; });
  const bA = crs.project(L.latLng(12, 80)), bB = crs.project(L.latLng(58, 146));
  const delaunay = d3.Delaunay.from(proj);
  const vor = delaunay.voronoi([bA.x, -bB.y, bB.x, -bA.y]);
  const unp = ([x, y]) => { const q = crs.unproject(L.point(x, -y)); return [q.lat, q.lng]; };
  // 把 Voronoi 的直线边改成自然起伏的曲线：同一条边对两侧的格子生成完全相同的点，不会出现缝隙
  const frac = (v) => v - Math.floor(v);
  function wobble(p, q) {
    const swap = p[0] > q[0] || (p[0] === q[0] && p[1] > q[1]);
    const a = swap ? q : p, b = swap ? p : q;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 4000) return [];
    const nx = -dy / len, ny = dx / len;
    const r = (v) => Math.round(v / 10);
    const h = frac(Math.sin(r(a[0]) * 0.0129898 + r(a[1]) * 0.078233 + r(b[0]) * 0.037719 + r(b[1]) * 0.011135) * 43758.5453);
    const n = Math.min(8, Math.max(3, Math.round(len / 30000)));
    const amp = Math.min(len * 0.09, 22000);
    const out = [];
    for (let k = 1; k < n; k++) {
      const t = k / n, env = Math.sin(Math.PI * t);
      const d = amp * env * (0.65 * Math.sin(2 * Math.PI * (t * 1.3 + h)) + 0.35 * Math.sin(2 * Math.PI * (t * 3.1 + h * 1.7)));
      out.push([a[0] + dx * t + nx * d, a[1] + dy * t + ny * d]);
    }
    return swap ? out.reverse() : out;
  }
  const RAW = PTS.map((_, i) => { const poly = vor.cellPolygon(i); return poly ? poly.slice(0, -1) : []; });
  const GEOM = {
    straight: { cells: RAW.map((c) => c.map(unp)), edges: [] },
    organic: { cells: RAW.map((c) => c.flatMap((pt, k) => [pt, ...wobble(pt, c[(k + 1) % c.length])]).map(unp)), edges: [] },
  };
  (function buildEdges() {
    const key = (p) => Math.round(p[0]) + ',' + Math.round(p[1]);
    for (let i = 0; i < PTS.length; i++) {
      const ks = new Map(RAW[i].map((p) => [key(p), p]));
      for (const j of delaunay.neighbors(i)) {
        if (j <= i) continue;
        const shared = [];
        for (const p of RAW[j]) { const k = key(p); if (ks.has(k) && !shared.some((q) => key(q) === k)) shared.push(p); }
        if (shared.length < 2) continue;
        const [a, b] = shared;
        GEOM.straight.edges.push({ i, j, line: [a, b].map(unp) });
        GEOM.organic.edges.push({ i, j, line: [a, ...wobble(a, b), b].map(unp) });
      }
    }
  })();
  const geom = () => GEOM[state.style === 'classic' ? 'straight' : 'organic'];

  const regionFac = (rg) => (INIT[rg] || 'none');
  function territoryAt(t) {
    const fac = PTS.map((p) => regionFac(p.rg));
    let note = '建炎元年秋：靖康之后，河北、河东大半已陷于金';
    for (const ph of PHASES) {
      if (ph.t > t) break;
      if (ph.ch && !canSee(ph.ch)) continue;
      for (const [k, f] of Object.entries(ph.set)) {
        if (INIT[k] !== undefined) PTS.forEach((p, i) => { if (p.rg === k) fac[i] = f; });
        else PTS.forEach((p, i) => { if (p.n === k) fac[i] = f; });
      }
      note = ph.note;
    }
    return { fac, note };
  }

  const terrPaths = {};
  Object.keys(FACTIONS).forEach((f) => {
    if (f === 'none') return;
    terrPaths[f] = L.polygon([], { renderer: rBase, smoothFactor: 1.5, className: 'terr', fillColor: FACTIONS[f].color, fill: true, stroke: false, fillOpacity: 1, interactive: false });
  });
  // 边界色带：沿势力边界画宽线，并裁到本势力范围内，只露出内侧一半
  const ribbons = {};
  Object.keys(terrPaths).forEach((f) => {
    ribbons[f] = [
      L.polyline([], { renderer: rBase, smoothFactor: 1.5, className: 'ribbon ribbon-wide', color: FACTIONS[f].color, interactive: false }),
      L.polyline([], { renderer: rBase, smoothFactor: 1.5, className: 'ribbon ribbon-core', color: FACTIONS[f].color, interactive: false }),
    ];
  });
  svgDefs(rBase, Object.keys(terrPaths).map((f) => `<clipPath id="clip-${f}" clip-path="url(#landclip)"><use href="#terr-${f}"/></clipPath>`).join(''));
  const flash = L.polygon([], { renderer: rBase, className: 'terr-flash', stroke: false, interactive: false });
  const borders = L.polyline([], { renderer: rBorder, smoothFactor: 1.5, className: 'border-line', interactive: false });
  const facLabels = L.layerGroup();
  let curFac = null;

  function drawTerritory(t, animate) {
    const { fac, note } = territoryAt(t);
    const { cells: CELLS, edges: EDGES } = geom();
    const groups = {};
    fac.forEach((f, i) => { if (f !== 'none' && CELLS[i].length) (groups[f] = groups[f] || []).push([CELLS[i]]); });
    Object.entries(terrPaths).forEach(([f, layer]) => {
      layer.setLatLngs(groups[f] || []);
      if (layer._path) { layer._path.id = 'terr-' + f; layer._path.setAttribute('clip-path', 'url(#landclip)'); }
    });
    const live = EDGES.filter((e) => fac[e.i] !== fac[e.j] && fac[e.i] !== 'none' && fac[e.j] !== 'none');
    Object.entries(ribbons).forEach(([f, pair]) => {
      const segs = live.filter((e) => fac[e.i] === f || fac[e.j] === f).map((e) => e.line);
      pair.forEach((l) => { l.setLatLngs(segs); if (l._path) l._path.setAttribute('clip-path', `url(#clip-${f})`); });
    });
    // 新变化的区域闪烁提示
    if (curFac && animate) {
      const changed = [];
      fac.forEach((f, i) => { if (f !== curFac[i] && CELLS[i].length) changed.push([CELLS[i]]); });
      flash.setLatLngs(changed);
      if (flash._path) {
        flash._path.setAttribute('clip-path', 'url(#landclip)');
        flash._path.style.fill = changed.length ? facColor(fac[fac.findIndex((f, i) => f !== curFac[i])]) : 'none';
        flash._path.classList.remove('go'); flash._path.getBoundingClientRect(); flash._path.classList.add('go');
      }
    }
    curFac = fac;
    borders.setLatLngs(live.map((e) => e.line));
    if (borders._path) borders._path.setAttribute('clip-path', 'url(#landclip)');
    // 势力大字
    facLabels.clearLayers();
    const acc = {};
    PTS.forEach((p, i) => {
      const f = fac[i];
      if (f === 'none' || p.x < 92 || p.x > 131 || p.y < 21 || p.y > 47.5) return;
      const a = (acc[f] = acc[f] || { x: 0, y: 0, n: 0 }); a.x += p.x; a.y += p.y; a.n++;
    });
    Object.entries(acc).forEach(([f, a]) => {
      if (a.n < 3 || f === 'jp') return;
      const name = f === 'song' ? '大宋' : f === 'jin' ? '大金' : FACTIONS[f].name;
      L.marker([a.y / a.n, a.x / a.n], { pane: 'labels', interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="lbl lbl-faction" style="color:${FACTIONS[f].color}">${name}</div>` }) }).addTo(facLabels);
    });
    // 城市点颜色
    cityMarkers.forEach(({ i, m }) => { const d = m.getElement(); if (d) d.querySelector('i').style.setProperty('--fc', fac[i] === 'none' ? 'var(--land)' : FACTIONS[fac[i]].color); });
    renderMapLegend(fac, note);
    return note;
  }

  // 城市
  const PLACES_NOW = window.SS_PLACES_NOW || {};
  const nowOf = (place) => { const k = Object.keys(PLACES_NOW).filter((n) => place.includes(n)).sort((a, b) => b.length - a.length)[0]; return k ? PLACES_NOW[k] : ''; };
  const cities = L.layerGroup();
  const cityMarkers = [];
  PTS.forEach((p, i) => {
    if (!p.n || p.lv < 1) return;
    const now = PLACES_NOW[p.n];
    const m = L.marker([p.y, p.x], { pane: 'labels', interactive: !!now, keyboard: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="lbl lbl-city ${p.lv === 2 ? 'major' : 'minor'}${now ? ' has-now' : ''}"><i></i>${p.n}</div>` }) });
    if (now) m.bindTooltip(`<b>${p.n}</b> · 今${now}`, { className: 'ev-tip', direction: 'top', offset: [0, -10] });
    m.addTo(cities); cityMarkers.push({ i, m });
  });

  // 行在路线 / 行军路线 / 事件标记
  const empGlow = L.polyline([], { renderer: rPaths, className: 'emp-path-glow', interactive: false });
  const empLine = L.polyline([], { renderer: rPaths, className: 'emp-path', interactive: false });
  const empRecent = L.polyline([], { renderer: rPaths, className: 'emp-path emp-path-recent', interactive: false });
  const flagIcon = L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="emp-flag"><svg viewBox="0 0 30 36"><path d="M5 2v33" stroke="currentColor" stroke-width="2" style="color:var(--ink)"/><path d="M6 3h20l-5 6 5 6H6z" fill="var(--accent)"/><text x="15" y="12.5" font-size="8" text-anchor="middle" fill="#fff" font-family="serif">纛</text></svg><span>行在</span></div>' });
  const flag = L.marker([0, 0], { pane: 'flag', icon: flagIcon, interactive: false });
  const routes = L.layerGroup();
  const marks = L.layerGroup();
  const markById = {};

  svgDefs(rPaths, Object.entries(FACTIONS).filter(([k]) => k !== 'none').map(([k, f]) =>
    `<marker id="arr-${k}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${f.color}"/></marker>`).join(''));

  function buildMarks() {
    marks.clearLayers();
    Object.keys(markById).forEach((k) => delete markById[k]);
    EV.forEach((e, i) => {
      const ty = TYPES[e.type];
      const m = L.marker(ll(e.at), { icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="ev-mark" style="--c:${ty.v}">${ty.icon}</div>` }), riseOnHover: true, keyboard: false });
      m.bindTooltip(`${e.date} · ${e.title}`, { className: 'ev-tip', direction: 'top', offset: [0, -14] });
      m.on('click', () => select(i, { fly: false }));
      markById[e.id] = m;
    });
  }

  function empPositions(uptoIdx) {
    const pts = [];
    for (let i = 0; i <= uptoIdx; i++) {
      const e = EV[i];
      const p = e.emp === true ? e.at : Array.isArray(e.emp) ? e.emp : null;
      if (!p) continue;
      const last = pts[pts.length - 1];
      if (!last || Math.abs(last[0] - p[0]) + Math.abs(last[1] - p[1]) > 0.05) pts.push(p);
    }
    return pts.map(ll);
  }

  function drawDynamic(e, i) {
    // 事件标记：已发生的淡显，当前的高亮
    marks.eachLayer((m) => marks.removeLayer(m));
    EV.forEach((x, j) => {
      if (j > i) return;
      const m = markById[x.id];
      m.addTo(marks);
      const d = m.getElement();
      if (d) { d.firstChild.classList.toggle('now', j === i); d.firstChild.classList.toggle('recent', j !== i && i - j <= 3); }
      m.setZIndexOffset(j === i ? 1000 : j);
    });
    // 行在
    const ep = empPositions(i);
    const tail = ep.slice(-4);
    empLine.setLatLngs(ep); empGlow.setLatLngs(tail); empRecent.setLatLngs(tail);
    if (ep.length) flag.setLatLng(ep[ep.length - 1]);
    // 行军箭头
    routes.clearLayers();
    (e.routes || []).forEach((r) => {
      const pl = L.polyline(r.pts.map(ll), { renderer: rPaths, className: 'route', color: facColor(r.f), weight: 3.2, interactive: false }).addTo(routes);
      if (pl._path) pl._path.setAttribute('marker-end', `url(#arr-${r.f})`);
    });
  }

  function applyLayers() {
    const L_ = state.layers;
    const tog = (on, layer) => { if (on && !map.hasLayer(layer)) layer.addTo(map); if (!on && map.hasLayer(layer)) map.removeLayer(layer); };
    tog(L_.relief, relief);
    Object.values(terrPaths).forEach((p) => tog(L_.terr, p));
    Object.values(ribbons).forEach((pair) => pair.forEach((l) => tog(L_.terr, l)));
    tog(L_.terr, flash); tog(L_.terr, borders); tog(L_.terr, facLabels);
    tog(L_.water, water); tog(L_.water, geoLabels);
    tog(L_.cities, cities);
    tog(L_.emp, empGlow); tog(L_.emp, empLine); tog(L_.emp, empRecent); tog(L_.emp, flag);
    tog(L_.marks, marks);
    routes.addTo(map);
    store.set('ss-layers', L_);
  }

  function zoomClass() {
    const z = map.getZoom(), c = map.getContainer();
    c.classList.toggle('zoom-low', z < 5.5);
    c.classList.toggle('zoom-mid', z >= 5.5 && z < 6.5);
  }
  map.on('zoomend', zoomClass);

  // ── 地图左下图例 ──
  const legend = $('#mapLegend');
  map.getContainer().appendChild(legend);
  map.getContainer().appendChild($('#cartouche'));
  L.DomEvent.disableClickPropagation(legend);
  function renderMapLegend(fac, note) {
    const present = new Set(fac);
    const order = ['song', 'jin', 'qi', 'xia', 'xl', 'mg'];
    legend.innerHTML = order.filter((f) => present.has(f)).map((f) => `<span class="lg"><span class="sw" style="--c:${FACTIONS[f].color}"></span>${FACTIONS[f].name}</span>`).join('') +
      `<span class="lg lg-route"><svg width="22" height="8"><path d="M1 4h20" stroke="var(--accent)" stroke-width="2.4" stroke-dasharray="1 5" stroke-linecap="round"/></svg>行在路线</span>` +
      `<span class="phase">疆域 · ${esc(note)}</span>`;
  }

  // 文字变了才换，并带一个轻微的“换字”动效
  function flipText(node, txt) {
    if (node.textContent === txt) return;
    node.textContent = txt;
    node.classList.remove('flip'); void node.offsetWidth; node.classList.add('flip');
  }

  // ── 选中事件 ──
  function select(i, opt = {}) {
    if (!EV.length) return;
    i = Math.max(0, Math.min(EV.length - 1, i));
    const e = EV[i];
    const prevT = state.t, moved = i !== state.idx;
    state.idx = i; state.t = e.t;
    const { y, m } = ymOf(e.t);
    $('#nowEra').textContent = yearName(y) + ' ' + MONTHS[m];
    $('#nowSub').textContent = '公元 ' + (1126 + y) + ' 年';
    flipText($('#cartYear'), yearName(y));
    flipText($('#cartMonth'), MONTHS[m]);
    flipText($('#cartAd'), '公元' + (1126 + y));
    drawTerritory(e.t, prevT !== e.t);
    drawDynamic(e, i);
    renderEvent();
    if (moved && !narrow()) $('#eventBody').scrollTop = 0;
    renderOffices();
    markListActive();
    drawHead();
    if (opt.fly !== false) flyTo(e);
    try { history.replaceState(null, '', '#e=' + e.id); } catch (err) { /* file:// 下可能不允许 */ }
  }

  function flyTo(e) {
    const target = L.latLng(ll(e.at));
    let b = L.latLngBounds([target]);
    (e.routes || []).forEach((r) => r.pts.forEach((p) => b.extend(ll(p))));
    map.stop();
    const view = map.getBounds().pad(-0.18);
    if (view.contains(b)) return;
    if (e.routes && e.routes.length) map.flyToBounds(b.pad(0.25), { maxZoom: Math.max(map.getZoom(), 6.5), duration: 0.9 });
    else map.flyTo(target, Math.max(map.getZoom(), narrow() ? 5 : 5.75), { duration: 0.9 });
  }

  // ── 侧栏：纪事 ──
  const peopleIdx = Object.fromEntries(PEOPLE.map((p) => [p.n, p]));
  function chapterRef(ch) {
    const title = (CHAPTERS[ch[0] - 1] || [])[ch[1] - 1] || '';
    return `${VOLS[ch[0] - 1].n} 第${ch[1]}章${title ? '《' + esc(title) + '》' : ''}`;
  }
  function renderEvent() {
    const e = EV[state.idx];
    const body = $('#eventBody');
    if (!e) { body.innerHTML = '<p class="muted">暂无可显示的事件。</p>'; return; }
    const ty = TYPES[e.type];
    const prev = EV[state.idx - 1], next = EV[state.idx + 1];
    const hiddenAfter = ALL.length - EV.length;
    const ppl = (e.people || []).map((n) => {
      const p = peopleIdx[n];
      const known = p && canSee(p.first);
      return `<button class="chip ${known ? 'person' : ''}" data-person="${known ? esc(n) : ''}" style="--c:${facColor(p ? p.f : 'none')}">${known ? '<i></i>' : ''}${esc(n)}</button>`;
    }).join('');
    body.innerHTML = `
      <div class="ev-head"><b>${esc(e.date)}</b><span>公元 ${1126 + ymOf(e.t).y}</span></div>
      <h2 class="ev-title">${esc(e.title)}</h2>
      <div class="chips"><span class="chip type" style="--c:${ty.v}">${ty.icon}${ty.n}</span><span class="chip place"><span class="pin">📍</span>${esc(e.place)}${nowOf(e.place) ? `<em class="now">今${esc(nowOf(e.place))}</em>` : ''}</span></div>
      <p class="ev-sum">${annotate(e.sum)}</p>
      ${e.note ? `<p class="ev-note">${esc(e.note)}</p>` : ''}
      ${ppl ? `<div class="section-title">相关人物</div><div class="chips people">${ppl}</div>` : ''}
      ${battleFor(e) ? `<button class="sb-launch" data-battle="${battleFor(e).id}"><span>${TYPES.war.icon}</span><div><b>沙盘推演 · ${esc(battleFor(e).title)}</b><small>分 ${battleFor(e).phases.length} 步看懂这一仗怎么打</small></div><i>›</i></button>` : ''}
      <div class="ev-src"><span>原著：${chapterRef(e.ch)}</span><a class="ev-fix" target="_blank" rel="noopener" href="${fixUrl(e)}">纠错</a></div>
      <div class="ev-nav">
        <button data-go="${state.idx - 1}" ${prev ? '' : 'disabled'}><small>← 上一事</small>${prev ? esc(prev.title) : '—'}</button>
        <button data-go="${state.idx + 1}" ${next ? '' : 'disabled'}><small>下一事 →</small>${next ? esc(next.title) : (hiddenAfter ? '后文未读' : '全书终')}</button>
      </div>
      <div class="section-title">此时疆域</div>
      <div class="phase-box">${esc(territoryAt(e.t).note)}</div>
      ${!next && hiddenAfter ? `<div class="locked">还有 ${hiddenAfter} 件大事在你尚未读到的章节里。<br>读到后在右上角更新进度即可解锁。</div>` : ''}`;
    body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { stopPlay(); select(+b.dataset.go); }));
    body.querySelectorAll('[data-battle]').forEach((b) => b.addEventListener('click', () => { stopPlay(); window.SS_SANDBOX.open(b.dataset.battle); }));
    body.querySelectorAll('[data-person]').forEach((b) => b.dataset.person && b.addEventListener('click', () => showPerson(b.dataset.person)));
  }

  const REPO = 'https://github.com/LiangSam/shaosong-map';
  const fixUrl = (e) => `${REPO}/issues/new?title=${encodeURIComponent('[纠错] ' + e.title)}&body=${encodeURIComponent(`事件：${e.title}（${e.date}）\n原著：${VOLS[e.ch[0] - 1].n} 第${e.ch[1]}章\n\n哪里有误：\n\n正确的应该是（最好附章节）：\n`)}`;
  const battleFor = (e) => { const b = window.SS_SANDBOX && window.SS_SANDBOX.forEvent(e.id); return b && canSee(b.ch) ? b : null; };

  // ── 侧栏：年表 ──
  function renderList() {
    const body = $('#listBody');
    let html = '', curY = 0;
    const bs = (window.SS_SANDBOX ? window.SS_SANDBOX.list() : []).filter((b) => canSee(b.ch));
    const hiddenB = (window.SS_SANDBOX ? window.SS_SANDBOX.list().length : 0) - bs.length;
    if (bs.length || hiddenB) {
      html += `<div class="sb-list"><h3>沙盘推演</h3>${bs.map((b) => `<button data-battle="${b.id}"><span>${TYPES.war.icon}</span><div><b>${esc(b.title)}</b><small>${esc(b.date)} · ${b.phases.length} 步</small></div></button>`).join('')}${hiddenB ? `<p class="muted">还有 ${hiddenB} 场战役读到后解锁</p>` : ''}</div>`;
    }
    EV.forEach((e, i) => {
      const y = ymOf(e.t).y;
      if (y !== curY) { if (curY) html += '</div>'; curY = y; html += `<div class="yr"><h3>${yearName(y)}<small>${1126 + y}</small></h3>`; }
      html += `<div class="li" data-i="${i}" style="--c:${TYPES[e.type].v}"><i></i><div><b>${esc(e.title)}</b><span>${esc(e.date)} · ${esc(e.place)}</span></div></div>`;
    });
    if (curY) html += '</div>';
    const hidden = ALL.length - EV.length;
    if (hidden) html += `<div class="locked">之后还有 ${hidden} 件事已按阅读进度隐藏</div>`;
    body.innerHTML = html;
    body.querySelectorAll('.li').forEach((d) => d.addEventListener('click', () => { stopPlay(); select(+d.dataset.i); switchTab('event'); }));
    body.querySelectorAll('[data-battle]').forEach((b) => b.addEventListener('click', () => { stopPlay(); window.SS_SANDBOX.open(b.dataset.battle); }));
  }
  function markListActive() {
    document.querySelectorAll('#listBody .li').forEach((d) => d.classList.toggle('active', +d.dataset.i === state.idx));
    const a = $('#listBody .li.active');
    if (a && $('#listBody').classList.contains('active')) a.scrollIntoView({ block: 'nearest' });
  }

  // ── 侧栏：人物 ──
  let peopleFilter = 'all';
  const PF = [['all', '全部'], ['song', '宋'], ['jin', '金'], ['other', '伪齐·夏·辽·蒙']];
  function renderPeople() {
    $('#peopleFilters').innerHTML = PF.map(([k, n]) => `<button data-f="${k}" class="${k === peopleFilter ? 'on' : ''}">${n}</button>`).join('');
    $('#peopleFilters').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { peopleFilter = b.dataset.f; renderPeople(); }));
    const list = PEOPLE.filter((p) => canSee(p.first)).filter((p) => peopleFilter === 'all' || (peopleFilter === 'other' ? !['song', 'jin'].includes(p.f) : p.f === peopleFilter));
    const hiddenPeople = PEOPLE.filter((p) => !canSee(p.first)).length;
    $('#peopleList').innerHTML = list.map((p) => {
      const steps = p.steps.filter((s) => canSee([s[0], s[1]]));
      const more = p.steps.length - steps.length;
      const evs = EV.map((e, i) => [e, i]).filter(([e]) => (e.people || []).includes(p.n));
      return `<div class="person-card" id="p-${esc(p.n)}" style="--c:${facColor(p.f)}">
        <div class="p-seal">${esc(p.n.slice(-1))}</div>
        <div>
          <div class="p-name">${esc(p.n)}<small>${esc(p.g)}${p.aka ? ' · ' + esc(p.aka) : ''}</small></div>
          <p class="p-intro">${annotate(p.intro)}</p>
          ${steps.length ? `<ul class="p-steps">${steps.map((s) => `<li><em>卷${cn(s[0])}·${s[1]}</em>${annotate(s[2])}</li>`).join('')}</ul>` : ''}
          ${more ? `<div class="p-more">🔒 另有 ${more} 条后续经历，读到后解锁</div>` : ''}
          ${evs.length ? `<div class="p-evs">${evs.map(([e, i]) => `<button data-i="${i}">${esc(e.title)}</button>`).join('')}</div>` : ''}
          <a class="p-rel" href="renshi.html?view=graph&p=${encodeURIComponent(p.n)}">在朝野图中看关系 →</a>
        </div></div>`;
    }).join('') + (hiddenPeople ? `<div class="locked">还有 ${hiddenPeople} 位人物尚未登场</div>` : '');
    $('#peopleList').querySelectorAll('.p-evs button').forEach((b) => b.addEventListener('click', () => { stopPlay(); select(+b.dataset.i); switchTab('event'); }));
  }
  function showPerson(name) {
    const p = peopleIdx[name];
    if (p && peopleFilter !== 'all' && !(peopleFilter === p.f || (peopleFilter === 'other' && !['song', 'jin'].includes(p.f)))) { peopleFilter = 'all'; renderPeople(); }
    switchTab('people');
    const card = document.getElementById('p-' + name);
    if (card) {
      document.querySelectorAll('.person-card.hl').forEach((c) => c.classList.remove('hl'));
      card.classList.add('hl');
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // ── 侧栏：图层 ──
  function renderLayers() {
    const items = [['terr', '疆域', '依原著情节推算的势力范围（示意）'], ['relief', '地形晕渲', '山川地势，看清太行、关中、秦岭'], ['water', '河流水系', '含北宋末黄河故道、汴河、梁山泊'], ['cities', '州府城市', '城点颜色随归属变化'], ['emp', '行在路线', '赵玖（御驾）十年间的行迹'], ['marks', '事件标记', '已发生的事件']];
    $('#layersBody').innerHTML = `<div class="section-title" style="margin-top:0">界面风格</div><div class="seg" role="radiogroup">${[['yutu', '舆图'], ['classic', '旧版']].map(([k, n]) => `<button role="radio" aria-checked="${state.style === k}" class="${state.style === k ? 'on' : ''}" data-style="${k}">${n}</button>`).join('')}</div>` + items.map(([k, n, s]) => `<div class="toggle ${state.layers[k] ? 'on' : ''}" data-k="${k}" role="switch" aria-checked="${!!state.layers[k]}" tabindex="0"><span>${n}<small>${s}</small></span><span class="switch"></span></div>`).join('') +
      `<div class="section-title">势力</div><div class="legend-list">${['song', 'jin', 'qi', 'xia', 'xl', 'mg', 'tb', 'dl', 'gl'].map((f) => `<div><i style="--c:${FACTIONS[f].color}"></i>${FACTIONS[f].full}</div>`).join('')}</div>
      <div class="section-title">事件类型</div><div class="legend-list">${Object.values(TYPES).map((t) => `<div><i class="sq" style="--c:${t.v}">${t.icon}</i>${t.n}</div>`).join('')}</div>
      <div class="about">
        <p>依据榴弹怕水《绍宋》原著整理，时间以小说内的建炎年号为准，月份为农历。事件摘要为转述，便于对照阅读；疆域按情节推算各州府归属后生成，仅为示意，并非精确的史实边界。</p>
        <p><button type="button" class="linklike" id="aboutGuide">新读者导读：三分钟看懂背景 →</button></p>
        <p>快捷键：← → 切换事件，空格播放，<kbd>/</kbd> 搜索。</p>
        <p>发现错漏？欢迎到 <a href="${REPO}/issues" target="_blank" rel="noopener">GitHub</a> 提出，最好附上原著章节。</p>
      </div>`;
    $('#aboutGuide').addEventListener('click', () => openGuide());
    $('#layersBody').querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)));
    $('#layersBody').querySelectorAll('.toggle').forEach((t) => {
      const flip = () => { state.layers[t.dataset.k] = !state.layers[t.dataset.k]; applyLayers(); renderLayers(); if (state.layers.marks || state.layers.terr) select(state.idx, { fly: false }); };
      t.addEventListener('click', flip);
      t.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); flip(); } });
    });
  }

  function setStyle(st) {
    state.style = st;
    document.documentElement.dataset.style = st;
    store.set('ss-style', st);
    curFac = null;
    renderLayers();
    select(state.idx, { fly: false });
  }

  // ── 标签页 ──
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    document.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('active', b.dataset.body === name));
    $('.tabs').style.setProperty('--ti', [...document.querySelectorAll('.tab')].findIndex((t) => t.dataset.tab === name));
    if (name === 'list') markListActive();
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // ── 时间轴 ──
  const svg = $('#tlSvg');
  let TW = 0, TH = 0;
  const PAD = 18;
  const xOf = (t) => PAD + ((t - T0) / (T1 - T0)) * (TW - 2 * PAD);
  const tOf = (x) => T0 + ((x - PAD) / (TW - 2 * PAD)) * (T1 - T0);
  const maxT = () => (EV.length ? EV[EV.length - 1].t : T0);
  const readVol = () => (progress === 'all' ? 6 : progress ? progress.v : 0);
  function volRanges() {
    const r = [];
    ALL.forEach((e) => { const v = e.ch[0]; r[v] = r[v] || [e.t, e.t]; r[v][0] = Math.min(r[v][0], e.t); r[v][1] = Math.max(r[v][1], e.t); });
    return r;
  }
  function drawTimeline() {
    const box = $('#tlTrack').getBoundingClientRect();
    TW = box.width; TH = box.height;
    if (!TW) return;
    svg.setAttribute('viewBox', `0 0 ${TW} ${TH}`);
    const small = TW < 640;
    let s = `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--paper)"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--line-2)" stroke-width="2"/></pattern></defs>`;
    for (let y = 1; y <= 10; y++) {
      const a = xOf(Math.max(T0, (y - 1) * 12)), b = xOf(Math.min(T1, y * 12));
      if (y % 2 === 0) s += `<rect class="tl-year-band" x="${a}" y="0" width="${b - a}" height="${TH}"/>`;
      const label = small ? (y === 1 ? '元' : cn(y)) : yearName(y).replace('建炎', '');
      s += `<text class="tl-year-lbl" x="${(a + b) / 2}" y="16" text-anchor="middle">${label}</text>`;
      if (!small) s += `<text class="tl-ad" x="${(a + b) / 2}" y="29" text-anchor="middle">${1126 + y}</text>`;
    }
    const vr = volRanges();
    const vy = TH - 22;
    vr.forEach((r, v) => {
      if (!r) return;
      const a = xOf(r[0]) - 3, b = xOf(r[1]) + 3;
      s += `<rect class="tl-vol" x="${a}" y="${vy}" width="${Math.max(4, b - a)}" height="4" rx="2"/>`;
      if (b - a > 40) s += `<text class="tl-vol-lbl" x="${(a + b) / 2}" y="${vy + 16}" text-anchor="middle">${small ? cn(v) : '卷' + cn(v) + (v <= readVol() ? '·' + VOLS[v - 1].s : '')}</text>`;
    });
    s += `<line class="tl-axis" x1="${PAD}" x2="${TW - PAD}" y1="${TH / 2 + 4}" y2="${TH / 2 + 4}"/>`;
    EV.forEach((e, i) => {
      const x = xOf(e.t);
      s += `<line class="tl-tick" data-i="${i}" x1="${x}" x2="${x}" y1="${TH / 2 - 8}" y2="${TH / 2 + 16}" stroke="${TYPES[e.type].v}"/>`;
    });
    let lastEnd = -1e9;
    EV.forEach((e) => {
      if (!e.major) return;
      const x = xOf(e.t), w = e.major.length * 12 + 6;
      if (x - w / 2 < lastEnd || TW < 520) return;
      s += `<text class="tl-major" x="${x}" y="${TH / 2 - 13}" text-anchor="middle">${esc(e.major)}</text>`;
      lastEnd = x + w / 2;
    });
    if (EV.length < ALL.length) {
      const lx = xOf(maxT()) + 6;
      if (lx < TW - PAD) {
        s += `<rect class="tl-lock" x="${lx}" y="${34}" width="${TW - PAD - lx}" height="${TH - 34 - 28}" rx="4"/>`;
        if (TW - PAD - lx > 90) s += `<text class="tl-lock-lbl" x="${(lx + TW - PAD) / 2}" y="${TH / 2 + 8}" text-anchor="middle">未读 · 剧情已隐藏</text>`;
      }
    }
    s += `<g id="tlHead"><line class="tl-head" y1="4" y2="${TH - 26}"/><rect class="tl-knob" x="-6.5" y="${TH / 2 + 4 - 6.5}" width="13" height="13" rx="1.5" transform="rotate(45 0 ${TH / 2 + 4})"/></g>`;
    svg.innerHTML = s;
    drawHead._i = -1;
    svg.querySelectorAll('.tl-tick').forEach((t) => t.addEventListener('click', (ev) => { ev.stopPropagation(); stopPlay(); select(+t.dataset.i); }));
    drawHead();
  }
  function drawHead(tOverride) {
    const g = $('#tlHead');
    if (!g || !TW) return;
    const x = xOf(tOverride != null ? tOverride : state.t);
    g.style.transform = `translateX(${x}px)`;
    g.classList.toggle('drag', tOverride != null);
    if (drawHead._i !== state.idx || drawHead._n !== EV.length) {
      drawHead._i = state.idx; drawHead._n = EV.length;
      svg.querySelectorAll('.tl-tick').forEach((t) => t.classList.toggle('future', +t.dataset.i > state.idx));
    }
    svg.setAttribute('aria-valuetext', EV[state.idx] ? EV[state.idx].date + ' ' + EV[state.idx].title : '');
  }
  function idxAtT(t) {
    let k = 0;
    for (let i = 0; i < EV.length; i++) if (EV[i].t <= t + 1e-6) k = i;
    return k;
  }
  // 悬停 / 拖动时的提示：哪一天、哪件事
  const tlTip = el('div', 'tl-tip');
  tlTip.hidden = true;
  $('#tlTrack').appendChild(tlTip);
  function showTip(i) {
    const e = EV[i];
    if (!e) { tlTip.hidden = true; return; }
    tlTip.innerHTML = `<i style="background:${TYPES[e.type].v}"></i><small>${esc(e.date)}</small>${esc(e.title)}`;
    tlTip.hidden = false;
    const w = tlTip.offsetWidth;
    tlTip.style.left = Math.max(4, Math.min(TW - w - 4, xOf(e.t) - w / 2)) + 'px';
  }
  function nearestIdx(x, tol) {
    let best = -1, bd = tol;
    EV.forEach((e, i) => { const d = Math.abs(xOf(e.t) - x); if (d <= bd) { bd = d; best = i; } });
    return best;
  }
  let dragging = false;
  svg.addEventListener('pointerdown', (ev) => {
    if (ev.target.classList && ev.target.classList.contains('tl-tick')) return;
    dragging = true; svg.setPointerCapture(ev.pointerId); stopPlay(); scrub(ev);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (dragging) return scrub(ev);
    if (ev.pointerType === 'touch') return;
    showTip(nearestIdx(ev.clientX - svg.getBoundingClientRect().left, 7));
  });
  svg.addEventListener('pointerup', (ev) => { if (!dragging) return; dragging = false; scrub(ev, true); if (ev.pointerType === 'touch') tlTip.hidden = true; });
  svg.addEventListener('pointercancel', () => { dragging = false; tlTip.hidden = true; });
  svg.addEventListener('pointerleave', () => { if (!dragging) tlTip.hidden = true; });
  function scrub(ev, done) {
    const r = svg.getBoundingClientRect();
    const t = Math.max(T0, Math.min(maxT(), tOf(ev.clientX - r.left)));
    const i = idxAtT(t);
    if (i !== state.idx || done) select(i, { fly: !!done });
    drawHead(done ? null : t);
    showTip(i);
  }
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); stopPlay(); select(state.idx + (ev.key === 'ArrowRight' ? 1 : -1)); }
  });

  // ── 播放 ──
  const playIcon = $('#playIcon');
  function stopPlay() { state.playing = false; clearInterval(state.timer); $('#playBtn').classList.remove('playing'); playIcon.setAttribute('d', 'M8 5v14l11-7z'); $('#playBtn').setAttribute('aria-label', '播放'); }
  function startPlay() {
    if (state.idx >= EV.length - 1) select(0);
    state.playing = true; playIcon.setAttribute('d', 'M7 5h4v14H7zM13 5h4v14h-4z'); $('#playBtn').setAttribute('aria-label', '暂停');
    $('#playBtn').classList.add('playing');
    state.timer = setInterval(() => { if (state.idx >= EV.length - 1) return stopPlay(); select(state.idx + 1); }, 4200);
  }
  $('#playBtn').addEventListener('click', () => (state.playing ? stopPlay() : startPlay()));
  $('#prevBtn').addEventListener('click', () => { stopPlay(); select(state.idx - 1); });
  $('#nextBtn').addEventListener('click', () => { stopPlay(); select(state.idx + 1); });
  document.addEventListener('keydown', (ev) => {
    if (!$('#progressModal').hidden || document.body.classList.contains('sb-open') || /SELECT|INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (ev.key === 'ArrowRight') { stopPlay(); select(state.idx + 1); }
    else if (ev.key === 'ArrowLeft') { stopPlay(); select(state.idx - 1); }
    else if (ev.key === ' ' && document.activeElement.tagName !== 'BUTTON') { ev.preventDefault(); state.playing ? stopPlay() : startPlay(); }
  });

  // ── 阅读进度弹窗 ──
  const modal = $('#progressModal');
  let pickVol = 1;
  function openModal() {
    pickVol = progress && progress !== 'all' ? progress.v : 1;
    const pickCh = progress && progress !== 'all' ? progress.c : CHAPTERS[0].length;
    $('#volGrid').innerHTML = VOLS.map((v, i) => `<button data-v="${i + 1}"><b>${v.n}</b><small>共 ${CHAPTERS[i].length} 章</small></button>`).join('');
    $('#volGrid').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { pickVol = +b.dataset.v; fillChapters(CHAPTERS[pickVol - 1].length); }));
    fillChapters(pickCh);
    modal.hidden = false;
    setTimeout(() => $('#pmOk').focus(), 30);
  }
  function fillChapters(sel) {
    $('#volGrid').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === pickVol));
    $('#chapterSelect').innerHTML = CHAPTERS[pickVol - 1].map((t, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>第${i + 1}章 ${esc(t)}</option>`).join('');
  }
  function applyProgress(p) {
    progress = p; store.set('ss-progress', p); modal.hidden = true;
    const before = new Set(EV.map((e) => e.id));
    refreshVisible(); buildMarks(); renderList(); renderPeople(); drawTimeline();
    const fresh = EV.filter((e) => !before.has(e.id));
    select(EV.length - 1);
    if (p && p !== 'all') {
      const title = CHAPTERS[p.v - 1][p.c - 1];
      toast(`读至${VOLS[p.v - 1].n}第${p.c}章《${title}》` + (fresh.length ? ` · 新解锁 ${fresh.length} 件事：${fresh.slice(-2).map((e) => e.title).join('、')}` : ' · 本章没有新标注的大事'));
    }
  }
  function nextChapter() {
    if (!progress || progress === 'all') return;
    let { v, c } = progress;
    if (c < CHAPTERS[v - 1].length) c++;
    else if (v < CHAPTERS.length) { v++; c = 1; }
    else return applyProgress('all');
    applyProgress({ v, c });
  }
  $('#nextChBtn').addEventListener('click', nextChapter);
  $('#pmOk').addEventListener('click', () => {
    const c = +$('#chapterSelect').value;
    applyProgress(pickVol === 6 && c === CHAPTERS[5].length ? 'all' : { v: pickVol, c });
  });
  $('#pmAll').addEventListener('click', () => applyProgress('all'));
  $('#progressBtn').addEventListener('click', openModal);
  modal.addEventListener('click', (ev) => { if (ev.target === modal && progress) modal.hidden = true; });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !modal.hidden && progress) modal.hidden = true; });

  // ── 明暗 ──
  $('#themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ss-theme', root.dataset.theme); } catch (e) { /* 忽略 */ }
    syncTheme();
  });
  const MOON = '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />';
  const SUN = '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />';
  function syncTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('#themeBtn svg').innerHTML = dark ? SUN : MOON;
    $('#themeBtn').title = dark ? '切换到宣纸（浅色）' : '切换到夜墨（深色）';
    const meta = $('meta[name="theme-color"]');
    const mode = dark ? 'dark' : 'light';
    if (root.dataset.mode !== mode || !syncTheme._m) { root.dataset.mode = mode; if (syncTheme._m && syncTheme._m !== mode) inkLayers.forEach((l) => l._map && l.redraw()); }
    syncTheme._m = mode;
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--paper').trim() || meta.content;
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);

  // ── 提示条 ──
  const toastEl = $('#toast');
  function toast(msg) {
    toastEl.textContent = msg; toastEl.hidden = false;
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => { toastEl.hidden = true; }, 5200);
  }

  // ── 人事表 ──
  const OFFICES = window.SS_OFFICES || [];
  const SEG = ['#c4482f', '#35506f', '#9c7a2c', '#3d8a80', '#8a64a0', '#a0603a'];
  const personLink = (n) => (peopleIdx[n] && canSee(peopleIdx[n].first) ? `<button class="of-name" data-person="${esc(n)}">${esc(n)}</button>` : `<span class="of-name">${esc(n)}</span>`);
  const pct = (t) => (((Math.max(T0, Math.min(T1, t)) - T0) / (T1 - T0)) * 100).toFixed(2) + '%';
  function renderOffices() {
    const body = $('#officeBody');
    const t = state.t, lim = maxT();
    const { y, m } = ymOf(t);
    let html = `<a class="of-link" href="renshi.html">打开朝野图：朝堂架构与人物关系 →</a><div class="of-now"><b>${yearName(y)} ${MONTHS[m]}</b>时的朝野格局<small>下方细条是十年间的任期，红线为此刻</small></div>`;
    let g = '';
    OFFICES.forEach((o) => {
      const tens = o.ten.filter((x) => canSee(x.ch)).map((x) => { const shown = x.b != null && (!x.bch || canSee(x.bch)); return Object.assign({}, x, { end: shown ? x.b : null, note: [x.note, shown && x.bn].filter(Boolean).join('；') }); });
      if (!tens.length) return;
      if (o.g !== g) { if (g) html += '</div>'; g = o.g; html += `<div class="of-group"><h3>${esc(g)}</h3>`; }
      const cur = tens.filter((x) => x.a <= t + 1e-6 && (x.end == null || x.end > t + 1e-6));
      const holders = cur.length
        ? cur.map((x) => `<span class="of-p${t - x.a < 2 && x.a > 0 ? ' fresh' : ''}">${personLink(x.p)}${t - x.a < 2 && x.a > 0 ? '<em>新任</em>' : ''}${x.note ? `<small>${esc(x.note)}</small>` : ''}</span>`).join('')
        : '<span class="of-none">此时空缺或未见于书中</span>';
      const bars = tens.map((x, k) => {
        const a = Math.max(T0, x.a), b = Math.min(x.end == null ? lim : x.end, lim);
        return b > a ? `<i style="left:${pct(a)};width:calc(${pct(b)} - ${pct(a)});--c:${SEG[k % SEG.length]}" title="${esc(x.p)}"></i>` : '';
      }).join('');
      html += `<div class="of-row"><div class="of-l" title="${esc(o.d)}"><b>${esc(o.n)}</b><small>${esc(o.d)}</small></div><div class="of-h">${holders}</div>
        <div class="of-bar">${bars}${lim < T1 ? `<u style="left:${pct(lim)}"></u>` : ''}<em style="left:${pct(t)}"></em></div></div>`;
    });
    if (g) html += '</div>';
    html += '<p class="about">任免时间依原著推定，部分起止为约数；只显示你已读到的任命与卸任。</p>';
    body.innerHTML = html;
    body.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', () => showPerson(b.dataset.person)));
  }

  // ── 名词解释 ──
  const GLOSS = window.SS_GLOSSARY || [];
  const termOf = {};
  GLOSS.forEach((g) => { termOf[g.t] = g; (g.a || []).forEach((a) => { termOf[a] = g; }); });
  const termRe = new RegExp(Object.keys(termOf).sort((a, b) => b.length - a.length).join('|'), 'g');
  function annotate(text) {
    const seen = new Set();
    return esc(text).replace(termRe, (w) => {
      const g = termOf[w];
      if (seen.has(g.t)) return w;
      seen.add(g.t);
      return `<button type="button" class="term" data-term="${esc(g.t)}">${w}</button>`;
    });
  }
  window.SS_ANNOTATE = annotate;
  const pop = el('div', 'term-pop');
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  document.body.appendChild(pop);
  function showTerm(name, anchor) {
    const g = termOf[name];
    if (!g) return;
    pop.innerHTML = `<div class="tp-head"><b>${esc(g.t)}</b><small>${esc(g.c)}</small></div><p>${esc(g.d)}</p>${g.a && g.a.length ? `<div class="tp-aka">又作：${g.a.map(esc).join('、')}</div>` : ''}`;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), w = Math.min(300, innerWidth - 24);
    pop.style.width = w + 'px';
    pop.style.left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12) + 'px';
    pop.style.top = r.bottom + 8 + 'px';
    const h = pop.offsetHeight;
    if (r.bottom + 8 + h > innerHeight - 12) pop.style.top = Math.max(12, r.top - h - 8) + 'px';
  }
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('.term');
    if (t) { ev.preventDefault(); ev.stopPropagation(); showTerm(t.dataset.term, t); return; }
    if (!pop.hidden && !pop.contains(ev.target)) pop.hidden = true;
  }, true);
  const glossModal = $('#glossModal');
  function openGlossary() {
    const cats = [...new Set(GLOSS.map((g) => g.c))];
    $('#glossBody').innerHTML = cats.map((c) => `<section><h3>${esc(c)}</h3><dl>${GLOSS.filter((g) => g.c === c).map((g) => `<div id="g-${esc(g.t)}"><dt>${esc(g.t)}${g.a && g.a.length ? `<small>${g.a.map(esc).join('、')}</small>` : ''}</dt><dd>${esc(g.d)}</dd></div>`).join('')}</dl></section>`).join('');
    glossModal.hidden = false;
  }
  $('#glossBtn').addEventListener('click', openGlossary);
  $('#glossClose').addEventListener('click', () => { glossModal.hidden = true; });
  glossModal.addEventListener('click', (ev) => { if (ev.target === glossModal) glossModal.hidden = true; });

  // ── 新读者导读：只讲开篇前的背景和读懂这本书要用的常识，不含剧透 ──
  const guideModal = $('#guideModal');
  function openGuide() {
    const fac = (f, body) => `<div class="g-fac" style="--c:${FACTIONS[f].color}"><b>${FACTIONS[f].full.replace(/（.*）/, '')}</b><p>${body}</p></div>`;
    const early = PEOPLE.filter((p) => canSee(p.first) && (progress ? true : chKey(p.first) <= chKey([1, 12]))).slice(0, 8);
    $('#guideBody').innerHTML = `
      <p class="muted">不含剧透：只讲故事开始之前已经发生的事，和看懂这本书用得上的常识。</p>
      <section><h3>这本书在讲什么</h3>
        <p>一个现代工科大学生赵玖，醒来发现自己成了刚登基不久的宋朝皇帝赵构——书里人人叫他“${annotate('官家')}”。这是建炎元年（公元 1127 年）的秋天，他人在亳州明道宫，朝廷正准备一路往南逃。他决定不逃。全书六卷，写的就是这个决定之后的十年。</p></section>
      <section><h3>开篇之前发生了什么</h3>
        <ul class="g-list">
          <li>北宋与金国结盟灭了辽国，却让金人看穿了宋军的虚实。</li>
          <li>公元 1127 年，金军攻破都城东京（今开封），把徽宗、钦宗两位皇帝连同整个皇室掳往北方，史称“靖康之变”，书里说的“二圣”就是他们。</li>
          <li>康王赵构当时不在城里，逃过一劫，被拥立为新君，年号“建炎”。</li>
          <li>开篇时，黄河以北的河北、河东（今河北、山西）大半已经丢了，新朝廷手里只有一支东拼西凑的队伍。</li>
        </ul></section>
      <section><h3>先认识三方</h3>
        <div class="g-facs">
          ${fac('song', '丢了都城和大半个北方，但人口、钱粮仍然最多。缺的是能打的军队，和敢打的决心。')}
          ${fac('jin', '女真人的国家，立国才十几年，已经灭辽、破宋，骑兵野战几乎无敌。军队分东、西两路，贵族们各有山头。')}
          ${fac('xia', '党项人的国家，占着河套与横山，夹在宋、金之间看风向。')}
        </div>
        <p class="muted g-note">其他势力会随着你的阅读进度，陆续出现在地图上。</p></section>
      <section><h3>地图怎么看：三条河、一座山</h3>
        <ul class="g-list">
          <li><b>黄河</b>　金军南下的第一道坎。当时的黄河下游走的是偏北的故道（图上土黄色那条），和今天的位置不一样。</li>
          <li><b>淮河</b>　南北之间的分界线，也是第一卷的主战场。</li>
          <li><b>长江</b>　再往南就是长江——朝中很多人想退到它后面去。</li>
          <li><b>太行山</b>　隔开河东（山西）与河北。山以东是一马平川，都城东京就在这片平原上，无险可守。</li>
        </ul>
        <p class="muted g-note">地名看不懂时，鼠标移到城市上或点一下，会显示它今天叫什么。</p></section>
      <section><h3>官职与军队，先记这几个</h3>
        <p>${annotate('皇帝之下，最高一层的大臣合称宰执：东府管政务，西府管军事。御营是朝廷直属的野战军，一军的主将叫都统制，下面是统制官。金军按猛安、谋克编组，大致相当于千夫长、百夫长，再往上是万户。')}</p>
        <p class="muted g-note">带虚线的词都可以点开看解释；全部名词在右上角的书本图标里。</p></section>
      ${early.length ? `<section><h3>开头会遇到的人</h3><div class="g-people">${early.map((p) => `<button data-person="${esc(p.n)}" style="--c:${facColor(p.f)}"><i>${esc(p.n.slice(-1))}</i><span><b>${esc(p.n)}</b><small>${esc(p.g)}${p.aka ? ' · ' + esc(p.aka) : ''}</small></span></button>`).join('')}</div></section>` : ''}
      <section><h3>这个网站怎么陪你读</h3>
        <ol class="g-list g-steps">
          <li><b>先设阅读进度。</b>地图只显示你读过的部分，后面的事件、人物结局、疆域变化都不会出现。每读完一章，点一下顶栏的“+1 章”。</li>
          <li><b>跟着时间轴走。</b>拖动底部时间轴，或按键盘 ← →，一件事一件事地看：发生在哪、谁参与、在原著第几章。</li>
          <li><b>打仗看不明白，点“沙盘推演”。</b>大战役都拆成了几步：谁在哪、往哪走、为什么这么打。</li>
          <li><b>人太多记不住，去“朝野图”。</b>谁是宰相、谁管哪支军、谁和谁是什么关系，都随时间变化。</li>
        </ol></section>
      <div class="modal-actions"><button class="btn primary" id="guideOk">开始看地图</button></div>`;
    guideModal.hidden = false;
    guideModal.querySelector('.modal-card').scrollTop = 0;
    $('#guideOk').addEventListener('click', closeGuide);
    $('#guideBody').querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', () => { closeGuide(); showPerson(b.dataset.person); }));
  }
  function closeGuide() { guideModal.hidden = true; pop.hidden = true; }
  $('#guideBtn').addEventListener('click', openGuide);
  $('#guideClose').addEventListener('click', closeGuide);
  guideModal.addEventListener('click', (ev) => { if (ev.target === guideModal) closeGuide(); });
  $('#pmNew').addEventListener('click', () => { applyProgress({ v: 1, c: 1 }); toastEl.hidden = true; openGuide(); });

  // ── 搜索 ──
  const sModal = $('#searchModal'), sInput = $('#searchInput'), sList = $('#searchList');
  let sItems = [], sActive = 0, sShown = [];
  let placePopup = null;
  function buildSearch() {
    sItems = [];
    EV.forEach((e, i) => sItems.push({ k: '事件', t: e.title, s: `${e.date} · ${e.place}`, q: e.title + e.place + e.date + (e.people || []).join(' ') + nowOf(e.place), go: () => { stopPlay(); select(i); switchTab('event'); } }));
    PEOPLE.filter((p) => canSee(p.first)).forEach((p) => sItems.push({ k: '人物', t: p.n, s: [p.g, p.aka].filter(Boolean).join(' · '), q: p.n + (p.aka || ''), go: () => showPerson(p.n) }));
    (window.SS_SANDBOX ? window.SS_SANDBOX.list() : []).filter((b) => canSee(b.ch)).forEach((b) => sItems.push({ k: '沙盘', t: b.title, s: b.date, q: b.title + b.sub, go: () => window.SS_SANDBOX.open(b.id) }));
    const seen = new Set();
    PTS.forEach((p) => {
      if (!p.n || seen.has(p.n)) return;
      seen.add(p.n);
      const now = PLACES_NOW[p.n] || '';
      sItems.push({ k: '地名', t: p.n, s: now ? '今' + now : '', q: p.n + now, go: () => {
        map.flyTo([p.y, p.x], Math.max(map.getZoom(), 7), { duration: 0.8 });
        if (placePopup) map.closePopup(placePopup);
        placePopup = L.popup({ className: 'place-pop', closeButton: false, offset: [0, -6] }).setLatLng([p.y, p.x]).setContent(`<b>${esc(p.n)}</b>${now ? ` · 今${esc(now)}` : ''}`).openOn(map);
      } });
    });
    GLOSS.forEach((g) => sItems.push({ k: '名词', t: g.t, s: g.d, q: g.t + (g.a || []).join(' '), term: g.t }));
  }
  function runSearch() {
    const q = sInput.value.trim();
    const groups = {};
    sShown = [];
    if (q) sItems.forEach((it) => { if ((it.q + it.s).includes(q) && (groups[it.k] = groups[it.k] || []).length < 8) groups[it.k].push(it); });
    const order = ['事件', '人物', '沙盘', '地名', '名词'];
    let html = '';
    order.forEach((k) => {
      if (!groups[k]) return;
      html += `<h4>${k}</h4>`;
      groups[k].forEach((it) => { html += `<button class="sr" data-n="${sShown.length}"><b>${esc(it.t)}</b><small>${esc(it.s)}</small></button>`; sShown.push(it); });
    });
    sList.innerHTML = html || `<p class="muted sr-empty">${q ? '没有找到。只能搜到你已读到的内容。' : '输入人名、地名、事件或名词，例如：岳飞、下蔡、尧山、猛安'}</p>`;
    sActive = 0; markActive();
    sList.querySelectorAll('.sr').forEach((b) => b.addEventListener('click', () => pick(+b.dataset.n, b)));
  }
  function markActive() { sList.querySelectorAll('.sr').forEach((b) => b.classList.toggle('on', +b.dataset.n === sActive)); }
  function pick(n, anchor) {
    const it = sShown[n];
    if (!it) return;
    if (it.term) { showTerm(it.term, anchor || sInput); return; }
    closeSearch();
    it.go();
  }
  function openSearch() { buildSearch(); sModal.hidden = false; sInput.value = ''; runSearch(); setTimeout(() => sInput.focus(), 20); }
  function closeSearch() { sModal.hidden = true; pop.hidden = true; }
  sInput.addEventListener('input', runSearch);
  sInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); sActive = Math.min(sShown.length - 1, sActive + 1); markActive(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); sActive = Math.max(0, sActive - 1); markActive(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); pick(sActive, sList.querySelector('.sr.on')); }
  });
  $('#searchBtn').addEventListener('click', openSearch);
  sModal.addEventListener('click', (ev) => { if (ev.target === sModal) closeSearch(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { pop.hidden = true; if (!sModal.hidden) closeSearch(); if (!glossModal.hidden) glossModal.hidden = true; if (!guideModal.hidden) closeGuide(); }
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (!typing && (ev.key === '/' || ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k')) && sModal.hidden && modal.hidden && !document.body.classList.contains('sb-open')) { ev.preventDefault(); openSearch(); }
  });

  // ── 启动 ──
  document.documentElement.dataset.style = state.style;
  refreshVisible();
  applyLayers();
  zoomClass();
  buildMarks();
  renderList();
  renderPeople();
  renderLayers();
  drawTimeline();
  const hash = (location.hash.match(/e=([\w-]+)/) || [])[1];
  let start = hash ? EV.findIndex((e) => e.id === hash) : -1;
  if (start < 0) start = progress && progress !== 'all' ? EV.length - 1 : 0;
  select(start, { fly: false });
  map.setView(ll(EV[start] ? EV[start].at : [113.2, 34.6]), narrow() ? 5 : 6);
  switchTab('event');
  syncTheme();
  addEventListener('hashchange', () => {
    const id = (location.hash.match(/e=([\w-]+)/) || [])[1];
    const k = id ? EV.findIndex((e) => e.id === id) : -1;
    if (k >= 0 && k !== state.idx) { stopPlay(); select(k); }
  });
  if (!progress) openModal();
  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { drawTimeline(); map.invalidateSize(); syncGestures(); }, 120); });
})();
