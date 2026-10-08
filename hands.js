/* hands.js — оружие (АК, 3 пистолета, нож) и свои руки в перчатках.
   Подключать ПОСЛЕ основного <script> в index.html. */
(function () {
  const DEG = Math.PI / 180, KEY = 'hands_v12', V = THREE.Vector3;
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
  const Hk = (k, ...a) => { const h = H(...a); h.k = k; return h; };
  // Твои настройки из ⚙ (ox/oy/oz — сдвиг оружия вместе с руками, wz — только оружие, sz — размер, kp/ky/kr — поворот ножа)
  const DEF = {
    rifle:   { R: H('pistol', 0.5, -1.2, 0, 15, 10, -85), L: H('cup', 0.55, -1, 0.5, 4, -18, 150), f: 0, ox: -0.12, oy: 0.01 },
    usp:     { R: Hk(1.3, 'pistol', 0.65, 0.1, 0.65, 20, -27, -66), L: Hk(0.35, 'fist', -0.3, -0.3, 0.45, 20, -10, 85), f: 0, ox: -0.185, sz: 1.18, oy: 0.045, wz: -0.12, kp: -1 },
    deagle:  { R: Hk(1.3, 'pistol', 0.65, 0.1, 0.55, 20, -18, -85), L: Hk(0.25, 'fist', -0.65, -0.1, 0.6, 20, -30, 85), f: 0, ox: -0.075, oy: -0.02 },
    beretta: { R: Hk(1.3, 'pistol', 0.85, -0.65, 0.45, 38, -24, -114), L: Hk(0.4, 'fist', -0.3, -0.45, 0.55, 20, -30, 75), f: 0, sz: 0.98, ox: -0.105, oy: 0.04, oz: -0.095, wz: 0.03, kr: -36 },
    knife:   { R: H('fist', 0.2, 0, 0, 19, -17, -17), L: H('open', -4.2, -0.5, -0.5, 25, -20, 0), f: 1, ox: -0.04, sz: 0.78, oz: -0.075, wz: -0.025, kp: 4, ky: 71, kr: 107 }
  };
  // Оружие: файл, длина (м), где на экране мушка (ndcX; sY/sZ — в камере, метры), muz — дульный срез от мушки,
  // R/L — точки рук как смещение от мушки [вниз, назад]. У ножа sY/sZ — точка рукояти. Пример: референсы Standoff 2.
  const PIS = { ndcX: 0.272, sY: -0.077, sZ: -0.56, muz: -0.02, R: [-0.118, 0.2], L: [-0.118, 0.2] };
  const W = {
    rifle:   { file: 'ak-47_low_poly.glb', len: 0.88, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, yaw: Math.PI, R: [-0.076, 0.51], L: [-0.076, 0.19] },
    usp:     Object.assign({ file: 'low-poly_usp-s.glb', len: 0.34 }, PIS),
    deagle:  Object.assign({ file: 'low-poly_desert_eagle.glb', len: 0.27 }, PIS, { ndcX: 0.245 }),
    beretta: Object.assign({ file: 'low-poly_beretta_92fs.glb', len: 0.32 }, PIS),
    knife:   { file: 'knife_default_t__cs2.glb', len: 0.46, knife: 1, ndcX: 0.441, sY: -0.165, sZ: -0.38, R: [0, 0], L: [0, 0] }
  };
  const tune = JSON.parse(JSON.stringify(DEF));
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) for (const n in DEF) if (s[n]) { ['R', 'L'].forEach(h => { if (tune[n][h]) Object.assign(tune[n][h], s[n][h]); }); tune[n].f = s[n].f | 0; ['sz', 'ox', 'oy', 'oz', 'wz', 'kp', 'ky', 'kr'].forEach(k => { if (s[n][k] !== undefined) tune[n][k] = s[n][k]; }); }
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

  const holder = new THREE.Group(), anch = {}, sliders = {}, wsl = {}, animRoot = new THREE.Group();
  animRoot.matrixAutoUpdate = false;               // оружие и руки двигаются вместе через animRoot
  let cur = 'rifle', sel = 'R', ins = null, drw = null;       // ins — идёт осмотр ножа

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
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.metalness > 0.4) m.metalness = 0.3; m.side = THREE.DoubleSide;
        if (name !== 'rifle') { m.metalness = 0; m.roughness = 0.7; if (m.emissive) { m.emissive.set(0x555555); if (m.map) m.emissiveMap = m.map; } else if (m.color) m.color.setRGB(1.6, 1.6, 1.6); m.needsUpdate = true; } });
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 2) P.push(new V().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
      });
      w.P = P; w.inner = s; w.yaw0 = w.yaw !== undefined ? w.yaw : autoYaw(P, w.knife);
      w.wrap = new THREE.Group(); w.pivot = new THREE.Group();
      w.wrap.add(s); w.pivot.add(w.wrap); animRoot.add(w.pivot);
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
      h.userData.bp = h.position.clone(); h.userData.br = q.roll * DEG; h.userData.side = s;
      holder.add(h);
    });
  }
  // ставит оружие и руки так, чтобы мушка попала в точку экрана с референса (при любом соотношении сторон)
  function place() {
    for (const n in W) if (W[n].pivot) W[n].pivot.visible = n === cur;
    const w = W[cur];
    if (!w || !w.ready) { build(); return; }
    const gx = w.ndcX * -w.sZ * Math.tan(camera.fov * 0.5 * DEG) * camera.aspect + (tune[cur].ox || 0), sY = w.sY + (tune[cur].oy || 0), sZ = w.sZ + (tune[cur].oz || 0), wz = tune[cur].wz || 0;
    const th = w.yaw0 + (tune[cur].f ? Math.PI : 0), b = bboxYaw(w.P, th), size = b.getSize(new V()), c = b.getCenter(new V());
    const s = w.len * BIG / size.z * (tune[cur].sz || 1);
    w.inner.rotation.y = th; w.wrap.scale.setScalar(s);
    if (w.knife) {
      w.wrap.position.set(-s * c.x, -s * c.y, -s * (b.max.z - 0.15 * size.z));
      w.pivot.position.set(gx, sY, sZ + wz); w.pivot.rotation.order = 'YXZ';
      const kv = (k, d) => (tune[cur][k] !== undefined ? tune[cur][k] : d) * DEG; w.pivot.rotation.set(kv('kp', 29), kv('ky', 46), kv('kr', 0)); w.base = { x: gx, y: sY, z: sZ + wz, rz: kv('kr', 0) };   // клинок вверх-влево
    } else {
      const wp = new V(gx - s * c.x, sY - s * b.max.y, sZ + wz + w.muz * BIG - s * b.min.z), ctr = wp.clone().add(c.clone().multiplyScalar(s));   // центр оружия — точка вращения
      w.wrap.position.copy(wp).sub(ctr); w.pivot.position.copy(ctr); w.base = { x: ctr.x, y: ctr.y, z: ctr.z, rz: 0 };
    }
    anch.R = new V(gx, sY + w.R[0] * BIG, sZ + w.R[1] * BIG);
    anch.L = w.L ? new V(gx, sY + w.L[0] * BIG, sZ + w.L[1] * BIG) : null;
    build();
  }
  window.HW_set = name => { if (!W[name]) return; ins = null; drw = { t0: performance.now() }; cur = name; if (sel === 'L' && !W[name].L) sel = 'R'; loadW(name); place(); refresh(); };

  function refresh() {
    const t = tune[cur][sel] || tune[cur].R;
    for (const k in sliders) sliders[k].value = t[k];
    for (const k in wsl) wsl[k].value = tune[cur][k] !== undefined ? tune[cur][k] : ({ sz: 1, ox: 0, oy: 0, oz: 0, wz: 0, kp: 29, ky: 46, kr: 0 })[k];
    const el = id => document.getElementById(id);
    if (el('hn-wp')) { el('hn-wp').textContent = 'Оружие: ' + cur; el('hn-sel').textContent = 'Рука: ' + (sel === 'R' ? 'правая' : 'левая'); }
  }
  function buildPanel() {
    const css = document.createElement('style');
    css.textContent =
      '#hn-b{position:absolute;top:8px;left:50%;margin-left:110px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(15,23,42,.8);color:#fff;font-size:18px}' +
      '#hn-p{position:absolute;top:54px;left:50%;transform:translateX(-50%);z-index:60;width:min(520px,94vw);background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:8px 10px;color:#fff;font:12px sans-serif;display:none;max-height:calc(100% - 64px);overflow-y:auto;touch-action:pan-y}' +
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
    const g2 = document.createElement('div'); g2.id = 'hn-g';
    [['oz', -0.4, 0.4, 0.005, 'Всё вперёд/назад'], ['wz', -0.3, 0.3, 0.005, 'Оружие вперёд/назад'], ['kp', -90, 90, 1, 'Нож наклон'], ['ky', -90, 90, 1, 'Нож разворот'], ['kr', -180, 180, 1, 'Нож проворот'], ['sz', 0.5, 2.2, 0.02, 'Размер оружия'], ['ox', -0.3, 0.3, 0.005, 'Оружие влево/вправо'], ['oy', -0.3, 0.3, 0.005, 'Оружие вниз/вверх']].forEach(([k, lo, hi, st, name]) => {
      const r = document.createElement('label');
      r.innerHTML = '<span>' + name + '</span><input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '">';
      const inp = r.querySelector('input'); wsl[k] = inp;
      inp.addEventListener('input', () => { tune[cur][k] = +inp.value; save(); place(); });
      g2.appendChild(r);
    });
    p.appendChild(g2);
    const btn = (txt, fn, id) => { const b = document.createElement('button'); b.textContent = txt; if (id) b.id = id; b.addEventListener('click', fn); p.appendChild(b); };
    btn('', () => { const ks = Object.keys(W); (window.GAME_SET || window.HW_set)(ks[(ks.indexOf(cur) + 1) % ks.length]); }, 'hn-wp');
    btn('', () => { if (W[cur].L) sel = sel === 'R' ? 'L' : 'R'; refresh(); }, 'hn-sel');
    btn('Развернуть оружие', () => { tune[cur].f = tune[cur].f ? 0 : 1; save(); place(); });
    btn('Сброс', () => { tune[cur] = JSON.parse(JSON.stringify(DEF[cur])); save(); place(); refresh(); });
    btn('Копировать', () => prompt('Скопируй и пришли мне:', JSON.stringify(tune)));
    document.body.appendChild(gear); document.body.appendChild(p); refresh();
  }

  // Анимации (всё считается здесь, библиотеки не нужны):
  //  — доставание при смене оружия (нож «из кармана», автомат и пистолеты выезжают снизу),
  //  — осмотр по кнопке R (у ножа всегда, у остального когда магазин полный), — лёгкое дыхание.
  window.HW_inspect = () => {
    if (ins || (drw && performance.now() - drw.t0 < 700)) return false;
    const w = W[cur]; ins = { t0: performance.now(), type: w.knife ? 'knife' : cur === 'rifle' ? 'rifle' : 'pistol' }; return true;
  };
  window.HW_stop = () => { ins = null; };
  const ease = t => t * t * (3 - 2 * t);
  function tick() {
    requestAnimationFrame(tick);
    const w = W[cur];
    if (!w || !w.ready || !w.base) return;
    const ms = performance.now(), now = ms / 1000;
    const o = { x: Math.sin(now * 1.3) * 0.0015, y: Math.sin(now * 1.7) * 0.0025, z: 0, rx: 0, ry: 0, rz: 0 };
    let spin = 0;
    if (drw) {
      const D = w.knife ? 0.55 : cur === 'rifle' ? 0.75 : 0.6, u = (ms - drw.t0) / 1000 / D;
      if (u >= 1) drw = null;
      else {
        const f = Math.pow(1 - u, 3);                                   // быстро выезжает, мягко останавливается
        o.x += 0.2 * f; o.y -= 0.5 * f; o.z += 0.06 * f; o.rx -= 0.8 * f;
        o.rz += (w.knife ? 0.7 : 0.3) * f + (w.knife ? Math.sin(u * 9) * 0.12 * (1 - u) : 0);   // у ножа лёгкий «щелчок» в конце
      }
    }
    if (ins) {
      const D = ins.type === 'knife' ? 2.6 : ins.type === 'rifle' ? 2.8 : 2.2, t = (ms - ins.t0) / 1000;
      if (t >= D) ins = null;
      else {
        const k = ease(Math.min(t / 0.5, 1)) * (1 - ease(Math.min(Math.max((t - (D - 0.7)) / 0.7, 0), 1)));   // поднесли → вернули
        if (ins.type === 'knife') { o.x -= 0.14 * k; o.y += 0.07 * k; o.z += 0.1 * k; spin = 0.5 * k + ease(Math.min(Math.max((t - 0.5) / 1.4, 0), 1)) * Math.PI * 2; }
        else {
          const ph = Math.min(Math.max((t - 0.4) / (D - 1.1), 0), 1);
          o.x -= 0.1 * k; o.y += 0.06 * k; o.z += 0.08 * k; o.rx += 0.25 * k;
          o.ry += Math.sin(ph * Math.PI * 2) * 0.7 * k; o.rz += Math.sin(ph * Math.PI) * 0.3 * k;      // поворачиваем, показываем бока
        }
      }
    }
    const b = w.base, E = new THREE.Euler(o.rx, o.ry, o.rz + (w.knife ? spin * 0.3 : 0), 'YXZ');
    animRoot.matrix.makeTranslation(b.x + o.x, b.y + o.y, b.z + o.z)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(E)).multiply(new THREE.Matrix4().makeTranslation(-b.x, -b.y, -b.z));
    animRoot.matrixWorldNeedsUpdate = true;
    if (w.knife) w.pivot.rotation.z = b.rz + spin * 0.7;                // нож крутится вокруг своей оси, рука слегка с ним
  }

  window.loadGLTFModels = function () {
    weaponContainer.add(animRoot); animRoot.add(holder);
    buildPanel(); tick();
    window.addEventListener('resize', place);
    loadW('rifle', place);
    setTimeout(() => { loadW('usp'); loadW('knife'); }, 1500);   // заранее, чтобы не было паузы при смене
  };
})();
