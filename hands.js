/* hands.js — оружие (АК, 3 пистолета, нож) и свои руки в перчатках.
   Подключать ПОСЛЕ основного <script> в index.html. */
(function () {
  const DEG = Math.PI / 180, KEY = 'hands_v16', V = THREE.Vector3;
  const BIG = 1.35, U = 0.105 * BIG;      // BIG — размер оружия и рук (1 = реальный)
  const mat = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r || 0.7 });
  const SKIN = mat(0xe8a98a, 0.65), GLOVE = mat(0x3b3f46), CUFF = mat(0x2a2d32), PAD = mat(0x555a63);
  // Скины рук: положи в репозиторий glove.png / skin.png / cuff.png (перчатка, кожа, манжета) — игра подхватит сама
  ['glove', 'skin', 'cuff'].forEach(n => new THREE.TextureLoader().load(n + '.png', t => {
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    const m = { glove: GLOVE, skin: SKIN, cuff: CUFF }[n]; m.map = t; m.color.set(0xffffff); m.needsUpdate = true;
  }, undefined, () => {}));

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
    rifle:  { R: H('pistol', 0.5, -1.2, 0, 15, 10, -85), L: H('cup', 0.55, -1, 0.5, 4, -18, 150), f: 0, ox: -0.12, oy: 0.01 },
    awp:    { R: H('pistol', 0.5, -1.2, 0, 15, 10, -85), L: Hk(1.3, 'cup', -0.2, -1, 1.35, 10, -18, 150), f: 0, ox: -0.18, oy: 0.04, wz: -0.3 },
    usp:    { R: Hk(1.3, 'pistol', 0.3, -0.2, 0.55, 29, -28, -66), L: Hk(0.8, 'fist', -0.45, -0.3, 0.2, 20, -10, 85), f: 0, ox: -0.1, sz: 1.52, oy: 0.015, wz: -0.3, kp: 60, oz: -0.125 },
    glock:  { R: Hk(1.3, 'pistol', 0.3, -0.2, 0.55, 29, -28, -66), L: Hk(0.8, 'fist', -0.45, -0.3, 0.2, 20, -10, 85), f: 0, ox: -0.1, sz: 1.3, oy: 0.015, wz: -0.135, oz: -0.125 },
    deagle: { R: Hk(1.3, 'pistol', 0.65, 0.1, 0.55, 20, -18, -85), L: Hk(0.25, 'fist', -0.65, -0.1, 0.6, 20, -30, 85), f: 0, ox: -0.075, oy: -0.02 },
    knife:  { R: H('fist', 0.2, 0, 0, 19, -17, -17), L: H('open', -4.2, -0.5, -0.5, 25, -20, 0), f: 1, ox: -0.04, sz: 0.78, oz: -0.075, wz: -0.025, kp: 4, ky: 71, kr: 107 }
  };
  // Оружие: файл, длина (м), где на экране мушка (ndcX; sY/sZ — в камере, метры), muz — дульный срез от мушки,
  // R/L — точки рук как смещение от мушки [вниз, назад]. У ножа sY/sZ — точка рукояти. Пример: референсы Standoff 2.
  const PIS = { ndcX: 0.272, sY: -0.077, sZ: -0.56, muz: -0.02, R: [-0.118, 0.2], L: [-0.118, 0.2] };
  const W = {
    rifle:  { file: 'ak-47_low_poly.glb', len: 0.88, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, yaw: Math.PI, R: [-0.076, 0.51], L: [-0.076, 0.19] },
    awp:    { file: 'low_poly_awp.glb', len: 1.15, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, R: [-0.076, 0.55], L: [-0.076, 0.2] },
    usp:    Object.assign({ file: 'low-poly_usp-s.glb', len: 0.34 }, PIS),
    glock:  Object.assign({ file: 'glock.glb', len: 0.3 }, PIS),
    deagle: Object.assign({ file: 'low-poly_desert_eagle.glb', len: 0.27 }, PIS, { ndcX: 0.245 }),
    knife:  { file: 'knife_default_t__cs2.glb', len: 0.46, knife: 1, ndcX: 0.441, sY: -0.165, sZ: -0.38, R: [0, 0], L: [0, 0] },
    m4a4:    { file: 'rifle__m4a4_weapon_model_cs2.glb', len: 0.9, fix: 1, robust: 1, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, yaw: 0, R: [-0.076, 0.51], L: [-0.076, 0.19] },
    m16:     { file: 'low-poly_m16a4_acog.glb', len: 0.95, fix: 1, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, yaw: 0, R: [-0.076, 0.51], L: [-0.076, 0.19] },
    m249:    { file: 'low-poly_m249_saw.glb', len: 1.0, fix: 1, robust: 1, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, yaw: 0, R: [-0.076, 0.51], L: [-0.076, 0.19] },
    mossberg:{ file: 'low-poly_mossberg_590.glb', len: 0.95, fix: 1, pump: 1, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, yaw: 0, R: [-0.076, 0.51], L: [-0.076, 0.19] },
    m870:    { file: 'low_poly_shotgun-m870.glb', len: 0.95, fix: 1, pump: 1, ndcX: 0.207, sY: -0.079, sZ: -0.93, muz: -0.07, yaw: 0, R: [-0.076, 0.51], L: [-0.076, 0.19] },
    p250:    Object.assign({ file: 'sig_sauer_p250_low-poly.glb', len: 0.22 }, PIS, { fix: 1, yaw: 0 }),
    karambit:{ file: 'low_poly_stylized_karambit_knife.glb', len: 0.22, knife: 1, spin: 1, ndcX: 0.441, sY: -0.165, sZ: -0.38, R: [0, 0], L: [0, 0] }
  };
  // новые оружия: первичные — как АК (мушка/рука), пистолеты — как USP, нож — как нож
  // настройки рук для новых оружий — твои, подогнанные ползунками
  Object.assign(DEF, {"m4a4":{"R":{"pose":"pistol","x":0.5,"y":-1.2,"z":0,"pitch":15,"yaw":10,"roll":-85,"k":1},"L":{"pose":"cup","x":0.55,"y":-1,"z":0.5,"pitch":4,"yaw":-18,"roll":150,"k":1},"f":0,"ox":-0.12,"oy":0.01},"m16":{"R":{"pose":"pistol","x":1.5,"y":-4.9,"z":2.05,"pitch":15,"yaw":10,"roll":-85,"k":1},"L":{"pose":"cup","x":0.55,"y":-1.8,"z":0.5,"pitch":4,"yaw":-18,"roll":150,"k":1},"f":0,"ox":-0.12,"oy":0.12,"sz":1.64,"oz":-0.4,"wz":-0.3,"gr":180,"wy":0.3,"wx":0.12},"m249":{"R":{"pose":"pistol","x":0.5,"y":-1.2,"z":0,"pitch":15,"yaw":10,"roll":-85,"k":1},"L":{"pose":"cup","x":0.55,"y":-1,"z":0.5,"pitch":4,"yaw":-18,"roll":150,"k":1},"f":0,"ox":-0.12,"oy":0.01},"mossberg":{"R":{"pose":"pistol","x":1.75,"y":-1.2,"z":-0.55,"pitch":15,"yaw":10,"roll":-85,"k":1},"L":{"pose":"cup","x":0.55,"y":-1,"z":-0.55,"pitch":4,"yaw":-18,"roll":150,"k":1},"f":0,"ox":-0.12,"oy":0.01,"sz":0.76,"wz":-0.115,"gr":84,"gp":-90,"wx":0.11,"wy":-0.025},"m870":{"R":{"pose":"pistol","x":1.05,"y":-1.2,"z":0,"pitch":15,"yaw":10,"roll":-85,"k":0.3},"L":{"pose":"cup","x":0.55,"y":-1,"z":0.5,"pitch":4,"yaw":-18,"roll":150,"k":1.3},"f":0,"ox":-0.12,"oy":0.01,"sz":1.26,"wy":-0.07,"wz":0.015,"wx":0.045},"p250":{"R":{"pose":"pistol","x":0.3,"y":-0.55,"z":0.55,"pitch":29,"yaw":-28,"roll":-66,"k":1.3},"L":{"pose":"fist","x":-0.45,"y":-0.95,"z":0.2,"pitch":20,"yaw":-10,"roll":85,"k":0.3},"f":0,"ox":-0.1,"sz":1.7,"oy":0.015,"wz":-0.05,"kp":60,"oz":-0.125,"wy":-0.02},"karambit":{"R":{"pose":"fist","x":0.2,"y":0,"z":0,"pitch":19,"yaw":-17,"roll":-17,"k":0.7},"L":{"pose":"open","x":-4.2,"y":-0.5,"z":-0.5,"pitch":25,"yaw":-20,"roll":0,"k":1},"f":1,"ox":-0.04,"sz":1.08,"oz":-0.07,"wz":-0.07,"kp":4,"ky":71,"kr":107,"wy":-0.005,"wx":0.205}});
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
    const hand = new THREE.Group(), arm = new THREE.Group();            // кисть и предплечье двигаются отдельно (осмотр ножа)
    hand.matrixAutoUpdate = arm.matrixAutoUpdate = false; g.add(hand); g.add(arm);
    g.userData.hand = hand; g.userData.arm = arm; g.userData.wr = new V(0, 0, 0.5 * u); g.userData.el = new V(0, 0, 7 * u);   // запястье и локоть (в системе руки)
    hand.add(new THREE.Mesh(new THREE.BoxGeometry(0.95 * u, 0.38 * u, 1.05 * u), GLOVE));
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.7 * u, 0.12 * u, 0.6 * u), PAD);
    pad.position.set(0, 0.22 * u, -0.1 * u); hand.add(pad);
    const lens = [[0.5, 0.35, 0.28], [0.55, 0.4, 0.3], [0.5, 0.37, 0.28], [0.4, 0.28, 0.24]];
    for (let i = 0; i < 4; i++) hand.add(chain(sx * (0.33 - i * 0.22) * u, 0, -0.52 * u, lens[i].map(v => v * u), 0.2 * u, P.f[i], P.sp ? -sx * P.sp[i] : 0, k, [GLOVE, GLOVE, SKIN]));
    hand.add(chain(sx * 0.5 * u, -0.02 * u, 0.2 * u, [0.55 * u, 0.42 * u], 0.24 * u, P.th, -sx * 0.5, k, [GLOVE, SKIN]));
    const part = (a, b, w, h, m) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w * u, h * u, (b - a) * u), m); p.position.z = (a + b) / 2 * u; arm.add(p); };
    part(0.5, 1.5, 0.95, 0.62, CUFF); part(1.5, 7, 0.85, 0.75, SKIN);
    return g;
  }
  window.makeHand = makeHand;

  const holder = new THREE.Group(), anch = {}, sliders = {}, wsl = {}, animRoot = new THREE.Group(), staticHolder = new THREE.Group(), follow = new THREE.Group(), pumpHolder = new THREE.Group();
  follow.matrixAutoUpdate = false;                 // двигает нож вместе с кистью при осмотре
  const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), m3 = new THREE.Matrix4(), mA = new THREE.Matrix4(), mH = new THREE.Matrix4(), mL = new THREE.Matrix4(), mG = new THREE.Matrix4(), mGi = new THREE.Matrix4();
  animRoot.matrixAutoUpdate = false;               // оружие и руки двигаются вместе через animRoot
  let cur = 'rifle', sel = 'R', ins = null, drw = null, rel = null, kick = 0, flashUntil = 0, slash = null, pump = null;       // ins — идёт осмотр ножа

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
  function steelSkin(root) {                        // дигл как в КС: светлая сталь, тёмная рукоять, тонкая насечка
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    root.traverse(o => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position, col = new Float32Array(p.count * 3), v = new V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        const t = (v.y - box.min.y) / ((box.max.y - box.min.y) || 1), st = 0.94 + 0.06 * Math.sin((v.x + v.z) * 110);
        const k = (t < 0.4 ? 0.2 : 0.72 + 0.2 * t) * st;
        col[i * 3] = k; col[i * 3 + 1] = k * 1.02; col[i * 3 + 2] = k * 1.07;
      }
      o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.vertexColors = true; m.map = null; m.color.set(0xffffff); m.metalness = 0.15; m.roughness = 0.35; if (m.emissive) { m.emissive.set(0x30343b); m.emissiveMap = null; } m.needsUpdate = true; });
    });
  }
  function shrinkTex(root, max) {                  // огромные текстуры (CS2-модели) съедают память телефона — сжимаем до max пикселей, пока они ещё не ушли в видеопамять
    root.traverse(o => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach(k => {
          const t = m && m[k]; if (!t || !t.image || (t.userData && t.userData.shrunk)) return;
          const im = t.image, w = im.width || im.videoWidth, hh = im.height || im.videoHeight; if (!w || !hh || Math.max(w, hh) <= max) return;
          try {
            const sc = max / Math.max(w, hh), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(hh * sc));
            c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); if (im.close) im.close(); t.image = c; t.needsUpdate = true; t.userData = t.userData || {}; t.userData.shrunk = 1;
          } catch (e) {}
        });
      });
    });
  }
  function modelPoints(root) {                     // точки модели «как нарисовано»: у моделей со скелетом — с учётом костей (иначе размер считался по сырой геометрии и мог быть неверным в десятки раз)
    root.updateMatrixWorld(true);
    const pts = [], tmp = new V();
    root.traverse(o => {
      if (!o.isMesh || o.visible === false || !o.geometry || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position, skinned = o.isSkinnedMesh && o.skeleton && typeof o.boneTransform === 'function';
      if (skinned) { try { o.skeleton.update(); } catch (e) {} }
      const st = Math.max(1, Math.floor(p.count / 800));
      for (let i = 0; i < p.count; i += st) {
        if (skinned) { try { o.boneTransform(i, tmp); } catch (e) { tmp.fromBufferAttribute(p, i); } } else tmp.fromBufferAttribute(p, i);
        pts.push(new V(tmp.x, tmp.y, tmp.z).applyMatrix4(o.matrixWorld));
      }
    });
    return pts;
  }
  function trimPts(pts) {                          // выбрасывает далёкие одиночные детали (подставки, метки, лишние части), которые ломают размер и ориентацию
    if (pts.length < 50) return pts;
    const ax = ['x', 'y', 'z'], lo = [0, 0, 0], hi = [0, 0, 0];
    ax.forEach((a, k) => { const arr = pts.map(v => v[a]).sort((p, q) => p - q), n = arr.length; lo[k] = arr[Math.floor(n * 0.02)]; hi[k] = arr[Math.min(n - 1, Math.floor(n * 0.98))]; });
    const out = pts.filter(v => ax.every((a, k) => { const m = 0.12 * (hi[k] - lo[k]); return v[a] >= lo[k] - m && v[a] <= hi[k] + m; }));
    return out.length > 20 ? out : pts;
  }
  function fixUpright(s, robust) {                         // ставит модель «как оружие»: ствол вдоль Z (дулом вперёд, к -Z), магазин и рукоять вниз
    s.updateMatrixWorld(true);
    let pts = [];
    if (robust) pts = trimPts(modelPoints(s)).map(q => [q.x, q.y, q.z]);
    else { const v = new V(); s.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.position) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pts.push([v.x, v.y, v.z]); } } }); }
    if (pts.length < 8) return;
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    pts.forEach(q => { for (let a = 0; a < 3; a++) { if (q[a] < mn[a]) mn[a] = q[a]; if (q[a] > mx[a]) mx[a] = q[a]; } });
    const d = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    const L = d[0] >= d[1] && d[0] >= d[2] ? 0 : d[1] >= d[2] ? 1 : 2;                   // самая длинная ось = ствол
    const rest = [0, 1, 2].filter(a => a !== L), U = d[rest[0]] >= d[rest[1]] ? rest[0] : rest[1], S = rest[0] === U ? rest[1] : rest[0];   // вертикаль — где больше разброс (магазин, мушка)
    const len = d[L], lowEnd = mn[L] + 0.12 * len, highEnd = mx[L] - 0.12 * len;
    const area = (low) => { let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9, n = 0; pts.forEach(q => { if (low ? q[L] <= lowEnd : q[L] >= highEnd) { n++; a0 = Math.min(a0, q[U]); a1 = Math.max(a1, q[U]); b0 = Math.min(b0, q[S]); b1 = Math.max(b1, q[S]); } }); return n ? (a1 - a0 + 0.001) * (b1 - b0 + 0.001) : 1e9; };
    const muzzleLow = area(true) < area(false);                                           // дуло — тонкий конец
    let hm = 0, hn = 0; pts.forEach(q => { if (muzzleLow ? q[L] <= lowEnd : q[L] >= highEnd) { hm += q[U]; hn++; } }); hm = hn ? hm / hn : (mn[U] + mx[U]) / 2;
    const upSign = (hm - mn[U]) > (mx[U] - hm) ? 1 : -1;                                 // магазин и рукоять торчат ниже ствола
    const e = a => [a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0];
    const mul = (a, k) => a.map(x => x * k), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const f = mul(e(L), muzzleLow ? -1 : 1), up = mul(e(U), upSign), back = mul(f, -1), right = cross(up, back);
    const m = new THREE.Matrix4().set(right[0], right[1], right[2], 0, up[0], up[1], up[2], 0, back[0], back[1], back[2], 0, 0, 0, 0, 1);
    s.quaternion.setFromRotationMatrix(m); s.updateMatrixWorld(true);
  }
  function loadW(name, cb) {
    const w = W[name];
    if (w.ready) { if (cb) cb(); return; }
    if (w.loading) { w.cbs.push(cb); return; }
    w.loading = 1; w.cbs = [cb];
    new THREE.GLTFLoader().load(w.file, g => {
      const s = g.scene, P = [];
      shrinkTex(s, 512);
      s.traverse(o => { if (o.isSprite || o.isLine || o.isPoints || o.isLineSegments || /text|label|number|digit|font|marker|helper|guide|sticker|hud/i.test(o.name || '')) o.visible = false; });   // метки и цифры из файла модели не показываем
      if (w.fix) fixUpright(s, w.robust);
      s.updateMatrixWorld(true);
      s.traverse(o => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.metalness > 0.4) m.metalness = 0.3; m.side = THREE.DoubleSide;
        if (name !== 'rifle') { m.metalness = 0; m.roughness = 0.7; if (m.emissive) { m.emissive.set(name === 'awp' ? 0x9a9a9a : w.fix ? 0xb4b4b4 : 0x555555); if (m.map) m.emissiveMap = m.map; } else if (m.color) m.color.setRGB(w.fix ? 2.2 : 1.6, w.fix ? 2.2 : 1.6, w.fix ? 2.2 : 1.6); m.needsUpdate = true; } });
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 2) P.push(new V().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
      });
      if (w.robust) { const rp = trimPts(modelPoints(s)); P.length = 0; rp.forEach(q => P.push(q)); }   // размер и посадка по настоящей форме оружия
      if (name === 'deagle') steelSkin(s);
      w.P = P; w.inner = w.fix ? (() => { const gr = new THREE.Group(); gr.add(s); return gr; })() : s; w.yaw0 = w.yaw !== undefined ? w.yaw : autoYaw(P, w.knife);
      w.wrap = new THREE.Group(); w.pivot = new THREE.Group();
      w.wrap.add(w.inner); w.pivot.add(w.wrap); follow.add(w.pivot);
      if (!w.knife) { w.flash = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 6), new THREE.MeshBasicMaterial({ color: 0xffbb00, side: THREE.DoubleSide })); w.flash.rotation.x = -Math.PI / 2; w.flash.visible = false; w.pivot.add(w.flash); }
      w.ready = 1; w.cbs.forEach(f => { if (f) f(); }); place();
    }, undefined, () => { w.loading = 0; console.log('оружие не загрузилось', w.file); });
  }
  function build() {
    while (holder.children.length) { const o = holder.children[0]; holder.remove(o); o.traverse(m => { if (m.geometry) m.geometry.dispose(); }); }
    while (pumpHolder.children.length) { const o = pumpHolder.children[0]; pumpHolder.remove(o); o.traverse(m => { if (m.geometry) m.geometry.dispose(); }); }
    while (staticHolder.children.length) { const o = staticHolder.children[0]; staticHolder.remove(o); o.traverse(m => { if (m.geometry) m.geometry.dispose(); }); }
    const w = W[cur], t = tune[cur];
    ['R', 'L'].forEach(s => {
      if (!w || !w.ready || !w.L && s === 'L' || !t[s] || !anch[s]) return;
      const q = t[s], a = anch[s], h = makeHand(s, q.pose, U, q.k);
      h.rotation.set(q.pitch * DEG, q.yaw * DEG, q.roll * DEG);
      h.position.set(a.x + q.x * U, a.y + q.y * U, a.z + q.z * U);
      h.userData.bp = h.position.clone(); h.userData.br = q.roll * DEG; h.userData.side = s;
      (w.knife && s === 'L' ? staticHolder : (w.pump && s === 'L' ? pumpHolder : holder)).add(h);   // у ножа левая рука не участвует в осмотре — спокойно лежит
    });
  }
  // ставит оружие и руки так, чтобы мушка попала в точку экрана с референса (при любом соотношении сторон)
  function place() {
    for (const n in W) if (W[n].pivot) W[n].pivot.visible = n === cur;
    const w = W[cur];
    if (!w || !w.ready) { build(); return; }
    const gx = w.ndcX * -w.sZ * Math.tan(camera.fov * 0.5 * DEG) * camera.aspect + (tune[cur].ox || 0), sY = w.sY + (tune[cur].oy || 0), sZ = w.sZ + (tune[cur].oz || 0), wz = tune[cur].wz || 0, wx = tune[cur].wx || 0, wy = tune[cur].wy || 0;
    const th = w.yaw0 + (tune[cur].f ? Math.PI : 0), b = bboxYaw(w.P, th), size = b.getSize(new V()), c = b.getCenter(new V());
    const s = w.len * BIG / size.z * (tune[cur].sz || 1);
    w.inner.rotation.y = th; w.wrap.scale.setScalar(s);
    if (w.knife) {
      w.wrap.position.set(-s * c.x, -s * c.y, -s * (b.max.z - 0.15 * size.z));
      w.pivot.position.set(gx + wx, sY + wy, sZ + wz); w.pivot.rotation.order = 'YXZ';
      const kv = (k, d) => (tune[cur][k] !== undefined ? tune[cur][k] : d) * DEG; w.pivot.rotation.set(kv('kp', 29), kv('ky', 46), kv('kr', 0)); w.base = { x: gx + wx, y: sY + wy, z: sZ + wz, rz: kv('kr', 0), dir: new V(0, 0, -1).applyEuler(new THREE.Euler(kv('kp', 29), kv('ky', 46), 0, 'YXZ')) };   // клинок вверх-влево
    } else {
      const wp = new V(gx - s * c.x + wx, sY - s * b.max.y + wy, sZ + wz + w.muz * BIG - s * b.min.z), ctr = wp.clone().add(c.clone().multiplyScalar(s));   // центр оружия — точка вращения
      w.wrap.position.copy(wp).sub(ctr); w.pivot.position.copy(ctr); w.base = { x: ctr.x, y: ctr.y, z: ctr.z, rz: 0 };
      w.pivot.rotation.order = 'YXZ'; w.pivot.rotation.set((tune[cur].gp || 0) * DEG, (tune[cur].gy || 0) * DEG, (tune[cur].gr || 0) * DEG);   // наклон оружия (руки не двигаются)
      if (w.flash) w.flash.position.set(0, (b.max.y - 0.35 * size.y - c.y) * s, (b.min.z - c.z) * s - 0.1);   // вспышка у дула
    }
    anch.R = new V(gx, sY + w.R[0] * BIG, sZ + w.R[1] * BIG);
    anch.L = w.L ? new V(gx, sY + w.L[0] * BIG, sZ + w.L[1] * BIG) : null;
    build();
  }
  window.HW_set = name => { if (!W[name]) return; ins = null; rel = null; drw = { t0: performance.now() }; cur = name; if (sel === 'L' && !W[name].L) sel = 'R'; loadW(name); place(); refresh(); };

  function refresh() {
    const t = tune[cur][sel] || tune[cur].R;
    for (const k in sliders) sliders[k].value = t[k];
    for (const k in wsl) wsl[k].value = tune[cur][k] !== undefined ? tune[cur][k] : ({ sz: 1, ox: 0, oy: 0, oz: 0, wz: 0, wx: 0, wy: 0, gp: 0, gy: 0, gr: 0, kp: 29, ky: 46, kr: 0 })[k];
    const el = id => document.getElementById(id);
    if (el('hn-wp')) { el('hn-wp').textContent = 'Оружие: ' + cur; el('hn-sel').textContent = 'Рука: ' + (sel === 'R' ? 'правая' : 'левая'); }
  }
  function buildPanel() {
    const css = document.createElement('style');
    css.textContent =
      '#hn-b{position:absolute;top:8px;left:50%;margin-left:110px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(15,23,42,.8);color:#fff;font-size:18px}' +
      '#hn-p{position:absolute;top:54px;left:50%;transform:translateX(-50%);z-index:60;width:min(520px,94vw);background:rgba(15,23,42,.82);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:8px 10px;color:#fff;font:12px sans-serif;display:none;max-height:calc(100% - 64px);overflow-y:auto;touch-action:pan-y}' +
      '#hn-g{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}#hn-p label{display:flex;align-items:center;gap:6px;min-height:24px}#hn-p label span{width:92px;line-height:1.1}#hn-p input{flex:1;min-width:0}' +
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
    const hdr = document.createElement('div');       // заголовок: тяни пальцем, чтобы переставить панель
    hdr.textContent = '⠿ Настройки (тяни за эту строку)'; hdr.style.cssText = 'cursor:move;padding:2px 2px 8px;color:#94a3b8;touch-action:none;font-weight:700';
    let drag = null;
    hdr.addEventListener('touchstart', e => {
      const t = e.changedTouches[0], r = p.getBoundingClientRect();
      p.style.transform = 'none'; p.style.left = r.left + 'px'; p.style.top = r.top + 'px'; drag = { dx: t.clientX - r.left, dy: t.clientY - r.top, id: t.identifier }; e.preventDefault();
    }, { passive: false });
    hdr.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (drag && t.identifier === drag.id) { p.style.left = (t.clientX - drag.dx) + 'px'; p.style.top = (t.clientY - drag.dy) + 'px'; } e.preventDefault(); }, { passive: false });
    hdr.addEventListener('touchend', () => { drag = null; });
    p.appendChild(hdr);
    p.appendChild(grid);
    const g2 = document.createElement('div'); g2.id = 'hn-g';
    [['oz', -0.4, 0.4, 0.005, 'Рука+оружие вперёд/назад'], ['wz', -0.3, 0.3, 0.005, 'Оружие вперёд/назад (руки на месте)'], ['wy', -0.3, 0.3, 0.005, 'Оружие вверх/вниз (руки на месте)'], ['wx', -0.3, 0.3, 0.005, 'Оружие влево/вправо (руки на месте)'], ['gp', -180, 180, 1, 'Наклон оружия'], ['gy', -180, 180, 1, 'Поворот оружия'], ['gr', -180, 180, 1, 'Крен оружия'], ['kp', -90, 90, 1, 'Нож наклон'], ['ky', -90, 90, 1, 'Нож поворот'], ['kr', -180, 180, 1, 'Нож вращение'], ['sz', 0.1, 6, 0.02, 'Размер оружия'], ['ox', -0.3, 0.3, 0.005, 'Руки+оружие влево/вправо'], ['oy', -0.3, 0.3, 0.005, 'Руки+оружие вверх/вниз']].forEach(([k, lo, hi, st, name]) => {
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

  // ---------- анимации (всё считается здесь, библиотеки не нужны) ----------
  const sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10);       // очень плавное смягчение
  function sample(kf, t) {                         // плавный переход между ключами [время, x, y, z, rx, ry, rz, spin]
    if (t >= kf[kf.length - 1][0]) return null;
    let i = 0; while (kf[i + 1][0] <= t) i++;
    const a = kf[i], b = kf[i + 1], u = sm((t - a[0]) / (b[0] - a[0]));
    return a.slice(1).map((v, j) => v + (b[j + 1] - v) * u);
  }
  const Z = [0, 0, 0, 0, 0, 0, 0], UP = [-0.07, 0.05, 0.07, 0.28, 0, 0.1, 0], LEFT = [-0.09, 0.06, 0.09, 0.2, 0.85, 0.5, 0], RIGHT = [-0.09, 0.06, 0.09, 0.2, -0.85, -0.5, 0];
  const kf = (...rows) => rows.map(r => [r[0]].concat(r[1]));
  const KF = {
    // автомат и пистолеты: поднял → смотрит слева → медленно с правой стороны → вернул и опустил
    pistol: kf([0, Z], [0.6, UP], [1.3, LEFT], [2.2, LEFT], [3.0, UP], [3.6, Z]),                       // как в Standoff 2: взял, посмотрел левую сторону, вернул
    heavy: kf([0, Z], [0.65, UP], [1.4, LEFT], [2.4, LEFT], [3.2, UP], [3.9, Z]),                       // автомат и AWP: так же, как у USP — смотрим левую сторону
    // нож (как в Block Strike): рука остаётся на одном уровне, нож ложится ребром, затем клинок встаёт вертикально и всё возвращается; левая рука неподвижна
    knife: kf([0, [0, 0, 0, 0, 0]], [0.55, [0, 0.05, -0.12, 0.1, -1.15]], [1.3, [-0.02, 0.06, 0, -1.8, 0]], [2.1, [-0.02, 0.06, 0, -1.75, 0]], [3.0, [0, 0, 0, 0, 0]]),   // как в Block Strike, рука остаётся на уровне: нож ложится ребром → клинок встаёт вертикально → пауза → возврат. [локоть вниз, локоть влево, сгиб кисти, крен кисти (минус — острие вверх), вращение ножа]
    // керамбит по кадрам Block Strike: рука поднимается → нож уходит за кулак (виден только кольцо) → вылетает вправо к камере (крупно) → разворачивается клинком влево и висит (чуть покачивается) → обратно вправо крупно → снова за кулак → рука опускается.
    // колонки: [крен в плоскости экрана, поворот вокруг вертикали через кольцо (+ клинок назад, − к камере), подъём руки, ближе к камере, поворот ножа вокруг оси, наклон руки]
    kar: kf([0, [0, 0, 0, 0, 0, 0]], [0.4, [0.2, 0.9, 0.2, 0.03, 0, -0.15]], [0.6, [0.3, 1.55, 0.28, 0.04, 0, -0.25]], [1.05, [0.1, -0.8, 0.28, 0.1, 0, -0.1]], [1.65, [0, -3.14, 0.2, 0.02, 0, 0]],
      [2.15, [0.12, -3.0, 0.2, 0.02, 0.15, 0.05]], [2.55, [-0.12, -3.3, 0.18, 0.02, -0.1, 0.1]], [2.95, [0.05, -3.14, 0.2, 0.02, 0.1, 0]], [3.5, [0.1, -0.8, 0.28, 0.1, 0, -0.1]], [4.0, [0.3, 1.55, 0.28, 0.04, 0, -0.25]], [4.7, [0, 0, 0, 0, 0, 0]]),
    rel: {            // перезарядка (время 0..1 от длительности)
      rifle: kf([0, Z], [0.18, [0.02, -0.1, 0, -0.45, 0, 0.35, 0]], [0.6, [0.02, -0.1, 0, -0.45, 0.05, 0.4, 0]], [0.8, [0, -0.08, 0.03, -0.38, 0, 0.3, 0]], [0.88, [0, -0.04, -0.01, -0.15, 0, 0.1, 0]], [1, Z]),
      pistol: kf([0, Z], [0.2, [0.03, -0.08, 0, -0.35, 0.2, 0.55, 0]], [0.62, [0.03, -0.08, 0, -0.35, 0.2, 0.55, 0]], [0.82, [0, -0.05, 0.02, -0.2, 0, 0.2, 0]], [1, Z]),
      awp: kf([0, Z], [0.15, [0.02, -0.04, 0, -0.3, 0.1, 0.4, 0]], [0.4, [0.02, -0.04, 0.07, -0.3, 0.1, 0.4, 0]], [0.55, [0.02, -0.04, -0.01, -0.3, 0.1, 0.4, 0]], [0.85, [0.02, -0.1, 0, -0.4, 0, 0.3, 0]], [1, Z])
    }
  };
  const PRIM_HANDS = { rifle: 1, m4a4: 1, m16: 1, m249: 1, mossberg: 1, m870: 1 };   // первичные оружия (руки как у АК)
  const DRAW = { knife: 0.6, rifle: 0.85, pistol: 0.6, awp: 1.0 };                                     // длительность доставания
  const FROM = { knife: [0.2, -0.5, 0.06, -0.8, 0, 0.7], rifle: [0.12, -0.55, 0.08, -0.9, 0.25, 0.15], pistol: [0.15, -0.4, 0.05, -0.6, 0, 0.25], awp: [0.1, -0.6, 0.1, -1.0, 0.3, 0.1] };
  const KICK = { rifle: [0.035, 0.05], pistol: [0.05, 0.11], awp: [0.09, 0.18] };                    // отдача: назад и вверх
  window.HW_inspect = () => { if (rel) return false; ins = { t0: performance.now() }; drw = null; return true; };   // повторное нажатие R начинает осмотр заново
  window.HW_stop = () => { ins = null; };
  window.HW_reload = ms => { rel = { t0: performance.now(), D: ms }; ins = null; };
  window.HW_visible = v => { animRoot.visible = v; staticHolder.visible = v; };
  window.HW_fire = type => {                       // выстрел: рывок оружия + вспышка (у ножа — взмах)
    const w = W[cur]; if (!w) return;
    ins = null;
    if (w.knife) { slash = { t0: performance.now() }; return; }
    if (w.pump) pump = { t0: performance.now() };                       // дробовик: после выстрела левая рука передёргивает цевьё
    kick = Math.min(kick + (type === 'awp' ? 1.6 : cur === 'rifle' ? 0.55 : 1.0), 2.2);
    flashUntil = performance.now() + 45;
    if (w.flash) { const k = 0.7 + Math.random() * 0.8; w.flash.scale.set(k, k, k); w.flash.rotation.y = Math.random() * 6.28; }
  };
  let lastT = performance.now();
  function tick() {
    requestAnimationFrame(tick);
    const ms = performance.now(), dt = Math.min((ms - lastT) / 1000, 0.05); lastT = ms;
    const w = W[cur];
    if (!w || !w.ready || !w.base) return;
    const now = ms / 1000, kind = w.knife ? 'knife' : cur === 'awp' ? 'awp' : PRIM_HANDS[cur] ? 'rifle' : 'pistol';
    const o = { x: Math.sin(now * 1.3) * 0.0015, y: Math.sin(now * 1.7) * 0.0025, z: 0, rx: 0, ry: 0, rz: 0, tip: 0 };
    let spin = 0;
    const add = (v, lift) => { o.x += v[0]; o.y += v[1]; o.z += v[2]; if (lift) o.tip += v[3]; else o.rx += v[3]; o.ry += v[4]; o.rz += v[5]; spin += v[6] || 0; };
    if (drw) {                                                          // доставание
      const u = (ms - drw.t0) / 1000 / DRAW[kind];
      if (u >= 1) drw = null;
      else { const f = 1 - sm(u), q = FROM[kind]; o.x += q[0] * f; o.y += q[1] * f; o.z += q[2] * f; o.rx += q[3] * f; o.ry += q[4] * f; o.rz += q[5] * f + (kind === 'knife' ? Math.sin(u * 10) * 0.1 * (1 - u) * (1 - u) : 0); }
    }
    const oS = { x: o.x, y: o.y, z: o.z };                                // что достаётся неподвижной руке (только доставание и дыхание)
    let kw = null;
    if (ins) {                                                        // осмотр
      if (w.spin) { kw = sample(KF.kar, (ms - ins.t0) / 1000); if (!kw) ins = null; else { o.y += kw[2]; o.z += kw[3]; o.rx += kw[5]; spin += kw[4]; } }
      else if (w.knife) { kw = sample(KF.knife, (ms - ins.t0) / 1000); if (!kw) ins = null; else spin += kw[4]; }
      else { const v = sample(kind === 'pistol' ? KF.pistol : KF.heavy, (ms - ins.t0) / 1000); if (v) add(v, false); else ins = null; }
    }
    if (rel) { const u = (ms - rel.t0) / rel.D, v = u >= 1 ? null : sample(KF.rel[kind === 'knife' ? 'rifle' : kind], u); if (v) add(v); else rel = null; }   // перезарядка
    kick *= Math.exp(-dt * 14);
    if (kind !== 'knife') { const k = KICK[kind]; o.z += k[0] * kick; o.rx += k[1] * kick; o.y += 0.01 * kick; }
    if (slash) { const u = (ms - slash.t0) / 320; if (u >= 1) slash = null; else { const q = Math.sin(Math.PI * u); o.x -= 0.2 * q; o.ry += 0.8 * q; o.rz += 0.45 * q; o.rx += 0.15 * q; o.y -= 0.03 * q; } }
    let pz = 0;
    if (pump) { const u = (ms - pump.t0) / 620; if (u >= 1) pump = null; else { const k = u < 0.18 ? 0 : u < 0.45 ? sm((u - 0.18) / 0.27) : u < 0.58 ? 1 : 1 - sm((u - 0.58) / 0.42); pz = 0.16 * k; } }
    pumpHolder.position.set(0, w.pump ? -0.015 * (pz / 0.16) : 0, w.pump ? pz : 0);   // рука идёт к себе и обратно вдоль ствола
    if (w.flash) w.flash.visible = ms < flashUntil;
    const b = w.base, E = new THREE.Euler(o.rx, o.ry, o.rz, 'YXZ');
    animRoot.matrix.makeTranslation(b.x + o.x, b.y + o.y, b.z + o.z)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(E));
    if (w.knife && o.tip) { const ax = new V().crossVectors(b.dir || new V(0, 0, -1), new V(0, 1, 0)); if (ax.lengthSq() > 1e-6) animRoot.matrix.multiply(new THREE.Matrix4().makeRotationAxis(ax.normalize(), o.tip)); }   // острие ножа идёт вверх
    animRoot.matrix.multiply(new THREE.Matrix4().makeTranslation(-b.x, -b.y, -b.z));
    animRoot.matrixWorldNeedsUpdate = true;
    if (w.knife) w.pivot.rotation.z = b.rz + spin;                      // нож крутится вокруг своей оси
    if (w.knife) staticHolder.position.set(oS.x, oS.y, oS.z); else staticHolder.position.set(0, 0, 0);
    if (w.knife) {                                                    // суставы правой руки: локоть → запястье; нож едет вместе с кистью
      const gR = holder.children.find(c => c.userData.side === 'R');
      if (w.spin) follow.matrix.makeTranslation(b.x, b.y, b.z).multiply(m1.makeRotationY(kw ? kw[1] : 0)).multiply(m3.makeRotationZ(kw ? kw[0] : 0)).multiply(m2.makeTranslation(-b.x, -b.y, -b.z));   // нож крутится вокруг кольца, рука на месте
      else if (gR && gR.userData.arm) {
        const a = kw ? kw[0] : 0, ey = kw ? kw[1] : 0, fl = kw ? kw[2] : 0, ro = kw ? kw[3] : 0, E = gR.userData.el, Wr = gR.userData.wr;
        mA.makeTranslation(E.x, E.y, E.z).multiply(m1.makeRotationY(ey)).multiply(m2.makeRotationX(a)).multiply(m3.makeTranslation(-E.x, -E.y, -E.z));
        mH.makeTranslation(Wr.x, Wr.y, Wr.z).multiply(m1.makeRotationZ(ro)).multiply(m2.makeRotationX(fl)).multiply(m3.makeTranslation(-Wr.x, -Wr.y, -Wr.z));
        mL.copy(mA).multiply(mH);
        gR.updateMatrix(); mG.copy(gR.matrix); mGi.copy(mG).invert();
        gR.userData.arm.matrix.copy(mA); gR.userData.hand.matrix.copy(mL);
        follow.matrix.copy(mG).multiply(mL).multiply(mGi);
      } else follow.matrix.identity();
    } else follow.matrix.identity();
  }

  window.loadGLTFModels = function () {
    weaponContainer.add(animRoot); animRoot.add(holder); animRoot.add(follow); animRoot.add(pumpHolder); weaponContainer.add(staticHolder);
    buildPanel(); tick();
    window.addEventListener('resize', place);
    loadW('rifle', place);
    setTimeout(() => { loadW('usp'); loadW('knife'); }, 1500);   // заранее, чтобы не было паузы при смене
  };
})();
