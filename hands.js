/* hands.js — руки + АК-47. Подключать ПОСЛЕ основного <script> в index.html */
(function () {
  const FILES = ['default_counter-strike_hands_rigged.glb', 'counter-strike_source_viewmodel_hands.glb'];
  const NAMES = ['файл 1', 'файл 2', 'блочные'];
  const KEY = 'hands_v2', DEG = Math.PI / 180;
  const mk = (x, y, z, s) => ({ x, y, z, rx: 0, ry: 0, rz: 0, s: s || 1, o: 0 });
  const DEFAULTS = [mk(0.2, -0.35, -0.55, 0.8), mk(0, 0, 0), mk(0, 0, 0)];
  // 24 поворота по осям: листаем кнопкой «Поворот», пока предплечья не пойдут от нас вниз
  const ORI = [];
  [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].forEach(p => {
    for (let s = 0; s < 8; s++) {
      const e = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
      for (let i = 0; i < 3; i++) e[i * 4 + p[i]] = (s >> i) & 1 ? -1 : 1;
      const m = new THREE.Matrix4().set(...e);
      if (m.determinant() > 0) ORI.push(new THREE.Quaternion().setFromRotationMatrix(m));
    }
  });
  const tune = DEFAULTS.map(t => Object.assign({}, t));
  let mode = 0, shown = 0;
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) { mode = s.mode; s.tune.forEach((t, i) => { tune[i] = t; }); }
  } catch (e) {}
  if (mode !== 2) mode = 0;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ mode, tune })); } catch (e) {} };

  const holder = new THREE.Group();
  const loaded = [null, null], failed = [false, false], loading = [false, false];
  const sliders = {};
  let akBox = null, blocky = null, loader = null, bMode, bAnim, bOri;
  const clock = new THREE.Clock();

  // Габарит объекта в системе его родителя (с учётом скининга)
  function boxOf(obj) {
    const parent = obj.parent, tmp = new THREE.Group();
    tmp.add(obj);
    tmp.updateMatrixWorld(true);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    obj.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position;
      const skinned = o.isSkinnedMesh && o.boneTransform;
      for (let i = 0; i < pos.count; i++) {
        if (skinned) o.boneTransform(i, v); else v.fromBufferAttribute(pos, i);
        box.expandByPoint(v.applyMatrix4(o.matrixWorld));
      }
    });
    if (parent) parent.add(obj); else tmp.remove(obj);
    return box;
  }

  function setClip(L, idx) {
    L.mixer.stopAllAction();
    L.model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    L.idx = idx;
    if (idx >= 0) L.mixer.clipAction(L.clips[idx]).play();
  }

  // Подгон GLB-рук: любой масштаб -> длина 0.7, центр в нуле
  function prep(i, gltf) {
    const model = gltf.scene;
    model.traverse(o => {
      o.frustumCulled = false; // из-за этого скин-модели часто «пропадают»
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        m.side = THREE.DoubleSide;
        if (m.metalness > 0.3) m.metalness = 0.1;
      });
    });
    const box = boxOf(model);
    if (box.isEmpty()) { failed[i] = true; return; }
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const k = 0.7 / Math.max(size.x, size.y, size.z, 1e-6);
    const fit = new THREE.Group();
    fit.add(model);
    fit.scale.setScalar(k);
    fit.position.copy(c).multiplyScalar(-k);
    const pivot = new THREE.Group();
    pivot.add(fit);
    const L = loaded[i] = { pivot, model, fit, c, k, clips: gltf.animations || [], idx: -1, mixer: null };
    pivot.userData.L = L;
    if (L.clips.length) { L.mixer = new THREE.AnimationMixer(model); setClip(L, -1); }
  }

  // Блочные руки (как в Block Strike), ставятся по габариту АК
  function buildBlocky(b) {
    const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const u = size.z * 0.1;
    const skin = new THREE.MeshStandardMaterial({ color: 0xfca5a5, roughness: 0.6 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });
    const g = new THREE.Group();
    g.userData.base = c;
    const limb = (a, e, t, m) => {
      const d = new THREE.Vector3().subVectors(e, a);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, t, d.length()), m);
      mesh.position.addVectors(a, e).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
      return mesh;
    };
    const arm = (p, dir) => {
      const d = dir.normalize();
      const wrist = p.clone().addScaledVector(d, 1.4 * u);
      const elbow = p.clone().addScaledVector(d, 6 * u);
      g.add(limb(p.clone().addScaledVector(d, -0.6 * u), wrist, 1.1 * u, skin));
      g.add(limb(wrist, elbow, 1.3 * u, sleeve));
    };
    arm(new THREE.Vector3(0, -0.1 * size.y, 0.12 * size.z), new THREE.Vector3(0.5, -0.6, 1));   // правая — на рукоятке
    arm(new THREE.Vector3(0, 0, -0.26 * size.z), new THREE.Vector3(-0.4, -0.5, 1));             // левая — на цевье
    return g;
  }

  function pose(target, t) {
    const b = target.userData.base || { x: 0, y: 0, z: 0 };
    target.position.set(b.x + t.x, b.y + t.y, b.z + t.z);
    target.rotation.set(t.rx * DEG, t.ry * DEG, t.rz * DEG);
    target.scale.setScalar(t.s);
    const L = target.userData.L;
    if (L) {
      const q = ORI[t.o | 0];
      L.fit.quaternion.copy(q);
      L.fit.position.copy(L.c).multiplyScalar(-L.k).applyQuaternion(q);
    }
  }

  function fetchHands(i) {
    loading[i] = true;
    loader.load(FILES[i], g => {
      loading[i] = false;
      try { prep(i, g); } catch (e) { failed[i] = true; console.log(e); }
      show();
    }, undefined, e => { loading[i] = false; failed[i] = true; console.log('Не загрузился ' + FILES[i], e); show(); });
  }

  function show() {
    while (holder.children.length) holder.remove(holder.children[0]);
    let m = mode;
    if (m < 2 && !loaded[m]) {
      if (!failed[m] && !loading[m]) fetchHands(m);
      m = failed[m] ? 2 : -1;
    }
    if (m === 2 && !blocky && akBox) blocky = buildBlocky(akBox);
    shown = m >= 0 ? m : mode;
    const target = m === 2 ? blocky : (m >= 0 ? loaded[m].pivot : null);
    if (target) { pose(target, tune[shown]); holder.add(target); }
    refresh();
  }

  function apply() {
    const t = shown === 2 ? blocky : (loaded[shown] && loaded[shown].pivot);
    if (t) pose(t, tune[shown]);
  }

  function refresh() {
    if (!bMode) return;
    const t = tune[shown];
    for (const k in sliders) sliders[k].value = t[k];
    bOri.textContent = 'Поворот: ' + ((t.o | 0) + 1) + '/24';
    bMode.textContent = 'Руки: ' + NAMES[mode] + (mode !== shown && mode < 2 && failed[mode] ? ' (не загрузились)' : '');
    const L = loaded[shown];
    bAnim.textContent = L && L.mixer ? 'Анимация: ' + (L.idx < 0 ? 'нет' : (L.clips[L.idx].name || L.idx)) : 'Анимаций нет';
  }

  function buildPanel() {
    const css = document.createElement('style');
    css.textContent =
      '#hn-b{position:absolute;top:8px;left:50%;margin-left:-20px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(15,23,42,.8);color:#fff;font-size:18px}' +
      '#hn-p{position:absolute;top:54px;left:50%;transform:translateX(-50%);z-index:60;width:min(520px,94vw);background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:8px 10px;color:#fff;font:12px sans-serif;display:none}' +
      '#hn-g{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}' +
      '#hn-p label{display:flex;align-items:center;gap:6px;height:24px}#hn-p label span{width:58px}#hn-p input{flex:1;min-width:0}' +
      '#hn-p button{margin:6px 6px 0 0;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:#334155;color:#fff;font-size:12px}';
    document.head.appendChild(css);

    const gear = document.createElement('button');
    gear.id = 'hn-b'; gear.className = 'interactive-ui'; gear.textContent = '⚙';
    const p = document.createElement('div');
    p.id = 'hn-p'; p.className = 'interactive-ui';
    gear.addEventListener('click', () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; });

    const grid = document.createElement('div');
    grid.id = 'hn-g';
    [['x', -0.6, 0.6, 0.005, 'Влево/вправо'], ['y', -0.6, 0.6, 0.005, 'Вниз/вверх'], ['z', -1.2, 0.4, 0.005, 'Назад/вперёд'],
     ['s', 0.2, 3, 0.01, 'Размер'], ['rx', -180, 180, 1, 'Поворот X'], ['ry', -180, 180, 1, 'Поворот Y'], ['rz', -180, 180, 1, 'Поворот Z']
    ].forEach(([k, lo, hi, st, name]) => {
      const r = document.createElement('label');
      r.innerHTML = '<span>' + name + '</span><input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '">';
      const inp = r.querySelector('input');
      sliders[k] = inp;
      inp.addEventListener('input', () => { tune[shown][k] = +inp.value; apply(); save(); });
      grid.appendChild(r);
    });
    p.appendChild(grid);

    const btn = (txt, fn) => {
      const b = document.createElement('button');
      b.textContent = txt;
      b.addEventListener('click', fn);
      p.appendChild(b);
      return b;
    };
    bMode = btn('', () => { mode = mode === 0 ? 2 : 0; save(); show(); });
    bOri = btn('', () => { const t = tune[shown]; t.o = ((t.o | 0) + 1) % 24; apply(); save(); refresh(); });
    bAnim = btn('', () => {
      const L = loaded[shown];
      if (!L || !L.mixer) return;
      const n = L.idx + 1;
      setClip(L, n >= L.clips.length ? -1 : n);
      refresh();
    });
    btn('Сброс', () => { tune[shown] = Object.assign({}, DEFAULTS[shown]); apply(); save(); refresh(); });
    btn('Копировать', () => prompt('Скопируй и пришли мне:', NAMES[shown] + ' ' + JSON.stringify(tune[shown])));

    document.body.appendChild(gear);
    document.body.appendChild(p);
  }

  // Заменяет loadGLTFModels из основного скрипта
  window.loadGLTFModels = function () {
    loader = new THREE.GLTFLoader();
    weaponContainer.add(holder);
    buildPanel();
    loader.load('ak-47_low_poly.glb', gltf => {
      const ak = gltf.scene;
      ak.scale.set(0.144, 0.144, 0.144);
      ak.position.set(0.28, -0.38, -0.52);
      ak.rotation.set(0, Math.PI, 0);
      weaponContainer.add(ak);
      akBox = boxOf(ak);
      show();
    }, undefined, err => {
      console.log('АК-47 не найден', err);
      akBox = new THREE.Box3(new THREE.Vector3(0.1, -0.45, -0.95), new THREE.Vector3(0.45, -0.15, -0.2));
      show();
    });
    show();
  };

  (function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    loaded.forEach(L => { if (L && L.mixer) L.mixer.update(dt); });
  })();
})();
