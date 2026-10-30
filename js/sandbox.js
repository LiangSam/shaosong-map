/* 绍宋舆图 — 沙盘推演 */
(function () {
  'use strict';
  const BATTLES = window.SS_BATTLES || [];
  const FACTIONS = window.SS_WORLD.FACTIONS;
  const NS = 'http://www.w3.org/2000/svg';
  const ll = (p) => [p[1], p[0]];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ico = (body) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  // 兵种图标
  const KINDS = {
    inf: { n: '步军', i: ico('<path d="M12 3 19 6v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><path d="M12 7v10M8.5 11h7"/>') },
    cav: { n: '骑兵', i: ico('<path d="M6 21c0-3 1-5.5 3-7l-3-2 1.5-4.5L12 4l2-1 1 2 3 2.5 1 3.5-2 1-2.5-1.5-.5 3.5 2 7"/><circle cx="14" cy="7.3" r=".6" fill="currentColor"/>') },
    heavy: { n: '重骑', i: ico('<path d="M6 21c0-3 1-5.5 3-7l-3-2 1.5-4.5L12 4l2-1 1 2 3 2.5 1 3.5-2 1-2.5-1.5-.5 3.5 2 7"/><path d="M4 21h16"/><path d="M9 14l3-2 2 1"/>') },
    bow: { n: '弓弩', i: ico('<path d="M6 3c7 2.5 7 15.5 0 18"/><path d="M6 3v18"/><path d="M6 12h13M16 9l3 3-3 3"/>') },
    navy: { n: '水军', i: ico('<path d="M3 15h18l-3 5H6z"/><path d="M12 3v12M12 3l6 8h-6"/>') },
    hq: { n: '主帅', i: ico('<path d="M5 21V3"/><path d="M5 4h12l-3 4 3 4H5"/>') },
    emp: { n: '御驾', i: ico('<path d="M5 21V3"/><path d="M5 4h13l-3 4 3 4H5"/><circle cx="11" cy="8" r="1.6" fill="currentColor"/>') },
  };
  const ST_LABEL = { rout: '溃', dead: '灭' };

  let ov = null, map = null, rTer = null, rArr = null, layers = {}, cur = null, step = 0, timer = null, unitMarkers = {};

  function build() {
    ov = document.createElement('div');
    ov.className = 'sb';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="sb-map" id="sbMap"></div>
      <aside class="sb-panel">
        <header class="sb-head">
          <div><div class="sb-kicker">沙盘推演</div><h2 id="sbTitle"></h2><div class="sb-date" id="sbDate"></div></div>
          <button class="icon-btn" id="sbClose" title="返回地图（Esc）" aria-label="关闭沙盘">${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
        </header>
        <p class="sb-brief" id="sbBrief"></p>
        <ol class="sb-steps" id="sbSteps"></ol>
        <div class="sb-legend" id="sbLegend"></div>
        <p class="sb-note">地形与兵力位置依原著情节示意，非精确复原。</p>
      </aside>
      <div class="sb-story" id="sbStory">
        <div class="sb-story-head"><span id="sbStepNo"></span><b id="sbStepTitle"></b><small id="sbStepTime"></small></div>
        <p id="sbStepText"></p>
        <div class="sb-ctrl">
          <button class="icon-btn" id="sbPrev" aria-label="上一步">${ico('<path d="M15 5l-7 7 7 7"/>')}</button>
          <button class="icon-btn play" id="sbPlay" aria-label="自动推演">${ico('<path id="sbPlayIco" d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>')}</button>
          <button class="icon-btn" id="sbNext" aria-label="下一步">${ico('<path d="M9 5l7 7-7 7"/>')}</button>
          <div class="sb-prog" id="sbProg"></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#sbClose').addEventListener('click', close);
    ov.querySelector('#sbPrev').addEventListener('click', () => { stop(); go(step - 1); });
    ov.querySelector('#sbNext').addEventListener('click', () => { stop(); go(step + 1); });
    ov.querySelector('#sbPlay').addEventListener('click', () => (timer ? stop() : play()));
    document.addEventListener('keydown', (e) => {
      if (!ov || ov.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); stop(); go(step + 1); }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); stop(); go(step - 1); }
      else if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); timer ? stop() : play(); }
    }, true);

    map = L.map('sbMap', { center: [34, 113], zoom: 10, zoomControl: true, attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 8, maxZoom: 16 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 13, maxZoom: 16, updateWhenZooming: false }).addTo(map);
    map.createPane('ter').style.zIndex = 350;
    map.createPane('arr').style.zIndex = 420;
    map.createPane('units').style.zIndex = 620;
    const story = ov.querySelector('#sbStory');
    map.getContainer().appendChild(story);
    L.DomEvent.disableClickPropagation(story);
    L.DomEvent.disableScrollPropagation(story);
    rTer = L.svg({ pane: 'ter', padding: 0.4 }).addTo(map);
    rArr = L.svg({ pane: 'arr', padding: 0.4 }).addTo(map);
    const defs = (r, html) => { const d = document.createElementNS(NS, 'defs'); d.innerHTML = html; r._container.insertBefore(d, r._container.firstChild); };
    defs(rTer, `<pattern id="sbHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" class="sb-hatch-line"/></pattern>
      <pattern id="sbMarsh" width="14" height="9" patternUnits="userSpaceOnUse"><path d="M2 6h5M8 3h4" class="sb-marsh-line"/></pattern>`);
    defs(rArr, Object.entries(FACTIONS).filter(([k]) => k !== 'none').map(([k, f]) =>
      `<marker id="sbA-${k}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${f.color}"/></marker>`).join(''));
  }

  function open(id) {
    const b = BATTLES.find((x) => x.id === id);
    if (!b) return;
    if (!ov) build();
    cur = b; step = 0;
    ov.hidden = false;
    document.body.classList.add('sb-open');
    ov.querySelector('#sbTitle').textContent = b.title;
    ov.querySelector('#sbDate').textContent = `${b.date} · ${b.sub}`;
    ov.querySelector('#sbBrief').textContent = b.brief;
    ov.querySelector('#sbSteps').innerHTML = b.phases.map((p, i) => `<li data-i="${i}"><span>${i + 1}</span><div><b>${esc(p.title)}</b><small>${esc(p.time || '')}</small></div></li>`).join('');
    ov.querySelectorAll('#sbSteps li').forEach((li) => li.addEventListener('click', () => { stop(); go(+li.dataset.i); }));
    ov.querySelector('#sbProg').innerHTML = b.phases.map((_, i) => `<i data-i="${i}"></i>`).join('');
    ov.querySelectorAll('#sbProg i').forEach((d) => d.addEventListener('click', () => { stop(); go(+d.dataset.i); }));
    const used = new Set(Object.values(b.units).map((u) => u.k));
    ov.querySelector('#sbLegend').innerHTML = Object.entries(KINDS).filter(([k]) => used.has(k)).map(([, k]) => `<span>${k.i}${k.n}</span>`).join('') +
      `<span><svg width="26" height="10"><path d="M1 5h20" stroke="var(--ink)" stroke-width="2.6"/><path d="M19 1l5 4-5 4" fill="var(--ink)"/></svg>进攻</span><span><svg width="26" height="10"><path d="M1 5h20" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 3"/></svg>行军</span><span><svg width="26" height="10"><path d="M1 5h20" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="1.5 3"/></svg>撤退</span>`;
    setTimeout(() => { map.invalidateSize(); drawTerrain(); placeUnits(); fit(); go(0, true); }, 30);
  }

  function close() {
    stop();
    if (ov) ov.hidden = true;
    document.body.classList.remove('sb-open');
  }

  function fit() {
    const narrow = map.getSize().x < 700;
    if (cur.view) {
      map.setView(ll(cur.view), cur.view[2] - (narrow ? 0.75 : 0));
      return;
    }
    const b = L.latLngBounds([]);
    cur.terrain.forEach((t) => { if (t.t !== 'river' && t.t !== 'label') (t.pts || [t.at]).forEach((p) => b.extend(ll(p))); });
    Object.values(cur.phases[0].pos || {}).forEach((p) => p && b.extend(ll(p)));
    map.fitBounds(b, { paddingTopLeft: [40, 40], paddingBottomRight: [40, narrow ? 200 : 170] });
  }

  function clearLayer(k) { if (layers[k]) { map.removeLayer(layers[k]); } layers[k] = L.layerGroup().addTo(map); return layers[k]; }

  function drawTerrain() {
    const g = clearLayer('ter');
    const lbl = (at, html, cls) => L.marker(ll(at), { pane: 'markerPane', interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="sb-lbl ${cls || ''}">${html}</div>` }) }).addTo(g);
    const centroid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    cur.terrain.forEach((t) => {
      if (t.t === 'river') {
        L.polyline(t.pts.map(ll), { renderer: rTer, className: 'sb-river', weight: t.w || 4, interactive: false }).addTo(g);
        lbl(t.pts[Math.floor(t.pts.length / 2)], t.n, 'water');
      } else if (t.t === 'dike') {
        L.polyline(t.pts.map(ll), { renderer: rTer, className: 'sb-dike', weight: 3, interactive: false }).addTo(g);
      } else if (t.t === 'hill') {
        L.polygon(t.pts.map(ll), { renderer: rTer, className: 'sb-hill', interactive: false }).addTo(g);
        lbl(centroid(t.pts), t.n, 'hill' + (t.small ? ' small' : ''));
      } else if (t.t === 'marsh') {
        L.polygon(t.pts.map(ll), { renderer: rTer, className: 'sb-marsh', interactive: false }).addTo(g);
        lbl(centroid(t.pts), t.n, 'water');
      } else if (t.t === 'camp') {
        const opt = { renderer: rTer, className: 'sb-camp', color: FACTIONS[t.f].color, interactive: false };
        (t.line ? L.polyline(t.pts.map(ll), Object.assign(opt, { className: 'sb-camp line' })) : L.polygon(t.pts.map(ll), opt)).addTo(g);
        if (!t.small || true) lbl(t.line ? t.pts[t.pts.length - 2] : [centroid(t.pts)[0], Math.max(...t.pts.map((p) => p[1]))], t.n, 'camp' + (t.small ? ' small' : ''));
      } else if (t.t === 'city') {
        lbl(t.at, `<i></i>${t.n}`, 'city');
      } else if (t.t === 'label') {
        lbl(t.at, t.n, 'note');
      }
    });
  }

  function unitHtml(u) {
    const k = KINDS[u.k] || KINDS.inf;
    return `<div class="sb-unit k-${u.k}" style="--c:${FACTIONS[u.f].color}"><span class="u-ico">${k.i}</span><span class="u-txt"><b>${esc(u.n)}</b><small>${esc(u.s || '')}</small></span><em class="u-st"></em></div>`;
  }

  function placeUnits() {
    const g = clearLayer('units');
    unitMarkers = {};
    Object.entries(cur.units).forEach(([id, u]) => {
      const m = L.marker([0, 0], { pane: 'units', interactive: false, icon: L.divIcon({ className: 'sb-umark', iconSize: [0, 0], html: unitHtml(u) }) });
      unitMarkers[id] = { m, u, on: false };
      m._sbGroup = g;
    });
  }

  // 计算第 i 步时的累计状态
  function stateAt(i) {
    const pos = {}, st = {};
    for (let k = 0; k <= i; k++) {
      const ph = cur.phases[k];
      Object.assign(pos, ph.pos || {});
      Object.entries(ph.st || {}).forEach(([id, s]) => { st[id] = s === 'ok' ? undefined : s; });
    }
    return { pos, st };
  }

  function go(i, instant) {
    if (!cur) return;
    i = Math.max(0, Math.min(cur.phases.length - 1, i));
    step = i;
    const ph = cur.phases[i];
    const prev = i > 0 ? stateAt(i - 1) : null;
    const { pos, st } = stateAt(i);
    const container = map.getContainer();
    // 镜头：取本阶段或之前最近一个阶段指定的视野
    let view = null;
    for (let k = i; k >= 0 && !view; k--) view = cur.phases[k].view || null;
    if (!view) view = cur.view;
    if (view) {
      const z = view[2] - (map.getSize().x < 700 ? 0.75 : 0);
      const target = L.latLng(ll(view));
      if (instant) map.setView(target, z);
      else if (!map.getCenter().equals(target, 1e-4) || Math.abs(map.getZoom() - z) > 0.01) map.flyTo(target, z, { duration: 1.1 });
    }
    container.classList.toggle('sb-anim', !instant);
    Object.entries(unitMarkers).forEach(([id, o]) => {
      const p = pos[id];
      if (!p) { if (o.on) { o.m._sbGroup.removeLayer(o.m); o.on = false; } return; }
      const wasOn = o.on;
      if (!wasOn) { o.m.setLatLng(ll(prev && prev.pos[id] ? prev.pos[id] : p)); o.m.addTo(o.m._sbGroup); o.on = true; }
      requestAnimationFrame(() => o.m.setLatLng(ll(p)));
      const el = o.m.getElement() && o.m.getElement().firstChild;
      if (el) {
        el.classList.remove('st-rout', 'st-dead', 'st-hide', 'act');
        if (st[id]) el.classList.add('st-' + st[id]);
        el.querySelector('.u-st').textContent = ST_LABEL[st[id]] || '';
        const moved = prev && prev.pos[id] && (prev.pos[id][0] !== p[0] || prev.pos[id][1] !== p[1]);
        const act = moved || (ph.st && ph.st[id]) || (ph.focus || []).includes(id);
        if (act) el.classList.add('act');
        o.m.setZIndexOffset(act ? 1000 : 0);
      }
    });
    clearTimeout(go._t);
    go._t = setTimeout(() => container.classList.remove('sb-anim'), 1300);
    // 箭头
    const ga = clearLayer('arr');
    (ph.arrows || []).forEach((a, n) => {
      const line = L.polyline(a.pts.map(ll), { renderer: rArr, className: `sb-arrow ${a.k}`, color: FACTIONS[a.f].color, interactive: false }).addTo(ga);
      const path = line._path;
      if (path) {
        path.setAttribute('marker-end', `url(#sbA-${a.f})`);
        const len = path.getTotalLength();
        path.style.setProperty('--len', len);
        path.style.animationDelay = (instant ? 0 : 0.25 + n * 0.18) + 's';
      }
    });
    (ph.marks || []).forEach((mk) => L.marker(ll(mk.at), { pane: 'units', interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="sb-mark">${esc(mk.t)}</div>` }) }).addTo(ga));
    // 文字
    ov.querySelector('#sbStepNo').textContent = `第 ${i + 1} / ${cur.phases.length} 步`;
    ov.querySelector('#sbStepTitle').textContent = ph.title;
    ov.querySelector('#sbStepTime').textContent = ph.time || '';
    ov.querySelector('#sbStepText').textContent = ph.text;
    ov.querySelectorAll('#sbSteps li').forEach((li) => li.classList.toggle('on', +li.dataset.i === i));
    ov.querySelectorAll('#sbProg i').forEach((d) => { d.classList.toggle('on', +d.dataset.i === i); d.classList.toggle('done', +d.dataset.i < i); });
    // 只在侧栏自身可滚动时（桌面端）滚动步骤列表，避免手机上把整页滚走
    const on = ov.querySelector('#sbSteps li.on'), panel = ov.querySelector('.sb-panel');
    if (on && panel.scrollHeight > panel.clientHeight + 4 && getComputedStyle(panel).overflowY !== 'visible') {
      const top = on.offsetTop - panel.offsetTop;
      if (top < panel.scrollTop || top + on.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTo({ top: top - panel.clientHeight / 3, behavior: 'smooth' });
    }
    ov.querySelector('#sbPrev').disabled = i === 0;
    ov.querySelector('#sbNext').disabled = i === cur.phases.length - 1;
  }

  function play() {
    if (step >= cur.phases.length - 1) go(0);
    ov.querySelector('#sbPlayIco').setAttribute('d', 'M7 5h4v14H7zM13 5h4v14h-4z');
    timer = setInterval(() => { if (step >= cur.phases.length - 1) return stop(); go(step + 1); }, 6500);
  }
  function stop() {
    clearInterval(timer); timer = null;
    if (ov) ov.querySelector('#sbPlayIco').setAttribute('d', 'M8 5v14l11-7z');
  }

  window.SS_SANDBOX = {
    open,
    forEvent: (eventId) => BATTLES.find((b) => b.event === eventId),
    list: () => BATTLES,
  };
})();
