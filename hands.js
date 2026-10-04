/* hands.js — АК-47 + блочные руки в перчатках; позы под калаш, пистолет и нож.
   Подключать ПОСЛЕ основного <script> в index.html. */
(function () {
  const DEG = Math.PI / 180, KEY = 'hands_v4';
  const mat = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r || 0.7 });
  const SKIN = mat(0xe8a98a, 0.65), GLOVE = mat(0x3b3f46), CUFF = mat(0x2a2d32), PAD = mat(0x555a63), DARK = mat(0x15171a, 0.4);

  // Позы пальцев: загиб фаланг (градусы), sp — разведение пальцев. Новая поза = новая строка.
  const POSES = {
    fist:   { f: [[-75, -85, -60], [-80, -90, -65], [-80, -90, -65], [-75, -85, -60]], th: [-30, -35] },
    pistol: { f: [[-25, -30, -15], [-80, -90, -65], [-80, -90, -65], [-75, -85, -60]], th: [-20, -25] }, // палец у спуска
    cup:    { f: [[-45, -60, -40], [-55, -65, -45], [-60, -65, -45], [-60, -60, -40]], th: [-10, -15] },
    open:   { f: [[-15, -20, -10], [-20, -25, -12], [-22, -28, -14], [-25, -30, -15]], th: [-5, -10], sp: [0.15, 0.05, -0.08, -0.2] }
  };
  // Положение рук от «точки хвата» оружия (в ладонях) + повороты. Новое оружие = новая запись.
  const H = (pose, x, y, z, pitch, yaw, roll) => ({ pose, x, y, z, pitch, yaw, roll, k: 1 });
  const DEF = {
    rifle:  { R: H('pistol', 0.45, 0, 0, 20, 12, -85),  L: H('cup', -0.2, -0.2, -3.8, 15, -15, 155) },
    pistol: { R: H('pistol', 0.5, 0, 0, 25, 8, -85),    L: H('fist', -0.5, -0.55, -0.1, 25, -8, 85) },
    knife:  { R: H('fist', 0.5, -0.1, 0.4, 35, 70, -20), L: H('open', -6, -1, 1.5, 25, -20, 0) }
  };
  const NAMES = { rifle: 'калаш', pistol: 'пистолет', knife: 'нож' };
  const tune = JSON.parse(JSON.stringify(DEF));
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) for (const w in DEF) ['R', 'L'].forEach(h => Object.assign(tune[w][h], (s[w] || {})[h]));
  } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tune)); } catch (e) {} };

  // Цепочка фаланг: каждая — потомок предыдущей, поэтому гнётся как палец
  function chain(x, y, z, lens, t, curls, yaw, k, mats) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.order = 'YXZ';
    root.rotation.y = yaw;
    let parent = root;
    lens.forEach((len, i) => {
      const j = new THREE.Group();
      j.rotation.x = curls[i] * k * DEG;
      if (i) j.position.z = -lens[i - 1];
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len * 0.96), mats[i]);
      m.position.z = -len / 2;
      j.add(m);
      parent.add(j);
      parent = j;
    });
    return root;
  }

  // Рука: ладонь в нуле, пальцы вперёд (−z), предплечье назад (+z). Перчатка без кончиков пальцев.
  function makeHand(side, pose, u, k) {
    const sx = side === 'R' ? -1 : 1;
    const P = POSES[pose], g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.95 * u, 0.38 * u, 1.05 * u), GLOVE));
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.7 * u, 0.12 * u, 0.6 * u), PAD);   // накладка на костяшках
    pad.position.set(0, 0.22 * u, -0.1 * u);
    g.add(pad);
    const lens = [[0.5, 0.35, 0.28], [0.55, 0.4, 0.3], [0.5, 0.37, 0.28], [0.4, 0.28, 0.24]];
    for (let i = 0; i < 4; i++) {
      g.add(chain(sx * (0.33 - i * 0.22) * u, 0, -0.52 * u, lens[i].map(v => v * u), 0.2 * u, P.f[i],
        P.sp ? -sx * P.sp[i] : 0, k, [GLOVE, GLOVE, SKIN]));
    }
    g.add(chain(sx * 0.5 * u, -0.02 * u, 0.2 * u, [0.55 * u, 0.42 * u], 0.24 * u, P.th, -sx * 0.5, k, [GLOVE, SKIN]));
    const part = (a, b, w, h, m) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w * u, h * u, (b - a) * u), m);
      p.position.z = (a + b) / 2 * u;
      g.add(p);
    };
    part(0.5, 1.5, 0.95, 0.62, CUFF);   // манжета перчатки
    part(1.5, 7, 0.85, 0.75, SKIN);     // голое предплечье за край экрана
    return g;
  }
  window.makeHand = makeHand;            // пригодится для ботов

  const holder = new THREE.Group();
  const W = {};                          // оружие: { obj, anchor }
  let U = 0.08, akBox = null, weapon = 'rifle', sel = 'R';
  const sliders = {};

  const blk = (w, h, d, m, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), m);
    b.position.set(x * U, y * U, z * U);
    return b;
  };
  // Заглушки пистолета и ножа: потом заменим настоящими моделями, позы останутся
  function makePistol() {
    const g = new THREE.Group(), grip = blk(0.45, 1.3, 0.7, DARK, 0, 0, 0);
    grip.rotation.x = -0.26;
    g.add(grip, blk(0.5, 0.55, 2.6, DARK, 0, 0.85, -0.9));
    g.position.set(0.22, -0.25, -0.5);
    return g;
  }
  function makeKnife() {
    const g = new THREE.Group();
    g.add(blk(0.28, 0.28, 1.1, DARK, 0, 0, 0), blk(0.1, 0.5, 2.4, PAD, 0, 0, -1.75));
    g.rotation.order = 'YXZ';
    g.rotation.set(0.6, 0.45, 0);
    g.position.set(0.3, -0.35, -0.5);
    return g;
  }

  function build() {
    while (holder.children.length) {
      const o = holder.children[0];
      holder.remove(o);
      o.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    }
    if (!akBox) return;
    for (const n in W) W[n].obj.visible = n === weapon;
    const a = W[weapon].anchor;
    ['R', 'L'].forEach(s => {
      const t = tune[weapon][s], h = makeHand(s, t.pose, U, t.k);
      h.rotation.set(t.pitch * DEG, t.yaw * DEG, t.roll * DEG);
      h.position.set(a.x + t.x * U, a.y + t.y * U, a.z + t.z * U);
      holder.add(h);
    });
  }

  function initWeapons(ak) {
    const size = akBox.getSize(new THREE.Vector3()), c = akBox.getCenter(new THREE.Vector3());
    U = size.z * 0.1;
    W.rifle = { obj: ak, anchor: new THREE.Vector3(c.x, c.y - 0.1 * size.y, c.z + 0.12 * size.z) };
    const p = makePistol(), k = makeKnife();
    weaponContainer.add(p, k);
    W.pistol = { obj: p, anchor: p.position.clone() };
    W.knife = { obj: k, anchor: k.position.clone() };
    build();
  }
  window.setWeapon = n => { if (W[n]) { weapon = n; build(); refresh(); } };   // для игры: setWeapon('knife')

  function refresh() {
    for (const k in sliders) sliders[k].value = tune[weapon][sel][k];
    document.getElementById('hn-w').textContent = 'Оружие: ' + NAMES[weapon];
    document.getElementById('hn-sel').textContent = 'Рука: ' + (sel === 'R' ? 'правая' : 'левая');
  }

  function buildPanel() {
    const css = document.createElement('style');
    css.textContent =
      '#hn-b{position:absolute;top:8px;left:50%;margin-left:-20px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(15,23,42,.8);color:#fff;font-size:18px}' +
      '#hn-p{position:absolute;top:54px;left:50%;transform:translateX(-50%);z-index:60;width:min(520px,94vw);background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:8px 10px;color:#fff;font:12px sans-serif;display:none}' +
      '#hn-g{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}' +
      '#hn-p label{display:flex;align-items:center;gap:6px;height:24px}#hn-p label span{width:64px}#hn-p input{flex:1;min-width:0}' +
      '#hn-p button{margin:6px 6px 0 0;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:#334155;color:#fff;font-size:12px}';
    document.head.appendChild(css);
    const gear = document.createElement('button');
    gear.id = 'hn-b'; gear.className = 'interactive-ui'; gear.textContent = '⚙';
    const p = document.createElement('div');
    p.id = 'hn-p'; p.className = 'interactive-ui';
    gear.addEventListener('click', () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; });
    const grid = document.createElement('div');
    grid.id = 'hn-g';
    [['x', -8, 8, 0.05, 'Вбок'], ['y', -8, 8, 0.05, 'Вниз/вверх'], ['z', -8, 8, 0.05, 'Вперёд/назад'], ['k', 0, 1.3, 0.05, 'Пальцы'],
     ['pitch', -90, 90, 1, 'Наклон'], ['yaw', -90, 90, 1, 'Разворот'], ['roll', -180, 180, 1, 'Кисть']
    ].forEach(([k, lo, hi, st, name]) => {
      const r = document.createElement('label');
      r.innerHTML = '<span>' + name + '</span><input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '">';
      const inp = r.querySelector('input');
      sliders[k] = inp;
      inp.addEventListener('input', () => { tune[weapon][sel][k] = +inp.value; build(); save(); });
      grid.appendChild(r);
    });
    p.appendChild(grid);
    const btn = (txt, fn, id) => {
      const b = document.createElement('button');
      b.textContent = txt;
      if (id) b.id = id;
      b.addEventListener('click', fn);
      p.appendChild(b);
    };
    btn('', () => { const ks = Object.keys(NAMES); weapon = ks[(ks.indexOf(weapon) + 1) % ks.length]; build(); refresh(); }, 'hn-w');
    btn('', () => { sel = sel === 'R' ? 'L' : 'R'; refresh(); }, 'hn-sel');
    btn('Сброс', () => { tune[weapon][sel] = JSON.parse(JSON.stringify(DEF[weapon][sel])); build(); save(); refresh(); });
    btn('Копировать', () => prompt('Скопируй и пришли мне:', JSON.stringify(tune)));
    document.body.appendChild(gear);
    document.body.appendChild(p);
    refresh();
  }

  // Заменяет loadGLTFModels из основного скрипта: грузим только АК
  window.loadGLTFModels = function () {
    weaponContainer.add(holder);
    buildPanel();
    new THREE.GLTFLoader().load('ak-47_low_poly.glb', gltf => {
      const ak = gltf.scene;
      ak.scale.set(0.144, 0.144, 0.144);
      ak.position.set(0.28, -0.38, -0.52);
      ak.rotation.set(0, Math.PI, 0);
      weaponContainer.add(ak);
      const tmp = new THREE.Group();     // габарит АК в системе weaponContainer
      tmp.add(ak);
      tmp.updateMatrixWorld(true);
      akBox = new THREE.Box3().setFromObject(ak);
      weaponContainer.add(ak);
      initWeapons(ak);
    }, undefined, err => {
      console.log('АК-47 не найден', err);
      akBox = new THREE.Box3(new THREE.Vector3(0.1, -0.45, -0.95), new THREE.Vector3(0.45, -0.15, -0.2));
      initWeapons(new THREE.Group());
    });
  };
})();
