/* hands.js — АК-47 и руки, расставленные по референсу (AKR "Carbon").
   Подключать ПОСЛЕ основного <script> в index.html. Нож и пистолет добавим позже. */
(function () {
  const DEG = Math.PI / 180, KEY = 'hands_v6';
  // Точки с референса. Камера смотрит в −z, единицы — метры.
  // ndcX — где на экране мушка (0.207 = 60% ширины), sightY/sightZ — мушка в пространстве камеры,
  // muzzleZ — дульный срез, len — длина АК, axisY — ось ствола, handguardZ/gripZ — где держатся руки.
  // BIG — размер АК и рук: 1 = реальный, больше = крупнее (как в Standoff 2). Мушка остаётся на месте экрана,
  // оружие вырастает от неё вниз-вправо, к камере.
  const BIG = 1.35;
  const sc = (v, s) => s + BIG * (v - s);
  const REF = { ndcX: 0.207, sightY: -0.079, sightZ: -0.93, muzzleZ: sc(-1.0, -0.93), len: 0.88 * BIG,
                axisY: sc(-0.155, -0.079), handguardZ: sc(-0.74, -0.93), gripZ: sc(-0.42, -0.93) };
  const U = 0.105 * BIG;   // размер ладони (чуть крупнее реальной, как в FPS)
  const mat = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r || 0.7 });
  const SKIN = mat(0xe8a98a, 0.65), GLOVE = mat(0x3b3f46), CUFF = mat(0x2a2d32), PAD = mat(0x555a63);

  // Позы пальцев: загиб фаланг (градусы). Новая поза = новая строка.
  const POSES = {
    pistol: { f: [[-25, -30, -15], [-80, -90, -65], [-80, -90, -65], [-75, -85, -60]], th: [-20, -25] }, // палец у спуска
    cup:    { f: [[-45, -60, -40], [-55, -65, -45], [-60, -65, -45], [-60, -60, -40]], th: [-10, -15] }  // цевьё снизу
  };
  // Положение рук от точки на оси ствола (в ладонях U) + повороты
  const H = (pose, x, y, z, pitch, yaw, roll) => ({ pose, x, y, z, pitch, yaw, roll, k: 1 });
  const DEF = {
    R: H('pistol', 0.5, -1.2, 0, 15, 10, -85),
    L: H('cup', 0.55, -1, 0.5, 4, -18, 150)
  };
  const tune = JSON.parse(JSON.stringify(DEF));
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) ['R', 'L'].forEach(h => Object.assign(tune[h], s[h]));
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
      g.add(chain(sx * (0.33 - i * 0.22) * u, 0, -0.52 * u, lens[i].map(v => v * u), 0.2 * u, P.f[i], 0, k, [GLOVE, GLOVE, SKIN]));
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
  const anchors = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  let akObj = null, akBox = null, sel = 'R';
  const sliders = {};

  function build() {
    while (holder.children.length) {
      const o = holder.children[0];
      holder.remove(o);
      o.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    }
    if (!akObj) return;
    ['R', 'L'].forEach(s => {
      const t = tune[s], a = anchors[s], h = makeHand(s, t.pose, U, t.k);
      h.rotation.set(t.pitch * DEG, t.yaw * DEG, t.roll * DEG);
      h.position.set(a.x + t.x * U, a.y + t.y * U, a.z + t.z * U);
      holder.add(h);
    });
  }

  // Ставит АК и руки так, чтобы мушка и цевьё попали в те же места экрана, что на референсе (при любом соотношении сторон)
  function place() {
    if (!akObj) return;
    const gx = REF.ndcX * -REF.sightZ * Math.tan(camera.fov * 0.5 * DEG) * camera.aspect;
    const size = akBox.getSize(new THREE.Vector3()), c = akBox.getCenter(new THREE.Vector3());
    const s = REF.len / size.z;
    akObj.scale.setScalar(s);
    akObj.position.set(gx - s * c.x, REF.sightY - s * akBox.max.y, REF.muzzleZ - s * akBox.min.z);
    anchors.R.set(gx, REF.axisY, REF.gripZ);
    anchors.L.set(gx, REF.axisY, REF.handguardZ);
    build();
  }

  function refresh() {
    for (const k in sliders) sliders[k].value = tune[sel][k];
    document.getElementById('hn-sel').textContent = 'Рука: ' + (sel === 'R' ? 'правая' : 'левая');
  }

  function buildPanel() {
    const css = document.createElement('style');
    css.textContent =
      '#hn-b{position:absolute;top:8px;left:50%;margin-left:110px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(15,23,42,.8);color:#fff;font-size:18px}' +
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
    [['x', -5, 5, 0.05, 'Вбок'], ['y', -5, 5, 0.05, 'Вниз/вверх'], ['z', -5, 5, 0.05, 'Вперёд/назад'], ['k', 0, 1.3, 0.05, 'Пальцы'],
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
    window.addEventListener('resize', place);
    new THREE.GLTFLoader().load('ak-47_low_poly.glb', gltf => {
      const ak = gltf.scene;
      ak.position.set(0, 0, 0);
      ak.scale.setScalar(1);
      ak.rotation.set(0, Math.PI, 0);
      const tmp = new THREE.Group();     // габарит АК в системе weaponContainer
      tmp.add(ak);
      tmp.updateMatrixWorld(true);
      akBox = new THREE.Box3().setFromObject(ak);
      weaponContainer.add(ak);
      akObj = ak;
      place();
    }, undefined, err => {
      console.log('АК-47 не найден', err);
      akBox = new THREE.Box3(new THREE.Vector3(-0.05, -0.15, -0.44), new THREE.Vector3(0.05, 0.1, 0.44));
      akObj = new THREE.Group();
      place();
    });
  };
})();
