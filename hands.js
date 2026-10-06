/* hands.js — оружие (АК, 3 пистолета, нож) и свои руки в перчатках.
   Подключать ПОСЛЕ основного <script> в index.html. */
(function () {
  const DEG = Math.PI / 180, KEY = 'hands_v9', V = THREE.Vector3;
  const BIG = 1.35, U = 0.105 * BIG;      // BIG — размер оружия и рук (1 = реальный)
  const mat = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r || 0.7 });
  const SKIN = mat(0xe8a98a, 0.65), GLOVE = mat(0x3b3f46), CUFF = mat(0x2a2d32), PAD = mat(0x555a63);

  // Позы пальцев: загиб фаланг (градусы) + разведение (sp). Новая поза = новая строка.
  const POSES = {
    fist:   { f: [[-75, -85, -60], [-80, -90, -65], [-80, -90, -65], [-75, -85, -60]], th: [-30, -35] },
    pistol: { f: [[-25, -30, -15], [-80, -90, -65], [-80, -90, -65], [-75, -85, -60]], th: [-20, -25] },
    cup:    { f: [[-45, -60, -40], [-55, -65, -45], [-60, -65, -45], [-60, -60, -40]], th: [-10, -15] },
    open:   { f: [[-15, -20, -10], [-20, -25, -12], [-22, -28, -14], [-25, -30, -15]], th: [-5, -10], sp: [0.15, 0.05, -0.08, -0.2] }
  };
  // Положение рук от точки хвата (в ладонях U) + повороты. f — развернуть модель оружия на 180°.
  const H = (pose, x, y, z, pitch, yaw, roll) => ({ pose, x, y, z, pitch, yaw, roll, k: 1 });
  const PR = () => { const r = H('pistol', 0.65, 0.1, 0.55, 20, -18, -85); r.k = 1.3; return { R: r, L: H('fist', -0.7, -0.3, 0.6, 20, -30, 85), f: 0 }; };   // R — твои настройки дигла, L — поддерживающая рука
  const DEF = {
    rifle:  { R: H('pistol', 0.5, -1.2, 0, 15, 10, -85), L: H('cup', 0.55, -1, 0.5, 4, -18, 150), f: 0 },
    usp: PR(), deagle: PR(), beretta: PR(),
    knife:  { R: H('fist', 0, 0, 0, 35, 70, -20), L: H('open', -4.2, -0.5, -0.5, 25, -20, 0), f: 1 }
  };
  // Оружие: файл, длина (м), где на экране мушка (ndcX; sY/sZ — в камере, метры), muz — дульный срез от мушки,
  // R/L — точки рук как смещение от мушки [вниз, назад]. У ножа sY/sZ — точка рукояти. Пример: референсы Standoff 2.
  const PIS = { ndcX: 0.272, sY: -0.077, sZ: -0.56, muz: -0.02, R: [-0.118, 0.2], L: [-0.118, 0.2] };
  const W = {
    rifle:   { file: 'ak-47_low_poly.glb', len: 0.88, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, yaw: Math.PI, R: [-0.076, 0.51], L: [-0.076, 0.19] },
    usp:     Object.assign({ file: 'low-poly_usp-s.glb', len: 0.3 }, PIS),
    deagle:  Object.assign({ file: 'low-poly_desert_eagle.glb', len: 0.27 }, PIS, { ndcX: 0.245 }),
    beretta: Object.assign({ file: 'low-poly_beretta_92fs.glb', len: 0.28 }, PIS),
    knife:   { file: 'knife_default_t__cs2.glb', len: 0.46, knife: 1, ndcX: 0.441, sY: -0.165, sZ: -0.38, R: [0, 0], L: [0, 0] }
  };
  const tune = JSON.parse(JSON.stringify(DEF));
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) for (const n in DEF) if (s[n]) { ['R', 'L'].forEach(h => { if (tune[n][h]) Object.assign(tune[n][h], s[n][h]); }); tune[n].f = s[n].f | 0; }
  } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tune)); } catch (e) {} };

  // Цепочка фаланг: каждая — потомок предыдущей, поэтому гнётся как палец
  function chain(x, y, z, lens, t, curls, yaw, k, mats) {
    const root = new THREE.Group();
    root.position.set(x, y, z); root.rotation.order = 'YXZ'; root.rotation.y = yaw;
    let parent = root;
    lens.forEach((len, i) => {
      const j = new THREE.Group();
      j.rotation.x = curls[i] * k * DEG;
      if (i) j.position.z = -lens[i - 1];
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len * 0.96), mats[i]);
      m.position.z = -len / 2; j.add(m); parent.add(j); parent = j;
    });
    return root;
  }
  // Рука в перчатке без кончиков пальцев: ладонь в нуле, пальцы вперёд (−z), предплечье назад (+z)
  function makeHand(side, pose, u, k) {
    const sx = side === 'R' ? -1 : 1, P = POSES[pose], g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.95 * u, 0.38 * u, 1.05 * u), GLOVE));
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.7 * u, 0.12 * u, 0.6 * u), PAD);
    pad.position.set(0, 0.22 * u, -0.1 * u); g.add(pad);
    const lens = [[0.5, 0.35, 0.28], [0.55, 0.4, 0.3], [0.5, 0.37, 0.28], [0.4, 0.28, 0.24]];
    for (let i = 0; i < 4; i++) g.add(chain(sx * (0.33 - i * 0.22) * u, 0, -0.52 * u, lens[i].map(v => v * u), 0.2 * u, P.f[i], P.sp ? -sx * P.sp[i] : 0, k, [GLOVE, GLOVE, SKIN]));
    g.add(chain(sx * 0.5 * u, -0.02 * u, 0.2 * u, [0.55 * u, 0.42 * u], 0.24 * u, P.th, -sx * 0.5, k, [GLOVE, SKIN]));
    const part = (a, b, w, h, m) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w * u, h * u, (b - a) * u), m); p.position.z = (a + b) / 2 * u; g.add(p); };
    part(0.5, 1.5, 0.95, 0.62, CUFF); part(1.5, 7, 0.85, 0.75, SKIN);
    return g;
  }
  window.makeHand = makeHand;

  const holder = new THREE.Group(), anch = {}, sliders = {};
  let cur = 'rifle', sel = 'R';

  // габарит облака вершин после поворота вокруг Y
  function bboxYaw(P, th) {
    const c = Math.cos(th), s = Math.sin(th), mn = new V(1e9, 1e9, 1e9), mx = new V(-1e9, -1e9, -1e9);
    P.forEach(v => {
      const x = v.x * c + v.z * s, z = -v.x * s + v.z * c;
      mn.x = Math.min(mn.x, x); mx.x = Math.max(mx.x, x); mn.y = Math.min(mn.y, v.y); mx.y = Math.max(mx.y, v.y); mn.z = Math.min(mn.z, z); mx.z = Math.max(mx.z, z);
    });
    return new THREE.Box3(mn, mx);
  }
  // длинная ось → вдоль z; у пистолета рукоять (выше) сзади, у ножа клинок (выше) впереди. Если вышло наоборот — кнопка «Развернуть» в ⚙.
  function autoYaw(P, knife) {
    const b0 = bboxYaw(P, 0);
    let th = (b0.max.x - b0.min.x) > (b0.max.z - b0.min.z) ? Math.PI / 2 : 0;
    const b = bboxYaw(P, th), zc = (b.min.z + b.max.z) / 2, c = Math.cos(th), s = Math.sin(th), e = [[1e9, -1e9], [1e9, -1e9]];
    P.forEach(v => { const h = (-v.x * s + v.z * c) < zc ? 0 : 1; e[h][0] = Math.min(e[h][0], v.y); e[h][1] = Math.max(e[h][1], v.y); });
    const front = e[0][1] - e[0][0], rear = e[1][1] - e[1][0];
    if (knife ? front < rear : front > rear) th += Math.PI;
    return th;
  }
  function loadW(name, cb) {
    const w = W[name];
    if (w.ready) { if (cb) cb(); return; }
    if (w.loading) { w.cbs.push(cb); return; }
    w.loading = 1; w.cbs = [cb];
    new THREE.GLTFLoader().load(w.file, g => {
      const s = g.scene, P = [];
      s.updateMatrixWorld(true);
      s.traverse(o => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.metalness > 0.4) m.metalness = 0.3; m.side = THREE.DoubleSide; });
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 2) P.push(new V().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
      });
      w.P = P; w.inner = s; w.yaw0 = w.yaw !== undefined ? w.yaw : autoYaw(P, w.knife);
      w.wrap = new THREE.Group(); w.pivot = new THREE.Group();
      w.wrap.add(s); w.pivot.add(w.wrap); weaponContainer.add(w.pivot);
      w.ready = 1; w.cbs.forEach(f => { if (f) f(); }); place();
    }, undefined, () => { w.loading = 0; console.log('оружие не загрузилось', w.file); });
  }
  function build() {
    while (holder.children.length) { const o = holder.children[0]; holder.remove(o); o.traverse(m => { if (m.geometry) m.geometry.dispose(); }); }
    const w = W[cur], t = tune[cur];
    ['R', 'L'].forEach(s => {
      if (!w || !w.ready || !w.L && s === 'L' || !t[s] || !anch[s]) return;
      const q = t[s], a = anch[s], h = makeHand(s, q.pose, U, q.k);
      h.rotation.set(q.pitch * DEG, q.yaw * DEG, q.roll * DEG);
      h.position.set(a.x + q.x * U, a.y + q.y * U, a.z + q.z * U);
      holder.add(h);
    });
  }
  // ставит оружие и руки так, чтобы мушка попала в точку экрана с референса (при любом соотношении сторон)
  function place() {
    for (const n in W) if (W[n].pivot) W[n].pivot.visible = n === cur;
    const w = W[cur];
    if (!w || !w.ready) { build(); return; }
    const gx = w.ndcX * -w.sZ * Math.tan(camera.fov * 0.5 * DEG) * camera.aspect;
    const th = w.yaw0 + (tune[cur].f ? Math.PI : 0), b = bboxYaw(w.P, th), size = b.getSize(new V()), c = b.getCenter(new V());
    const s = w.len * BIG / size.z;
    w.inner.rotation.y = th; w.wrap.scale.setScalar(s);
    if (w.knife) {
      w.wrap.position.set(-s * c.x, -s * c.y, -s * (b.max.z - 0.15 * size.z));
      w.pivot.position.set(gx, w.sY, w.sZ); w.pivot.rotation.order = 'YXZ'; w.pivot.rotation.set(0.5, 0.8, 0);   // клинок вверх-влево
    } else w.wrap.position.set(gx - s * c.x, w.sY - s * b.max.y, w.sZ + w.muz * BIG - s * b.min.z);
    anch.R = new V(gx, w.sY + w.R[0] * BIG, w.sZ + w.R[1] * BIG);
    anch.L = w.L ? new V(gx, w.sY + w.L[0] * BIG, w.sZ + w.L[1] * BIG) : null;
    build();
  }
  window.HW_set = name => { if (!W[name]) return; cur = name; if (sel === 'L' && !W[name].L) sel = 'R'; loadW(name); place(); refresh(); };

  function refresh() {
    const t = tune[cur][sel] || tune[cur].R;
    for (const k in sliders) sliders[k].value = t[k];
    const el = id => document.getElementById(id);
    if (el('hn-wp')) { el('hn-wp').textContent = 'Оружие: ' + cur; el('hn-sel').textContent = 'Рука: ' + (sel === 'R' ? 'правая' : 'левая'); }
  }
  function buildPanel() {
    const css = document.createElement('style');
    css.textContent =
      '#hn-b{position:absolute;top:8px;left:50%;margin-left:110px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(15,23,42,.8);color:#fff;font-size:18px}' +
      '#hn-p{position:absolute;top:54px;left:50%;transform:translateX(-50%);z-index:60;width:min(520px,94vw);background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:8px 10px;color:#fff;font:12px sans-serif;display:none}' +
      '#hn-g{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}#hn-p label{display:flex;align-items:center;gap:6px;height:24px}#hn-p label span{width:64px}#hn-p input{flex:1;min-width:0}' +
      '#hn-p button{margin:6px 6px 0 0;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:#334155;color:#fff;font-size:12px}';
    document.head.appendChild(css);
    const gear = document.createElement('button'), p = document.createElement('div'), grid = document.createElement('div');
    gear.id = 'hn-b'; gear.className = 'interactive-ui'; gear.textContent = '⚙'; p.id = 'hn-p'; p.className = 'interactive-ui'; grid.id = 'hn-g';
    gear.addEventListener('click', () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; });
    [['x', -8, 8, 0.05, 'Вбок'], ['y', -8, 8, 0.05, 'Вниз/вверх'], ['z', -8, 8, 0.05, 'Вперёд/назад'], ['k', 0, 1.3, 0.05, 'Пальцы'],
     ['pitch', -90, 90, 1, 'Наклон'], ['yaw', -90, 90, 1, 'Разворот'], ['roll', -180, 180, 1, 'Кисть']].forEach(([k, lo, hi, st, name]) => {
      const r = document.createElement('label');
      r.innerHTML = '<span>' + name + '</span><input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '">';
      const inp = r.querySelector('input'); sliders[k] = inp;
      inp.addEventListener('input', () => { (tune[cur][sel] || tune[cur].R)[k] = +inp.value; build(); save(); });
      grid.appendChild(r);
    });
    p.appendChild(grid);
    const btn = (txt, fn, id) => { const b = document.createElement('button'); b.textContent = txt; if (id) b.id = id; b.addEventListener('click', fn); p.appendChild(b); };
    btn('', () => { const ks = Object.keys(W); (window.GAME_SET || window.HW_set)(ks[(ks.indexOf(cur) + 1) % ks.length]); }, 'hn-wp');
    btn('', () => { if (W[cur].L) sel = sel === 'R' ? 'L' : 'R'; refresh(); }, 'hn-sel');
    btn('Развернуть оружие', () => { tune[cur].f = tune[cur].f ? 0 : 1; save(); place(); });
    btn('Сброс', () => { tune[cur] = JSON.parse(JSON.stringify(DEF[cur])); save(); place(); refresh(); });
    btn('Копировать', () => prompt('Скопируй и пришли мне:', JSON.stringify(tune)));
    document.body.appendChild(gear); document.body.appendChild(p); refresh();
  }

  window.loadGLTFModels = function () {
    weaponContainer.add(holder);
    buildPanel();
    window.addEventListener('resize', place);
    loadW('rifle', place);
    setTimeout(() => { loadW('usp'); loadW('knife'); }, 1500);   // заранее, чтобы не было паузы при смене
  };
})();
