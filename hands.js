/* hands.js — АК-47 + свои блочные руки с пальцами (чужие модели не нужны).
   Подключать ПОСЛЕ основного <script> в index.html. */
(function () {
  const DEG = Math.PI / 180, KEY = 'hands_v3';
  const SKIN = new THREE.MeshStandardMaterial({ color: 0xfca5a5, roughness: 0.65 });
  const SLEEVE = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 });
  const CUFF = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 });

  // Позы пальцев: загиб 3 фаланг (градусы) для указательного..мизинца + 2 фаланги большого
  // Новое оружие = новая поза здесь (например pistol) + запись в DEF ниже.
  const POSES = {
    grip: { f: [[-35, -40, -25], [-70, -75, -50], [-75, -80, -55], [-75, -75, -55]], th: [-15, -20] }, // рукоятка
    cup:  { f: [[-45, -60, -40], [-55, -65, -45], [-60, -65, -45], [-60, -60, -40]], th: [-10, -15] }  // цевьё снизу
  };
  // Где держат (доли габарита оружия) + повороты. x,y,z — подгонка в «ладонях»
  const DEF = {
    R: { pose: 'grip', fy: -0.1, fz: 0.12, x: 0.45, y: 0, z: 0, pitch: 20, yaw: 12, roll: -85, k: 1 },
    L: { pose: 'cup', fy: -0.02, fz: -0.26, x: -0.2, y: -0.5, z: 0, pitch: 15, yaw: -15, roll: 155, k: 1 }
  };
  const tune = JSON.parse(JSON.stringify(DEF));
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) ['R', 'L'].forEach(h => Object.assign(tune[h], s[h]));
  } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tune)); } catch (e) {} };

  // Цепочка фаланг: каждая следующая — потомок предыдущей, поэтому гнётся как палец
  function chain(x, y, z, lens, t, curls, yaw, k) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.order = 'YXZ';
    root.rotation.y = yaw;
    let parent = root;
    lens.forEach((len, i) => {
      const j = new THREE.Group();
      j.rotation.x = curls[i] * k * DEG;
      if (i) j.position.z = -lens[i - 1];
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len * 0.96), SKIN);
      m.position.z = -len / 2;
      j.add(m);
      parent.add(j);
      parent = j;
    });
    return root;
  }

  // Рука: ладонь в нуле, пальцы вперёд (−z), предплечье назад (+z). u — размер ладони
  function makeHand(side, pose, u, k) {
    const sx = side === 'R' ? -1 : 1;           // с какой стороны большой палец
    const P = POSES[pose], g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.95 * u, 0.38 * u, 1.05 * u), SKIN));
    const lens = [[0.5, 0.35, 0.28], [0.55, 0.4, 0.3], [0.5, 0.37, 0.28], [0.4, 0.28, 0.24]];
    for (let i = 0; i < 4; i++) {
      g.add(chain(sx * (0.33 - i * 0.22) * u, 0, -0.52 * u, lens[i].map(v => v * u), 0.2 * u, P.f[i], 0, k));
    }
    g.add(chain(sx * 0.5 * u, -0.02 * u, 0.2 * u, [0.55 * u, 0.42 * u], 0.24 * u, P.th, -sx * 0.5, k));
    const part = (a, b, w, h, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * u, h * u, (b - a) * u), mat);
      m.position.z = (a + b) / 2 * u;
      g.add(m);
    };
    part(0.5, 1.9, 0.8, 0.5, SKIN);     // запястье
    part(1.9, 2.1, 1.05, 0.85, CUFF);   // манжета
    part(2.1, 7, 1.0, 0.9, SLEEVE);     // рукав за край экрана
    return g;
  }
  window.makeHand = makeHand;            // пригодится для ботов

  const holder = new THREE.Group();
  let akBox = null, sel = 'R';
  const sliders = {};

  function build() {
    while (holder.children.length) {
      const o = holder.children[0];
      holder.remove(o);
      o.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    }
    if (!akBox) return;
    const size = akBox.getSize(new THREE.Vector3()), c = akBox.getCenter(new THREE.Vector3());
    const u = size.z * 0.1;
    ['R', 'L'].forEach(s => {
      const t = tune[s], h = makeHand(s, t.pose, u, t.k);
      h.rotation.set(t.pitch * DEG, t.yaw * DEG, t.roll * DEG);
      h.position.set(c.x + t.x * u, c.y + t.fy * size.y + t.y * u, c.z + t.fz * size.z + t.z * u);
      holder.add(h);
    });
  }

  function refresh() {
    for (const k in sliders) sliders[k].value = tune[sel][k];
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
    [['x', -3, 3, 0.05, 'Вбок'], ['y', -3, 3, 0.05, 'Вниз/вверх'], ['z', -3, 3, 0.05, 'Вперёд/назад'], ['k', 0, 1.3, 0.05, 'Пальцы'],
     ['pitch', -90, 90, 1, 'Наклон'], ['yaw', -90, 90, 1, 'Разворот'], ['roll', -180, 180, 1, 'Кисть']
    ].forEach(([k, lo, hi, st, name]) => {
      const r = document.createElement('label');
      r.innerHTML = '<span>' + name + '</span><input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '">';
      const inp = r.querySelector('input');
      sliders[k] = inp;
      inp.addEventListener('input', () => { tune[sel][k] = +inp.value; build(); save(); });
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
    btn('', () => { sel = sel === 'R' ? 'L' : 'R'; refresh(); }, 'hn-sel');
    btn('Сброс', () => { tune[sel] = JSON.parse(JSON.stringify(DEF[sel])); build(); save(); refresh(); });
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
      // габарит АК в системе weaponContainer
      const tmp = new THREE.Group();
      tmp.add(ak);
      tmp.updateMatrixWorld(true);
      akBox = new THREE.Box3().setFromObject(ak);
      weaponContainer.add(ak);
      build();
    }, undefined, err => {
      console.log('АК-47 не найден', err);
      akBox = new THREE.Box3(new THREE.Vector3(0.1, -0.45, -0.95), new THREE.Vector3(0.45, -0.15, -0.2));
      build();
    });
  };
})();
