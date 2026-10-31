/* 朝野图：朝堂架构 + 人物关系 */
(function () {
  'use strict';
  const { T, FACTIONS } = window.SS_WORLD;
  const EVENTS = window.SS_EVENTS, PEOPLE = window.SS_PEOPLE, OFFICES = window.SS_OFFICES;
  const REL = window.SS_RELATIONS, EXTRA = window.SS_REL_EXTRA || {}, CHAPTERS = window.SS_CHAPTERS;
  const NS = 'http://www.w3.org/2000/svg';

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式下忽略 */ } },
  };
  const DIG = '〇一二三四五六七八九';
  const cn = (n) => (n <= 10 ? (n === 10 ? '十' : DIG[n]) : n < 20 ? '十' + DIG[n - 10] : DIG[Math.floor(n / 10)] + '十' + (n % 10 ? DIG[n % 10] : ''));
  const yearName = (y) => '建炎' + (y === 1 ? '元' : cn(y)) + '年';
  const MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  const ymOf = (t) => ({ y: Math.floor(t / 12) + 1, m: Math.floor(t % 12) });
  const fmt = (t) => (t <= 0 ? '建炎以前' : yearName(ymOf(t).y) + MONTHS[ymOf(t).m]);
  const VOLS = ['第一卷', '第二卷', '第三卷', '第四卷', '第五卷', '第六卷'];
  const T0 = T(1, 7);

  const KINDS = {
    trust: { n: '君臣倚重', c: '#c4482f', s: '' },
    chain: { n: '统属', c: '#7a6448', s: '' },
    mentor: { n: '恩主提携', c: '#9c7a2c', s: '' },
    kin: { n: '亲属', c: '#8a64a0', s: '' },
    ally: { n: '同盟合作', c: '#3d8a80', s: '' },
    rival: { n: '政敌不和', c: '#c9822e', s: 'dash' },
    enemy: { n: '敌对交锋', c: '#35506f', s: 'dash' },
    turn: { n: '降附反正', c: '#7d7d7d', s: 'dot' },
  };

  // ── 阅读进度（与舆图共用） ──
  let progress = store.get('ss-progress') || { v: 1, c: 1 };
  const chKey = (ch) => ch[0] * 1000 + ch[1];
  const canSee = (ch) => progress === 'all' || chKey(ch) <= chKey([progress.v, progress.c]);
  const visEvents = () => EVENTS.filter((e) => canSee(e.ch));
  const maxT = () => { const v = visEvents(); return v.length ? v[v.length - 1].t : T0; };

  const PIDX = Object.fromEntries(PEOPLE.map((p) => [p.n, p]));
  const facOf = (n) => (PIDX[n] && PIDX[n].f) || (EXTRA[n] && EXTRA[n].f) || 'song';
  const groupOf = (n) => (PIDX[n] && PIDX[n].g) || (EXTRA[n] && EXTRA[n].g) || '文臣';
  const colorOf = (n) => (FACTIONS[facOf(n)] || FACTIONS.song).color;
  const personKnown = (n) => (PIDX[n] ? canSee(PIDX[n].first) : true);

  // URL 参数：?view=graph&p=岳飞
  const qs = new URLSearchParams(location.search);
  const state = { view: qs.get('view') === 'graph' ? 'graph' : 'org', t: 0, sel: qs.get('p') || null, off: new Set() };

  // ── 进度选择 ──
  const volSel = $('#volSel'), chSel = $('#chSel');
  function fillProgress() {
    const v = progress === 'all' ? 7 : progress.v;
    volSel.innerHTML = VOLS.map((n, i) => `<option value="${i + 1}" ${v === i + 1 ? 'selected' : ''}>${n}</option>`).join('') + `<option value="7" ${v === 7 ? 'selected' : ''}>已读完全书</option>`;
    if (v === 7) { chSel.hidden = true; return; }
    chSel.hidden = false;
    chSel.innerHTML = CHAPTERS[v - 1].map((t, i) => `<option value="${i + 1}" ${progress.c === i + 1 ? 'selected' : ''}>第${i + 1}章 ${esc(t)}</option>`).join('');
  }
  function setProgress(p) {
    progress = p;
    store.set('ss-progress', p);
    fillProgress();
    state.t = maxT();
    if (state.sel && !personKnown(state.sel)) state.sel = null;
    renderAll();
  }
  volSel.addEventListener('change', () => { const v = +volSel.value; setProgress(v === 7 ? 'all' : { v, c: v === (progress.v || 0) ? progress.c : 1 }); });
  chSel.addEventListener('change', () => setProgress({ v: +volSel.value, c: +chSel.value }));

  // ── 时间 ──
  const range = $('#timeRange');
  function syncRange() {
    const hi = maxT();
    range.min = T0; range.max = Math.max(hi, T0 + 0.25);
    if (state.t > hi || state.t < T0) state.t = hi;
    range.value = state.t;
    $('#nowLbl').textContent = fmt(state.t);
  }
  range.addEventListener('input', () => { state.t = +range.value; $('#nowLbl').textContent = fmt(state.t); renderOrg(); });

  // ── 任期计算 ──
  function tenures(o) {
    return o.ten.filter((x) => canSee(x.ch)).map((x) => {
      const shown = x.b != null && (!x.bch || canSee(x.bch));
      return Object.assign({}, x, { end: shown ? x.b : null, note: [x.note, shown && x.bn].filter(Boolean).join('；') });
    });
  }
  const OIDX = Object.fromEntries(OFFICES.map((o) => [o.n, o]));
  const personBtn = (n) => (personKnown(n) ? `<button data-person="${esc(n)}">${esc(n)}</button>` : `<span class="nm">${esc(n)}</span>`);

  function officeBox(name) {
    const o = OIDX[name];
    if (!o) return '';
    const tens = tenures(o);
    if (!tens.length) return ''; // 还没读到任何任命的职位不显示，免得说明文字透露后事
    const t = state.t;
    const cur = tens.filter((x) => x.a <= t + 1e-6 && (x.end == null || x.end > t + 1e-6));
    const prev = tens.filter((x) => x.end != null && x.end <= t + 1e-6);
    const fresh = cur.some((x) => x.a > 0 && t - x.a < 2);
    const sel = state.sel && cur.some((x) => x.p === state.sel);
    const holders = cur.length
      ? cur.map((x) => `<div class="ob-p">${personBtn(x.p)}<small>${x.a > 0 ? '自' + fmt(x.a) : '建炎以前即在任'}</small>${x.a > 0 && t - x.a < 2 ? '<em>新任</em>' : ''}</div>${x.note ? `<div class="ob-note">${esc(x.note)}</div>` : ''}`).join('')
      : '空缺，或书中未提';
    return `<div class="ob${cur.length ? '' : ' vacant'}${fresh ? ' fresh' : ''}${sel ? ' sel' : ''}"><div class="ob-n">${esc(o.n)}<small>${esc(o.d)}</small></div><div class="ob-h">${holders}</div>${prev.length ? `<div class="ob-prev">前任：${prev.map((x) => esc(x.p)).join('、')}</div>` : ''}</div>`;
  }
  const group = (n, offices) => { const boxes = offices.map(officeBox).join(''); return boxes ? `<div class="org-group"><h4>${esc(n)}</h4><div class="org-boxes">${boxes}</div></div>` : ''; };

  function renderOrg() {
    const emp = `<div class="ob"><div class="ob-n">天子<small>建炎皇帝</small></div><div class="ob-h"><div class="ob-p">${personBtn('赵玖')}<small>建炎元年秋，明道宫坠井后</small></div></div></div>`;
    $('#orgView').innerHTML = `<div class="org">
      <section class="org-sec" style="--c:${FACTIONS.song.color}"><h2><i></i>大宋</h2>
        <div class="org-emp">${emp}</div>
        <div class="org-row"><h3>中枢</h3><div class="org-groups">${group('东府', ['东府宰相', '公相', '副相'])}${group('西府', ['西府枢相'])}${group('台谏', ['御史中丞'])}${group('内廷', ['内侍大押班', '御前班直 · 皇城司'])}</div></div>
        <div class="org-row"><h3>御营</h3><div class="org-groups">${group('总领与七军', ['御营都统制', '左军', '右军', '前军', '中军', '后军', '骑军', '水军'])}</div></div>
        <div class="org-row"><h3>方面</h3><div class="org-groups">${group('坐镇四方', ['东京留守', '京东', '东南', '关西'])}</div></div>
      </section>
      <div class="org-cols">
        <section class="org-sec" style="--c:${FACTIONS.jin.color}"><h2><i></i>大金</h2><div class="org-groups">${group('朝廷与军中', ['国主', '国相 · 都元帅', '执政亲王', '西路军统帅'])}</div></section>
        <section class="org-sec" style="--c:${FACTIONS.xia.color}"><h2><i></i>诸国</h2><div class="org-groups">${group('伪齐、西夏与北方诸部', ['伪齐皇帝', '西夏国主', '契丹（西辽）', '蒙古诸部'])}</div></section>
      </div></div>`;
    bindPeople($('#orgView'));
  }

  // ── 人物关系图 ──
  const svg = $('#graphSvg');
  const W = 1000, H = 700;
  const ANCHOR = { 天子: [500, 345], 宗室: [500, 470], 近臣: [520, 200], 文臣: [250, 245], 武将: [770, 235], 亲眷: [900, 120], 金国: [740, 560], 伪齐: [380, 600], 西夏: [150, 470], 契丹: [905, 430], 蒙古: [900, 335] };
  const ZONES = [['宋 · 文臣', 250, 95], ['宋 · 武将', 770, 85], ['大金', 740, 670], ['伪齐', 380, 680], ['西夏', 150, 590]];
  let vb = { x: 0, y: 0, w: W, h: H };
  const applyVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  // 视野与画布同比例；窄屏一开始就放大到中心区域，否则字太小
  function resetVB() {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const aspect = r.height / r.width;
    const w = r.width < 640 ? 600 : W;
    const h = Math.max(w * aspect, r.width < 640 ? 0 : H);
    vb = { x: 500 - w / 2, y: 370 - h / 2, w, h };
    applyVB();
  }

  function graphData() {
    const edges = REL.filter((r) => canSee(r.ch) && personKnown(r.a) && personKnown(r.b));
    const names = new Set(PEOPLE.filter((p) => canSee(p.first)).map((p) => p.n));
    edges.forEach((r) => { names.add(r.a); names.add(r.b); });
    const deg = {};
    edges.forEach((r) => { deg[r.a] = (deg[r.a] || 0) + 1; deg[r.b] = (deg[r.b] || 0) + 1; });
    const nodes = [...names].map((n) => ({ n, g: groupOf(n), d: deg[n] || 0 }));
    // 按组摆成葵花状，再做几轮去重叠
    const groups = {};
    nodes.forEach((nd) => (groups[nd.g] = groups[nd.g] || []).push(nd));
    Object.entries(groups).forEach(([g, list]) => {
      const [ax, ay] = ANCHOR[g] || [500, 350];
      list.sort((a, b) => b.d - a.d || a.n.localeCompare(b.n, 'zh'));
      list.forEach((nd, i) => {
        const ang = i * 2.39996, r = 46 * Math.sqrt(i);
        nd.x = ax + r * Math.cos(ang); nd.y = ay + r * Math.sin(ang) * 0.82;
      });
    });
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 0.1, min = 50;
        if (dist < min) { const push = (min - dist) / 2, ux = dx / dist, uy = dy / dist; a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
      }
      nodes.forEach((nd) => { nd.x = Math.max(30, Math.min(W - 30, nd.x)); nd.y = Math.max(30, Math.min(H - 30, nd.y)); });
    }
    return { nodes, edges };
  }

  function renderFilters() {
    $('#relFilters').innerHTML = Object.entries(KINDS).map(([k, v]) => `<button data-k="${k}" class="${state.off.has(k) ? 'off' : ''}" style="--c:${v.c}"><i class="${v.s}"></i>${v.n}</button>`).join('');
    $('#relFilters').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      state.off.has(k) ? state.off.delete(k) : state.off.add(k);
      renderFilters(); renderGraph();
    }));
  }

  function renderGraph() {
    const { nodes, edges } = graphData();
    const pos = Object.fromEntries(nodes.map((n) => [n.n, n]));
    const sel = state.sel && pos[state.sel] ? state.sel : null;
    const near = new Set(sel ? [sel] : []);
    const shown = edges.filter((r) => !state.off.has(r.k));
    if (sel) shown.forEach((r) => { if (r.a === sel) near.add(r.b); if (r.b === sel) near.add(r.a); });
    let s = ZONES.map(([n, x, y]) => `<text class="gz-label" x="${x}" y="${y}">${n}</text>`).join('');
    s += shown.map((r) => {
      const a = pos[r.a], b = pos[r.b];
      if (!a || !b) return '';
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
      const cx = mx - dy * 0.12, cy = my + dx * 0.12;
      const on = sel && (r.a === sel || r.b === sel);
      const K = KINDS[r.k];
      return `<path class="ed ${K.s}${sel ? (on ? ' hl' : ' dim') : ''}" style="--c:${K.c}" d="M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}"><title>${esc(r.a)} — ${esc(r.b)}：${esc(K.n)}。${esc(r.d)}</title></path>`;
    }).join('');
    s += nodes.map((nd) => {
      const r = 13 + Math.min(9, nd.d * 1.3);
      const cls = sel ? (nd.n === sel ? ' sel' : near.has(nd.n) ? '' : ' dim') : '';
      return `<g class="nd${cls}" data-person="${esc(nd.n)}" transform="translate(${nd.x.toFixed(1)},${nd.y.toFixed(1)})" style="--c:${colorOf(nd.n)}"><circle r="${r}"/><text class="seal" font-size="${(r * 0.95).toFixed(1)}">${esc(nd.n.slice(-1))}</text><text class="nm" y="${r + 14}">${esc(nd.n)}</text></g>`;
    }).join('');
    svg.innerHTML = s;
    applyVB();
  }

  // 平移与缩放
  (function panZoom() {
    let drag = null, moved = false;
    const pts = new Map();
    const toSvg = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: vb.x + ((cx - r.left) / r.width) * vb.w, y: vb.y + ((cy - r.top) / r.height) * vb.h }; };
    const zoom = (f, cx, cy) => {
      const p = toSvg(cx, cy);
      const nw = Math.max(260, Math.min(W * 1.6, vb.w * f));
      const k = nw / vb.w;
      vb = { x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w: nw, h: vb.h * k };
      applyVB();
    };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, vb: Object.assign({}, vb) }; moved = false; }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 0 && d1 > 0) zoom(d0 / d1, (a.x + b.x) / 2, (a.y + b.y) / 2);
        moved = true; drag = null; return;
      }
      if (!drag) return;
      const r = svg.getBoundingClientRect();
      const dx = (e.clientX - drag.x) * (vb.w / r.width), dy = (e.clientY - drag.y) * (vb.h / r.height);
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) { moved = true; svg.classList.add('dragging'); }
      vb = Object.assign({}, vb, { x: drag.vb.x - dx, y: drag.vb.y - dy });
      applyVB();
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      svg.classList.remove('dragging');
      if (pts.size === 0 && drag && !moved) {
        const g = document.elementFromPoint(e.clientX, e.clientY);
        const nd = g && g.closest && g.closest('.nd');
        select(nd ? nd.dataset.person : null);
      }
      if (pts.size === 0) drag = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  })();

  // ── 侧栏 ──
  function renderSide() {
    const side = $('#side');
    const n = state.sel;
    if (!n || !personKnown(n)) {
      const nRel = REL.filter((r) => canSee(r.ch)).length, hidden = REL.length - nRel;
      side.innerHTML = `<p class="ps-empty">${state.view === 'org'
        ? '左边是此刻的朝堂：拖动上方的时间条，看宰执、统帅、方面大员怎样更替。点任何一个名字，可以在这里看他的历任官职和人际关系。'
        : '每个圆点是一个人，颜色代表所属势力，越大说明关系越多。点一个人，只看他的关系线；点空白处恢复全图。'}</p>
        <h3>关系类型</h3><div class="ps-legend">${Object.values(KINDS).map((k) => `<div><i class="${k.s}" style="--c:${k.c}"></i>${k.n}</div>`).join('')}</div>
        <p class="ps-lock">已读到的关系 ${nRel} 条${hidden ? `，另有 ${hidden} 条读到后解锁` : ''}。</p>`;
      return;
    }
    const p = PIDX[n];
    const sub = p ? [p.g, p.aka].filter(Boolean).join(' · ') : (EXTRA[n] ? EXTRA[n].g : '');
    const posts = [];
    OFFICES.forEach((o) => tenures(o).forEach((x) => { if (x.p === n) posts.push({ o: o.n, x }); }));
    posts.sort((a, b) => a.x.a - b.x.a);
    const rels = REL.filter((r) => canSee(r.ch) && (r.a === n || r.b === n) && personKnown(r.a === n ? r.b : r.a));
    const hiddenRel = REL.filter((r) => !canSee(r.ch) && (r.a === n || r.b === n)).length;
    const evs = EVENTS.filter((e) => canSee(e.ch) && (e.people || []).includes(n));
    const steps = p ? p.steps.filter((s) => canSee([s[0], s[1]])) : [];
    side.innerHTML = `<div class="ps-head" style="--c:${colorOf(n)}"><div class="ps-seal">${esc(n.slice(-1))}</div><div><h2>${esc(n)}</h2><small>${esc(sub)}</small></div></div>
      ${p ? `<p class="ps-intro">${esc(p.intro)}</p>` : ''}
      ${posts.length ? `<h3>历任</h3><ul class="ps-list">${posts.map(({ o, x }) => `<li><b>${esc(o)}</b><small>${x.a > 0 ? fmt(x.a) : '建炎以前'} — ${x.end != null ? fmt(x.end) : '（书中所见至今）'}${x.note ? '　' + esc(x.note) : ''}</small></li>`).join('')}</ul>` : ''}
      ${steps.length ? `<h3>经历</h3><ul class="ps-list">${steps.map((s) => `<li>${esc(s[2])}<small>${VOLS[s[0] - 1]} 第${s[1]}章</small></li>`).join('')}</ul>` : ''}
      ${rels.length ? `<h3>关系</h3><ul class="ps-list">${rels.map((r) => { const o = r.a === n ? r.b : r.a, K = KINDS[r.k]; return `<li><span class="rt" style="--c:${K.c}">${K.n}</span><button class="lk" data-person="${esc(o)}">${esc(o)}</button><small>${esc(r.d)}</small></li>`; }).join('')}</ul>` : ''}
      ${hiddenRel ? `<p class="ps-lock">另有 ${hiddenRel} 条关系在你未读的章节里。</p>` : ''}
      ${evs.length ? `<h3>相关事件</h3><ul class="ps-list">${evs.map((e) => `<li><a href="index.html#e=${e.id}">${esc(e.title)}</a><small>${esc(e.date)} · ${esc(e.place)}</small></li>`).join('')}</ul>` : ''}
      <div class="ps-actions">${state.view === 'org' ? '<button data-goview="graph">在关系图中看</button>' : '<button data-goview="org">在朝堂架构中看</button>'}<button data-clear>取消选择</button></div>`;
    bindPeople(side);
    side.querySelectorAll('[data-goview]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.goview)));
    side.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => select(null)));
  }

  function bindPeople(root) {
    root.querySelectorAll('button[data-person]').forEach((b) => b.addEventListener('click', () => select(b.dataset.person)));
  }
  function select(n) {
    state.sel = n;
    const u = new URL(location.href);
    n ? u.searchParams.set('p', n) : u.searchParams.delete('p');
    u.searchParams.set('view', state.view);
    try { history.replaceState(null, '', u); } catch (e) { /* 忽略 */ }
    renderOrgOrGraph(); renderSide();
    if (n && innerWidth <= 900) $('#side').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function setView(v) {
    state.view = v;
    document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('#orgView').hidden = v !== 'org';
    $('#graphView').hidden = v !== 'graph';
    $('#timeBox').hidden = v !== 'org';
    select(state.sel);
    if (v === 'graph') resetVB();
  }
  document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  const renderOrgOrGraph = () => (state.view === 'org' ? renderOrg() : renderGraph());
  function renderAll() { syncRange(); renderOrg(); renderFilters(); renderGraph(); renderSide(); }

  // ── 明暗 ──
  $('#themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ss-theme', root.dataset.theme); } catch (e) { /* 忽略 */ }
  });

  fillProgress();
  state.t = maxT();
  if (state.sel && !personKnown(state.sel)) state.sel = null;
  renderAll();
  setView(state.view);
})();
