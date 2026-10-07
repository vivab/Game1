/* game.js — карта, столкновения, команды 5×5, боты с ИИ, разброс, плавающий джойстик.
   Подключать ПОСЛЕ hands.js: <script src="game.js"></script> */
document.write('<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>');
(function () {
  const V = THREE.Vector3, MATCH = 120;
  const solids = [], walls = [], score = { A: 0, B: 0 };
  const squads = { A: [], B: [] }, intel = { A: null, B: null };
  const stats = [], mine = new Set();      // таблица матча; кто бил игрока
  const me = { name: 'Вы', team: 'A', kills: 0, assists: 0, deaths: 0, ping: 40 + Math.floor(Math.random() * 86) }; stats.push(me);
  let tabOn = false, grid = null, curW = 'rifle', shopEnd = 0;
  const NICKS = ['Саша_61', 'ваня', 'Тимур', 'Дэн', 'Кирилл', 'Макс', 'Артём', 'Лёха', 'Рома', 'Стас', 'Егор', 'Никита'];
  let T = 0, timeLeft = MATCH, started = false, over = false, respawnIn = 0, burst = 0, lastShot = 0;
  const SPREAD = { base: 0.004, move: 0.014, air: 0.05, crouch: 0.5, perShot: 0.005, max: 0.04, recover: 0.03 };

  // ---------- карта (данные: x, z, ширина, глубина, высота) ----------
  window.buildMap = function () {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor); colliders.push(floor);
    const grid = new THREE.GridHelper(90, 45, 0x3b82f6, 0x334155); grid.position.y = 0.01; scene.add(grid);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 });
    const add = (x, z, w, d, h, m) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, h / 2, z); b.castShadow = b.receiveShadow = true;
      scene.add(b); colliders.push(b); walls.push(b);
      solids.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
    };
    [[0, -40.5, 82, 1], [0, 40.5, 82, 1], [-40.5, 0, 1, 82], [40.5, 0, 1, 82]].forEach(a => add(a[0], a[1], a[2], a[3], 5, wallMat));
    add(0, 0, 4, 4, 3, crateMat);
    // половина карты, вторая — зеркально (справедливо для обеих команд)
    [[-14, 8, 12, 1.5, 3.5, 1], [15, 15, 1.5, 9, 3.5, 1], [-27, 20, 6, 3, 3], [0, 22, 5, 3, 2.5], [-8, 31, 3, 3, 2.5],
     [26, 29, 5, 3, 2.5], [-30, 6, 3, 10, 3.5, 1], [8, -4, 4, 3, 2.5]].forEach(a => {
      const m = a[5] ? wallMat : crateMat;
      add(a[0], a[1], a[2], a[3], a[4], m); add(-a[0], -a[1], a[2], a[3], a[4], m);
    });
  };
  window.spawnBotCS = function () {};   // старые боты не нужны

  // ---------- столкновения и линия видимости ----------
  function groundAt(x, z, feet) {                 // на чём стоим: самая высокая поверхность не выше ступеньки
    if (!grid) return 0;
    const i = Math.floor((x - grid.x0) / grid.cs), j = Math.floor((z - grid.z0) / grid.cs);
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) return 0;
    const L = grid.layers[i * grid.nz + j];
    if (!L) return 0;
    let best = -1;
    for (let q = 0; q < L.length; q++) if (L[q] <= feet + 0.55 && L[q] > best) best = L[q];
    return best < 0 ? 0 : best;
  }
  function resolveGrid(p, r, feet) {
    const i0 = Math.floor((p.x - grid.x0) / grid.cs), j0 = Math.floor((p.z - grid.z0) / grid.cs);
    for (let it = 0; it < 2; it++) for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) {
      if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz || grid.oH[i * grid.nz + j] <= feet + 0.5) continue;
      const bx = grid.x0 + i * grid.cs, bz = grid.z0 + j * grid.cs, cx = Math.max(bx, Math.min(p.x, bx + grid.cs)), cz = Math.max(bz, Math.min(p.z, bz + grid.cs));
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-6) p.x += (p.x < bx + grid.cs / 2 ? -1 : 1) * r; else { p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
    }
    p.x = Math.max(grid.x0 + r, Math.min(grid.x0 + grid.nx * grid.cs - r, p.x)); p.z = Math.max(grid.z0 + r, Math.min(grid.z0 + grid.nz * grid.cs - r, p.z));
  }
  function losGrid(a, b) {                       // обзор по сетке: высокие объекты закрывают
    const dx = b.x - a.x, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dz) / 0.3);
    for (let k = 1; k < n; k++) {
      const i = Math.floor((a.x + dx * k / n - grid.x0) / grid.cs), j = Math.floor((a.z + dz * k / n - grid.z0) / grid.cs);
      if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz || grid.tall[i * grid.nz + j]) return false;
    }
    return true;
  }
  function gridBlocked(x, z, r) {
    if (!grid) return solids.some(s => x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r);
    const i0 = Math.floor((x - r - grid.x0) / grid.cs), i1 = Math.floor((x + r - grid.x0) / grid.cs), j0 = Math.floor((z - r - grid.z0) / grid.cs), j1 = Math.floor((z + r - grid.z0) / grid.cs);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz || grid.low[i * grid.nz + j]) return true;
    return false;
  }
  function freeNear(x, z) {
    for (let r = 0; r < 25; r += 0.5) for (let a = 0; a < 6.28; a += 0.4) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!gridBlocked(px, pz, 0.9)) return [px, pz]; }
    return [x, z];
  }
  function resolve(p, r, feet) {
    if (grid) return resolveGrid(p, r, feet);
    for (let it = 0; it < 2; it++) solids.forEach(s => {
      if (feet >= s.h) return;
      const cx = Math.max(s.x0, Math.min(p.x, s.x1)), cz = Math.max(s.z0, Math.min(p.z, s.z1));
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= r) return;
      if (d < 1e-6) {
        const l = p.x - s.x0, rr = s.x1 - p.x, t = p.z - s.z0, b = s.z1 - p.z, m = Math.min(l, rr, t, b);
        if (m === l) p.x = s.x0 - r; else if (m === rr) p.x = s.x1 + r; else if (m === t) p.z = s.z0 - r; else p.z = s.z1 + r;
      } else { p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
    });
  }
  const ray = new THREE.Raycaster();
  function los(a, b) {
    if (grid) return losGrid(a, b);
    const d = new V().subVectors(b, a), dist = d.length();
    ray.set(a, d.normalize()); ray.far = dist;
    return ray.intersectObjects(walls).length === 0;
  }

  // ---------- сетка проходимости и поиск пути (A*) ----------
  const N = 80, CS = 1, blocked = new Uint8Array(N * N);
  const cellOf = v => Math.min(N - 1, Math.max(0, Math.floor((v + 40) / CS)));
  function buildNav() {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) blocked[i * N + j] = gridBlocked(-40 + (i + 0.5) * CS, -40 + (j + 0.5) * CS, 0.9) ? 1 : 0;
  }
  function findPath(from, to) {
    const s = cellOf(from.x) * N + cellOf(from.z);
    let g = cellOf(to.x) * N + cellOf(to.z);
    if (blocked[g]) {
      let best = g, bd = 1e9;
      for (let k = 0; k < N * N; k++) if (!blocked[k]) { const d = Math.hypot((k / N | 0) - (g / N | 0), k % N - g % N); if (d < bd) { bd = d; best = k; } }
      g = best;
    }
    const gs = new Float32Array(N * N).fill(1e9), prev = new Int16Array(N * N).fill(-1), closed = new Uint8Array(N * N), open = [s];
    gs[s] = 0;
    while (open.length) {
      let bi = 0, bf = 1e9;
      open.forEach((k, ii) => { const f = gs[k] + Math.hypot((k / N | 0) - (g / N | 0), k % N - g % N); if (f < bf) { bf = f; bi = ii; } });
      const c = open.splice(bi, 1)[0];
      if (c === g) break;
      closed[c] = 1;
      const ci = c / N | 0, cj = c % N;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = ni * N + nj;
        if (blocked[nk] || closed[nk]) continue;
        if (di && dj && (blocked[ni * N + cj] || blocked[ci * N + nj])) continue;
        const ng = gs[c] + (di && dj ? 1.414 : 1);
        if (ng < gs[nk]) { gs[nk] = ng; prev[nk] = c; if (!open.includes(nk)) open.push(nk); }
      }
    }
    const path = [];
    for (let k = g; k !== -1 && k !== s; k = prev[k]) path.push(new V(-40 + ((k / N | 0) + 0.5) * CS, 0, -40 + ((k % N) + 0.5) * CS));
    return path.reverse();
  }

  // ---------- боты ----------
  const COL = { A: 0x2563eb, B: 0xd97706 };
  const SPAWN = { A: [-8, -4, 0, 4, 8].map(x => [x, 34]), B: [-8, -4, 0, 4, 8].map(x => [x, -34]) };
  const LA = [[[-30, 24], [-34, 0], [-30, -24]], [[0, 16], [0, -16]], [[30, 24], [34, 0], [30, -24]]];   // маршруты по линиям
  const LANES = { A: LA.map(l => l.map(p => new V(p[0], 0, p[1]))), B: LA.map(l => l.map(p => new V(-p[0], 0, -p[1]))) };

  // ---------- модели ботов (GLB): спецназ — команда A (твоя), террористы — B ----------
  const FILES = { A: 'counter_strike_urban.glb', B: 'counter_strike_leet.glb' };   // A — спецназ (синий), B — террорист
  const CLIPS = {};
  const FACE = 0;                 // если боты идут задом наперёд — поставь Math.PI
  const tpl = {}, GUN = {};
  function bounds(root) {         // точный габарит с учётом скелета
    root.updateMatrixWorld(true);
    const box = new THREE.Box3(), v = new V();
    root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const p = o.geometry.attributes.position, sk = o.isSkinnedMesh && o.boneTransform;
      for (let i = 0; i < p.count; i++) { if (sk) o.boneTransform(i, v); else v.fromBufferAttribute(p, i); box.expandByPoint(v.applyMatrix4(o.matrixWorld)); }
    });
    return box;
  }
  function fitTo(scene, size, human) {   // человек: рост = size, ноги на полу; оружие: длина = size, по центру
    scene.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.metalness > 0.3) m.metalness = 0.1; m.side = THREE.DoubleSide;
      if (human) { m.color.set(0xffffff); m.metalness = 0; m.roughness = 1; m.vertexColors = false; if (m.map && m.emissive) { m.emissive.set(0xffffff); m.emissiveIntensity = 1.4; m.emissiveMap = m.map; } else if (!m.emissive) m.color.setRGB(1.7, 1.7, 1.7); m.needsUpdate = true; } }); });
    const bx = bounds(scene), sz = bx.getSize(new V()), c = bx.getCenter(new V());
    const k = size / (human ? sz.y : Math.max(sz.x, sz.y, sz.z));
    const fit = new THREE.Group();
    fit.add(scene); fit.scale.setScalar(k);
    fit.position.set(-c.x * k, human ? -bx.min.y * k : -c.y * k, -c.z * k);
    return fit;
  }
  const SIDE = { l: /left|bipl|^l(?=upper|fore|hand|arm|thigh|calf|leg)/, r: /right|bipr|^r(?=upper|fore|hand|arm|thigh|calf|leg)/ };
  const pick = (bones, side, re) => bones.find(o => {
    const n = o.name.toLowerCase().replace(/[^a-z]/g, '');
    return SIDE[side].test(n) && re.test(n) && !/finger|thumb|index|middle|ring|pinky/.test(n);
  });
  function aim(bone, child, dir) {      // повернуть кость так, чтобы она смотрела по dir (в мире), не зная её осей
    const bp = bone.getWorldPosition(new V()), cp = child.getWorldPosition(new V());
    const dq = new THREE.Quaternion().setFromUnitVectors(cp.sub(bp).normalize(), dir.clone().normalize());
    const bq = bone.getWorldQuaternion(new THREE.Quaternion());
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(pq.multiply(dq).multiply(bq));
    bone.updateMatrixWorld(true);
  }
  function ik(up, fo, hd, target, hint) {   // рука тянется к оружию (двухсуставная)
    const S = up.getWorldPosition(new V()), E0 = fo.getWorldPosition(new V()), H0 = hd.getWorldPosition(new V());
    const a = S.distanceTo(E0), c = E0.distanceTo(H0), d0 = target.clone().sub(S);
    const d = Math.min(Math.max(d0.length(), Math.abs(a - c) + 0.01), a + c - 0.01), dir = d0.normalize();
    const x = (a * a - c * c + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
    const pole = hint.clone().sub(dir.clone().multiplyScalar(hint.dot(dir))).normalize();
    const E = S.clone().addScaledVector(dir, x).addScaledVector(pole, h);
    aim(up, fo, E.clone().sub(S));
    aim(fo, hd, target.clone().sub(E));
  }
  // запасной поиск руки по геометрии (если имена костей нестандартные): в Т-позе рука тянется вбок на уровне плеч
  function geoArm(bones, P, sign, H) {
    const side = bones.filter(o => { const p = P(o); return sign * p.x > 0.12 && p.y > 0.55 * H && p.y < 0.95 * H; });
    if (!side.length) return null;
    const set = new Set(side), ax = o => Math.abs(P(o).x);
    let cur = side.filter(o => !set.has(o.parent)).sort((a, c) => ax(a) - ax(c))[0];
    const chain = [];
    while (cur) { chain.push(cur); cur = cur.children.filter(k => set.has(k)).sort((a, c) => ax(c) - ax(a))[0]; }
    for (let i = 0; i + 2 < chain.length; i++) if (P(chain[i]).distanceTo(P(chain[i + 1])) > 0.2) return { up: chain[i], fo: chain[i + 1], hd: chain[i + 2] };
    return null;
  }
  // Осанка ботов (сутулость, автомат) — настраивается в ⚙ → «Боты», сохраняется
  const BOT = { lean: 0.45, head: 0.3, gx: -0.1, gy: 1.3, gz: 0.3 };
  try { Object.assign(BOT, JSON.parse(localStorage.getItem('bot_v1'))); } catch (e) {}
  const saveBot = () => { try { localStorage.setItem('bot_v1', JSON.stringify(BOT)); } catch (e) {} };
  function dress(b) {
    const t = tpl[b.team];
    if (!t || b.model || !THREE.SkeletonUtils) return;
    const root = new THREE.Group();
    root.rotation.y = FACE; root.add(THREE.SkeletonUtils.clone(t));
    root.traverse(o => { o.frustumCulled = false; });
    b.inner.add(root); b.model = root; b.vis.visible = false;
    const gun = GUN.obj ? GUN.obj.clone(true) : new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    b.inner.add(gun); b.gun = gun;
    if (CLIPS[b.team]) { gun.position.set(-0.1, 1.36, 0.3); b.mesh.updateMatrixWorld(true); setupAnim(b, root, gun); return; }   // есть готовые анимации
    repose(b);
  }
  function repose(b) {                          // собирает позу заново: сутулость + руки на автомате
    const root = b.model, gun = b.gun;
    if (!root || b.mixer) return;
    root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    gun.position.set(BOT.gx, BOT.gy, BOT.gz);
    b.mesh.updateMatrixWorld(true);
    const bones = []; root.traverse(o => { if (o.isBone) bones.push(o); });
    const H = 1.8, P = o => b.mesh.worldToLocal(o.getWorldPosition(new V()));
    const bq = b.mesh.getWorldQuaternion(new THREE.Quaternion()), right = new V(1, 0, 0).applyQuaternion(bq);
    const tilt = (o, ang) => {                  // наклон вперёд вокруг оси «вбок», не зная локальных осей кости
      const wq = o.getWorldQuaternion(new THREE.Quaternion()), pq = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      o.quaternion.copy(pq.multiply(new THREE.Quaternion().setFromAxisAngle(right, ang)).multiply(wq));
      o.updateMatrixWorld(true);
    };
    const spine = bones.filter(o => /spine|waist|torso/.test(o.name.toLowerCase())).sort((a, c) => P(a).y - P(c).y)[0]
      || bones.filter(o => Math.abs(P(o).x) < 0.1 && P(o).y > 0.58 * H && P(o).y < 0.75 * H).sort((a, c) => P(a).y - P(c).y)[0];
    if (spine) tilt(spine, BOT.lean);
    const head = bones.find(o => /head/.test(o.name.toLowerCase()));
    if (head) tilt(head, -BOT.head);
    let ok = 0;
    [['r', -1, new V(0, -0.06, -0.14), new V(-0.6, -1, -0.3)], ['l', 1, new V(0, -0.05, 0.16), new V(0.6, -1, -0.3)]].forEach(([sd, sg, grip, hint]) => {
      let up = pick(bones, sd, /upperarm|uparm/), fo = pick(bones, sd, /forearm|lowerarm/), hd = pick(bones, sd, /hand/);
      if (!(up && fo && hd)) { const g = geoArm(bones, P, sg, H); if (g) { up = g.up; fo = g.fo; hd = g.hd; } }
      if (up && fo && hd) { ik(up, fo, hd, gun.localToWorld(grip.clone()), hint.applyQuaternion(bq)); ok++; }
    });
    if (ok < 2 && !window.__dbg) { window.__dbg = 1; dbg('кости рук не найдены (' + b.team + '): ' + bones.slice(0, 40).map(o => o.name).join(', ')); }
    b.legs = [['l', 1], ['r', -1]].map(([sd, sg]) => {
      const o = pick(bones, sd, /thigh|upleg|upperleg/) || bones.filter(k => sg * P(k).x > 0.03 && P(k).y > 0.35 * H && P(k).y < 0.62 * H).sort((a, c) => P(c).y - P(a).y)[0];
      return o && { o, base: o.quaternion.clone(), axis: right.clone().applyQuaternion(o.parent.getWorldQuaternion(new THREE.Quaternion()).invert()) };
    });
  }
  function botPanel() {                         // ползунки осанки ботов внутри ⚙
    const panel = document.getElementById('hn-p');
    if (!panel) return;
    const title = document.createElement('div'); title.textContent = 'Боты (меняются сразу)'; title.style.cssText = 'margin-top:8px;color:#94a3b8';
    const g = document.createElement('div'); g.id = 'hn-g';
    [['lean', 0, 0.9, 0.01, 'Сутулость'], ['head', 0, 0.7, 0.01, 'Голова вверх'], ['gx', -0.4, 0.2, 0.01, 'Автомат ←→'], ['gy', 1.0, 1.6, 0.01, 'Автомат ↕'], ['gz', 0, 0.7, 0.01, 'Автомат вперёд']].forEach(([k, lo, hi, st, name]) => {
      const r = document.createElement('label');
      r.innerHTML = '<span>' + name + '</span><input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '" value="' + BOT[k] + '">';
      r.querySelector('input').addEventListener('input', e => { BOT[k] = +e.target.value; saveBot(); bots.forEach(repose); });
      g.appendChild(r);
    });
    panel.appendChild(title); panel.appendChild(g);
  }
  function dbg(txt) {                          // подсказка на экране, если что-то не нашлось
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:4px;bottom:4px;z-index:300;color:#fff;font:10px monospace;background:rgba(0,0,0,.65);max-width:70%;pointer-events:none';
    d.textContent = txt; document.body.appendChild(d);
  }
  const pickClip = (list, res) => { for (const re of res) { const c = list.find(x => re.test(x.name.toLowerCase())); if (c) return c; } return null; };
  const LOWER = /pelvis|thigh|calf|foot|toe|hip|knee|leg/i, ROOT = /^(bip\d*|root|armature|scene)$/i;
  const trackNode = tr => tr.name.split('.')[0];
  const cut = (clip, keep) => { const c = clip.clone(); c.tracks = c.tracks.filter(tr => keep(trackNode(tr), tr)); return c; };   // клип только с нужными костями
  function buildTeam(g, t) {
    const root = g.scene, all = g.animations || [], names = new Set();
    root.traverse(o => names.add(o.name));
    const usable = c => c && c.tracks.length && c.tracks.filter(tr => names.has(trackNode(tr))).length / c.tracks.length > 0.5;
    const ok = c => !/shoot|fire|reload|die|death|jump|swim|flinch|tread|pistol|knife|grenade|shotgun|sniper|para|mp5|awp|c4|deploy|draw/i.test(c.name);
    const std = all.filter(c => ok(c) && !/crouch/i.test(c.name)), cr = all.filter(c => ok(c) && /crouch/i.test(c.name));
    let aim = pickClip(std, [/ak47/, /rifle|m4a1|aug|sg552|galil|famas/, /aim/, /idle|stand/]);
    let run = pickClip(std, [/^run$/, /run/, /^walk$/, /walk/]);
    let crouch = pickClip(cr, [/ak47/, /rifle|m4a1|aug|sg552|galil|famas/, /aim|idle/]);
    aim = usable(aim) ? aim : null; run = usable(run) ? run : null; crouch = usable(crouch) ? crouch : null;
    if (aim || run) { const mx = new THREE.AnimationMixer(root); mx.clipAction(aim || run).play(); mx.update(0); }   // замерить рост в позе анимации
    else dbg('анимации не подошли (' + t + '). клипы: ' + all.slice(0, 40).map(c => c.name).join(', '));
    CLIPS[t] = (aim || run) ? {
      aim, run, crouch,
      upper: aim ? cut(aim, n => !LOWER.test(n)) : null,                                                   // руки и корпус держат автомат
      lower: run ? cut(run, (n, tr) => LOWER.test(n) && !(ROOT.test(n) && /position/.test(tr.name))) : null   // ноги бегут
    } : null;
    tpl[t] = fitTo(root, 1.8, true);
  }
  function setupAnim(b, root, gun) {
    const C = CLIPS[b.team], bones = []; root.traverse(o => { if (o.isBone) bones.push(o); });
    b.mixer = new THREE.AnimationMixer(root); b.act = {}; b.wt = {};
    [['aim', C.aim], ['up', C.upper], ['low', C.lower], ['run', C.run], ['cr', C.crouch]].forEach(([k, c]) => {
      if (c) { const a = b.mixer.clipAction(c); a.setEffectiveWeight(0); a.play(); b.act[k] = a; }
    });
    b.hr = pick(bones, 'r', /hand/); b.hl = pick(bones, 'l', /hand/); b.gun = gun;
  }
  function animate(b, dt) {
    const A = b.act, w = {};
    if (b.crouch && A.cr) w.cr = 1;
    else if (b.walk && A.up && A.low) { w.up = 1; w.low = 1; }
    else if (b.walk && A.run) w.run = 1;
    else w[A.aim ? 'aim' : 'run'] = 1;
    for (const n in A) { b.wt[n] = (b.wt[n] || 0) + ((w[n] || 0) - (b.wt[n] || 0)) * Math.min(1, 10 * dt); A[n].setEffectiveWeight(b.wt[n]); }
    if (A.run && !A.aim) A.run.timeScale = b.walk ? 1 : 0;
    b.mixer.update(dt);
    if (b.hr && b.hl) {                          // автомат держится в руках анимации
      b.mesh.updateMatrixWorld(true);
      const r = b.mesh.worldToLocal(b.hr.getWorldPosition(new V())), l = b.mesh.worldToLocal(b.hl.getWorldPosition(new V()));
      b.gun.quaternion.setFromUnitVectors(new V(0, 0, 1), l.sub(r).normalize());
      b.gun.position.copy(r).sub(new V(0, -0.06, -0.14).applyQuaternion(b.gun.quaternion));
    }
  }
  function loadModels() {
    const L = new THREE.GLTFLoader();
    const load = t => L.load(FILES[t], g => {
      try { buildTeam(g, t); } catch (e) { console.log('модель', t, e); dbg('ошибка модели ' + t + ': ' + e.message); }
      bots.forEach(b => { if (b.team === t) dress(b); });
    }, undefined, () => dbg('не загрузился ' + FILES[t]));
    const both = () => { load('A'); load('B'); };
    L.load('ak-47_low_poly.glb', g => { GUN.obj = fitTo(g.scene, 0.88, false); both(); }, undefined, both);
  }

  // ---------- карта Crid ----------
  const MAPFILE = 'lowpoly__fps__tdm__game__map_by_resoforge.glb';
  function loadMap() {
    new THREE.GLTFLoader().load(MAPFILE, g => {
      try { applyMap(g.scene); } catch (e) { console.log('карта', e); dbg('ошибка карты: ' + e.message); }
    }, undefined, () => dbg('не загрузилась карта ' + MAPFILE));
  }
  function applyMap(m) {
    const wrap = new THREE.Group(); wrap.add(m); m.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(wrap); const sz = box.getSize(new V());
    wrap.rotation.y = sz.x > sz.z ? Math.PI / 2 : 0;               // длинная сторона вдоль z (спавны по краям)
    wrap.scale.setScalar(76 / Math.max(sz.x, sz.z));
    wrap.updateMatrixWorld(true);
    const a = new V(), b = new V(), c = new V(), tris = [];
    let floorY = null, fa = 0;
    wrap.traverse(o => {                                           // собираем треугольники и ищем уровень пола
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index, cnt = idx ? idx.count : pos.count;
      for (let t = 0; t < cnt; t += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(o.matrixWorld);
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        const n = new V().crossVectors(b.clone().sub(a), c.clone().sub(a)), area = n.length() / 2;
        if (area > fa && Math.abs(n.y) / (n.length() || 1) > 0.95) { fa = area; floorY = a.y; }
      }
    });
    box = new THREE.Box3().setFromObject(wrap);
    const ctr = box.getCenter(new V()), dx = -ctr.x, dy = -(floorY === null ? box.min.y : floorY), dz = -ctr.z;
    wrap.position.set(dx, dy, dz); wrap.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(wrap), cs = 0.5, x0 = bb.min.x, z0 = bb.min.z, nx = Math.ceil((bb.max.x - x0) / cs), nz = Math.ceil((bb.max.z - z0) / cs);
    const low = new Uint8Array(nx * nz), tall = new Uint8Array(nx * nz), oH = new Float32Array(nx * nz), layers = new Array(nx * nz);
    const cellK = (x, zz) => { const i = Math.floor((x - x0) / cs), j = Math.floor((zz - z0) / cs); return (i >= 0 && j >= 0 && i < nx && j < nz) ? i * nz + j : -1; };
    for (let t = 0; t < tris.length; t += 9) {
      const ax = tris[t] + dx, ay = tris[t + 1] + dy, az = tris[t + 2] + dz, bx = tris[t + 3] + dx, by = tris[t + 4] + dy, bz = tris[t + 5] + dz, cx = tris[t + 6] + dx, cy = tris[t + 7] + dy, cz = tris[t + 8] + dz;
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx, nl = Math.hypot(nxv, nyv, nzv) || 1;
      const lo = Math.min(ay, by, cy), hi = Math.max(ay, by, cy), walk = nyv / nl > 0.6;   // смотрит вверх — по нему можно ходить
      if (walk ? (hi > 4.5 || hi < -0.1) : (hi < 0.35 || lo > 1.9)) continue;
      const L = Math.max(Math.hypot(ax - bx, az - bz), Math.hypot(bx - cx, bz - cz), Math.hypot(cx - ax, cz - az)), st = Math.max(1, Math.ceil(L / 0.25));
      for (let u = 0; u <= st; u++) for (let v = 0; v <= st - u; v++) {
        const p = u / st, q = v / st, w = 1 - p - q, k = cellK(ax * w + bx * p + cx * q, az * w + bz * p + cz * q);
        if (k < 0) continue;
        if (walk) { const h = Math.round((ay * w + by * p + cy * q) * 10) / 10, Ls = layers[k] || (layers[k] = []); if (Ls.indexOf(h) < 0) Ls.push(h); }
        else { if (hi > oH[k]) oH[k] = hi; if (hi > 1.4) tall[k] = 1; }
      }
    }
    for (let k = 0; k < nx * nz; k++) low[k] = oH[k] > 0.5 ? 1 : 0;
    const rects = [];
    for (let i = 0; i < nx; i++) { let j = 0; while (j < nz) { if (!low[i * nz + j]) { j++; continue; } let k = j; while (k < nz && low[i * nz + k]) k++; rects.push({ x0: x0 + i * cs, x1: x0 + (i + 1) * cs, z0: z0 + j * cs, z1: z0 + k * cs, h: 3 }); j = k; } }
    colliders.forEach(o => scene.remove(o)); scene.children.filter(o => o.type === 'GridHelper').forEach(o => scene.remove(o));
    colliders.length = 0; walls.length = 0; solids.length = 0;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(bb.max.x - bb.min.x, bb.max.z - bb.min.z), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    fl.rotation.x = -Math.PI / 2; fl.position.set((bb.min.x + bb.max.x) / 2, 0.01, (bb.min.z + bb.max.z) / 2); fl.receiveShadow = true;
    scene.add(fl); colliders.push(fl);                                  // белый пол
    scene.add(wrap); wrap.traverse(o => { if (o.isMesh) { colliders.push(o); o.castShadow = o.receiveShadow = true; } });
    grid = { x0, z0, cs, nx, nz, low, tall, oH, layers, rects };
    buildNav();
    const xs = [-6, -3, 0, 3, 6];
    SPAWN.A = xs.map(x => freeNear(x, 32)); SPAWN.B = xs.map(x => freeNear(x, -32));
    const f = Math.min(1, (bb.max.x - bb.min.x) / 2 * 0.6 / 30);   // маршруты ботов под ширину карты
    ['A', 'B'].forEach(t => LANES[t].forEach(l => l.forEach(pt => { pt.x *= f; })));
    if (!started) { bots.forEach(spawnAt); respawnPlayer(); }
  }

  function makeBot(team, idx) {
    const g = new THREE.Group(), inner = new THREE.Group(), vis = new THREE.Group(), shirt = COL[team];   // vis — запасной блочный бот
    g.add(inner); inner.add(vis);
    const part = (w, h, d, c, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c }));
      m.position.set(x, y, z); m.castShadow = true; vis.add(m);
    };
    part(0.5, 0.6, 0.3, shirt, 0, 1.05, 0);
    part(0.35, 0.35, 0.35, 0xfca5a5, 0, 1.55, 0);
    part(0.15, 0.5, 0.15, shirt, -0.35, 1.1, 0.05);
    part(0.15, 0.15, 0.5, shirt, 0.25, 1.2, 0.25);
    part(0.08, 0.1, 0.6, 0x111111, 0.25, 1.25, 0.5);
    const leg = x => {
      const p = new THREE.Group(); p.position.set(x, 0.75, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x334155 }));
      m.position.y = -0.3; p.add(m); vis.add(p); return p;
    };
    const hb = (w, h, d, y, head) => {      // невидимые хитбоксы: по ним летят пули, поза модели не важна
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.y = y; m.userData.hb = true; if (head) m.userData.isHead = true; inner.add(m);
    };
    hb(0.5, 1.5, 0.4, 0.8); hb(0.3, 0.3, 0.3, 1.62, true);
    const lane = idx % 3;
    if (!squads[team][lane]) squads[team][lane] = { bots: [], turn: 0, wp: 0, arr: 0 };
    const stat = { name: NICKS[stats.length % NICKS.length], team, kills: 0, assists: 0, deaths: 0, ping: 40 + Math.floor(Math.random() * 86) }; stats.push(stat);
    const b = { mesh: g, inner, vis, model: null, legs: null, stat, dmg: new Set(), team, idx, lane, sq: squads[team][lane], hp: 100, dead: false, respawn: 0,
      lL: leg(0.15), rL: leg(-0.15), path: [], goal: null, nextPath: 0, think: Math.random() * 0.2, react: 0, last: 0, target: null, anim: 0, walk: false, chk: -1,
      mt: 0, sdir: 1, jt: 2 + Math.random() * 5, jy: 0, vy: 0, cs: 1, crouch: false };
    b.sq.bots.push(b);
    scene.add(g); bots.push(b); spawnAt(b);
  }
  function spawnAt(b) {
    const s = SPAWN[b.team][Math.floor(Math.random() * 5)];
    b.mesh.position.set(s[0], 0, s[1]); b.mesh.rotation.y = b.team === 'A' ? Math.PI : 0;
    b.hp = 100; b.dead = false; b.mesh.visible = true; b.path = []; b.goal = null; b.target = null; b.ls = null; b.dmg.clear(); b.jy = 0; b.vy = 0; b.crouch = false;
  }
  const eye = b => new V(b.mesh.position.x, b.mesh.position.y + 1.5 * b.cs + b.jy, b.mesh.position.z);
  function turnTo(b, yaw, dt, rate) {
    const d = Math.atan2(Math.sin(yaw - b.mesh.rotation.y), Math.cos(yaw - b.mesh.rotation.y)), st = (rate || 6) * dt;
    b.mesh.rotation.y += Math.max(-st, Math.min(st, d));
  }
  function follow(b, goal, dt, speed) {
    const pos = b.mesh.position;
    if (!b.goal || b.goal.distanceTo(goal) > 2 || b.nextPath <= 0) { b.goal = goal.clone(); b.path = findPath(pos, goal); b.nextPath = 1.5; }
    const w = b.path[0];
    if (!w) return;
    const dx = w.x - pos.x, dz = w.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.8) { b.path.shift(); return; }
    pos.x += dx / d * speed * dt; pos.z += dz / d * speed * dt;
    resolve(pos, 0.4, pos.y);
    turnTo(b, Math.atan2(dx, dz), dt); b.walk = true;
  }
  function perceive(b) {
    const pos = b.mesh.position, fx = Math.sin(b.mesh.rotation.y), fz = Math.cos(b.mesh.rotation.y);
    let best = null, bd = 1e9;
    const foes = bots.filter(o => !o.dead && o.team !== b.team).map(o => ({ pos: o.mesh.position, bot: o }));
    if (b.team === 'B' && !player.dead) foes.push({ pos: player.pos, ply: true });
    foes.forEach(e => {
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 45 || d >= bd) return;
      if (d > 7 && (dx * fx + dz * fz) / d < 0.35) return;            // вне поля зрения
      if (los(eye(b), new V(e.pos.x, e.ply ? e.pos.y - 0.2 : 1.3, e.pos.z))) { best = e; bd = d; }
    });
    if (best && !b.target) b.react = 0.3 + Math.random() * 0.4;       // время реакции
    b.target = best;
    if (best) intel[b.team] = { pos: new V(best.pos.x, 0, best.pos.z), t: T };   // сообщил команде
  }
  function damageBot(o, dmg, team, from, byPlayer, who) {
    if (o.dead) return;
    o.hp -= dmg; if (who) o.dmg.add(who);
    intel[o.team] = { pos: new V(from.x, 0, from.z), t: T };
    if (o.hp <= 0) {
      o.dead = true; o.mesh.visible = false; o.respawn = 3; score[team]++; o.stat.deaths++; o.ls = null; if (who) feed(who, o.stat);
      if (who) { who.kills++; o.dmg.forEach(a => { if (a !== who && a.team === who.team) a.assists++; }); }   // П: бил, а добил сокомандник
      if (byPlayer) { player.score++; updateUI(); }
    }
  }
  function hurt(d, who) {
    if (player.dead || over) return;
    player.hp = Math.max(0, player.hp - d); updateUI(); if (who) mine.add(who);
    const h = document.getElementById('hurt'); h.style.opacity = 1; setTimeout(() => { h.style.opacity = 0; }, 80);
    if (player.hp <= 0) { player.dead = true; respawnIn = 3; score.B++; me.deaths++; if (who) feed(who, me); if (who) { who.kills++; mine.forEach(a => { if (a !== who) a.assists++; }); } document.getElementById('msg').textContent = 'ВЫ УБИТЫ'; }
  }
  function respawnPlayer() {
    const s = SPAWN.A[Math.floor(Math.random() * 5)];
    player.pos.set(s[0], 1.6, s[1]); player.vel.set(0, 0, 0); player.hp = 100; player.dead = false;
    resetLoadout(); openShop(); cameraYaw = 0; cameraPitch = 0;
    mine.clear(); document.getElementById('msg').textContent = ''; updateUI();
  }

  window.updateBots = function (dt) {
    if (!started || over) return;
    T += dt; timeLeft -= dt;
    if (timeLeft <= 0) endMatch();
    bots.forEach(b => {
      if (b.dead) { b.respawn -= dt; if (b.respawn <= 0) spawnAt(b); return; }
      const pos = b.mesh.position;
      b.walk = false; b.react -= dt; b.nextPath -= dt; b.think -= dt;
      if (b.think <= 0) { b.think = 0.2 + Math.random() * 0.1; perceive(b); }
      if (b.target) {
        const e = b.target, dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, d = Math.hypot(dx, dz);
        turnTo(b, Math.atan2(dx, dz), dt, 9);
        b.mt -= dt;                                   // каждые ~1 с: присесть / стрейфить / иногда подпрыгнуть
        if (b.mt <= 0) { b.mt = 0.6 + Math.random() * 1.2; b.sdir = Math.random() < 0.5 ? -1 : 1; b.crouch = d > 14 && Math.random() < 0.5; if (!b.crouch && b.jy === 0 && Math.random() < 0.12) b.vy = 5.5; }
        if (!b.crouch && d > 5) { pos.x += -dz / d * b.sdir * 2.6 * dt; pos.z += dx / d * b.sdir * 2.6 * dt; resolve(pos, 0.4, pos.y); b.walk = true; }
        if (b.react <= 0 && T - b.last > 0.16) {
          b.last = T;
          const pr = Math.max(0.08, 0.55 - d * 0.012) * (b.crouch ? 1.25 : 1) * (b.jy > 0 ? 0.4 : 1) * (b.walk ? 0.8 : 1);
          if (Math.random() < pr) e.ply ? hurt(9, b.stat) : damageBot(e.bot, 12, b.team, pos, false, b.stat);
        }
        if (d > 22) follow(b, e.pos, dt, 4.5);
      } else {
        const it = intel[b.team];
        if (it && T - it.t < 10 && b.chk !== it.t && Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z) < 40) {
          b.crouch = false; follow(b, it.pos, dt, 5.5);                                  // проверить позицию вместе с командой
          if (Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z) < 3.5) b.chk = it.t;
        } else {
          const sq = b.sq, wps = LANES[b.team][b.lane], alive = sq.bots.filter(x => !x.dead).length;
          while (sq.bots[sq.turn].dead) sq.turn = (sq.turn + 1) % sq.bots.length;
          if (sq.bots[sq.turn] === b) {                                // идёт один, остальные держат углы
            const g = wps[sq.wp % wps.length];
            b.crouch = false; follow(b, g, dt, 5);
            if (Math.hypot(g.x - pos.x, g.z - pos.z) < 3.5) {
              sq.arr++; sq.turn = (sq.turn + 1) % sq.bots.length;
              if (sq.arr >= alive) { sq.arr = 0; sq.wp++; }
            }
          } else { b.crouch = Math.sin(T * 0.3 + b.idx * 3) > 0.4; turnTo(b, (b.team === 'A' ? Math.PI : 0) + Math.sin(T * 0.9 + b.idx * 2) * 1.1, dt, 3); }
        }
      }
      if (grid) pos.y = groundAt(pos.x, pos.z, pos.y);
      b.jt -= dt;                                       // прыжки на бегу + физика
      if (b.walk && b.jt <= 0) { b.jt = 3 + Math.random() * 6; if (!b.crouch && b.jy === 0 && Math.random() < 0.35) b.vy = 5.5; }
      if (b.jy > 0 || b.vy > 0) { b.vy -= 18 * dt; b.jy = Math.max(0, b.jy + b.vy * dt); if (b.jy === 0) b.vy = 0; }
      b.cs += (((b.crouch && !(b.act && b.act.crouch)) ? 0.78 : 1) - b.cs) * Math.min(1, 10 * dt);
      b.inner.position.y = b.jy; b.inner.scale.y = b.cs;
      b.anim += (b.walk ? dt * 9 : 0);
      const sw = b.walk ? Math.sin(b.anim) * 0.6 : 0;
      b.lL.rotation.x = sw; b.rL.rotation.x = -sw;
      if (b.legs) b.legs.forEach((l, i) => { if (l) l.o.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(l.axis, i ? -sw : sw).multiply(l.base)); });
      if (b.mixer) animate(b, dt);
    });
    const t = Math.max(0, Math.ceil(timeLeft));
    document.getElementById('sa').textContent = score.A; document.getElementById('sb').textContent = score.B;
    document.getElementById('st').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };
  function tabUI() {
    const css = document.createElement('style');
    css.textContent = '#tab{position:absolute;top:0;left:0;width:100%;height:100%;z-index:150;background:rgba(0,0,0,.45);display:none;flex-direction:column;justify-content:center;align-items:center;font-family:sans-serif;color:#fff;pointer-events:none}' +
      '#tabw{display:flex;width:min(1000px,96vw);background:rgba(15,15,18,.9)}#tabw>div{flex:1;min-width:0}#tabw>div+div{border-left:2px solid rgba(255,255,255,.15)}' +
      '.t{display:flex;justify-content:space-between;padding:6px 12px;font:800 19px sans-serif}.r{display:flex;align-items:center;padding:4px 12px;font-size:13px;color:#cbd5e1}' +
      '.r.h{color:#94a3b8}.r.me{background:rgba(255,255,255,.14);color:#fff}.r i{width:24px;font-style:normal}.r span{flex:1;overflow:hidden;white-space:nowrap}.r b{width:42px;text-align:center;font-weight:600}' +
      '#tabf{width:min(1000px,96vw);padding:6px 12px;background:rgba(15,15,18,.9);font-size:13px;color:#cbd5e1;box-sizing:border-box}';
    document.head.appendChild(css);
    const d = document.createElement('div');
    d.id = 'tab';
    d.innerHTML = '<div id="tabw"><div id="tabA"></div><div id="tabB"></div></div><div id="tabf">Командный бой 5х5 | Crid | Россия</div>';
    document.body.appendChild(d);
  }
  function fillTab() {                            // таблица: в конце матча и по кнопке статистики
    const rows = t => stats.filter(x => x.team === t).sort((a, b) => b.kills - a.kills).map((x, i) =>
      '<div class="r' + (x === me ? ' me' : '') + '"><i>' + (i + 1) + '</i><span>' + x.name + '</span><b>' + x.kills + '</b><b>' + x.assists + '</b><b>' + x.deaths + '</b><b>' + x.ping + '</b></div>').join('');
    const head = '<div class="r h"><i>#</i><span>Имя</span><b>У</b><b>П</b><b>С</b><b>Пинг</b></div>';
    document.getElementById('tabA').innerHTML = '<div class="t" style="color:#7aa7ff"><span>ОБОРОНА (СТ)</span><b>' + score.A + '</b></div>' + head + rows('A');
    document.getElementById('tabB').innerHTML = '<div class="t" style="color:#f59e0b"><span>АТАКА (Т)</span><b>' + score.B + '</b></div>' + head + rows('B');
  }
  function endMatch() {
    over = true; tabOn = false; fillTab();
    document.getElementById('res').textContent = score.A > score.B ? 'ПОБЕДА' : score.A < score.B ? 'ПОРАЖЕНИЕ' : 'НИЧЬЯ';
    document.getElementById('resd').textContent = 'Счёт ' + score.A + ' : ' + score.B + ' · Ваши убийства: ' + me.kills;
    const tab = document.getElementById('tab');
    tab.style.display = 'flex';
    setTimeout(() => { tab.style.display = 'none'; document.getElementById('end').style.display = 'flex'; }, 7000);   // таб висит 7 секунд
  }

  // киллчат: ник убийцы, череп, ник убитого
  const tc = t => t === 'A' ? '#60a5fa' : '#f59e0b';
  function feed(k, v) {
    const kf = document.getElementById('kf'), d = document.createElement('div');
    d.className = 'k' + (k === me || v === me ? ' me' : '');
    d.innerHTML = '<span style="color:' + tc(k.team) + '">' + k.name + '</span> 💀 <span style="color:' + tc(v.team) + '">' + v.name + '</span>';
    kf.appendChild(d);
    while (kf.children.length > 5) kf.removeChild(kf.firstChild);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, 5000);
  }
  function uiExtra() {
    uiWeapons(); botPanel();
    const css = document.createElement('style');
    css.textContent = '#kf{position:absolute;right:138px;top:68px;z-index:20;display:flex;flex-direction:column;align-items:flex-end;gap:3px;pointer-events:none}' +
      '.k{background:rgba(15,23,42,.72);border-radius:6px;padding:2px 8px;font:700 12px sans-serif;color:#fff;transition:opacity .5s}.k.me{outline:1px solid rgba(255,255,255,.7)}' +
      '#sbtn{position:absolute;right:138px;top:20px;z-index:160;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(15,23,42,.78);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;padding:0 0 0 10px}' +
      '#sbtn i{display:block;height:2.5px;background:#fff;border-radius:2px}#sbtn i:nth-child(1){width:10px}#sbtn i:nth-child(2){width:14px}#sbtn i:nth-child(3){width:18px}';
    document.head.appendChild(css);
    const kf = document.createElement('div'); kf.id = 'kf'; document.body.appendChild(kf);
    const sb = document.createElement('button');
    sb.id = 'sbtn'; sb.className = 'interactive-ui'; sb.innerHTML = '<i></i><i></i><i></i>';
    const toggle = () => { if (over) return; tabOn = !tabOn; if (tabOn) fillTab(); document.getElementById('tab').style.display = tabOn ? 'flex' : 'none'; };
    sb.addEventListener('touchstart', e => { e.preventDefault(); toggle(); }, { passive: false });
    sb.addEventListener('click', toggle);
    document.body.appendChild(sb);
    setInterval(() => { if (tabOn && !over) fillTab(); }, 500);
  }

  // мини-карта: стены, сектор обзора, свои — синие, я — белый.
  // Враг виден на экране → красная точка; пропал из виду → пустое кольцо на последнем месте, тает 3 секунды.
  window.renderMinimap = function () {
    const ctx = document.getElementById('minimap-canvas').getContext('2d'), c = 55, k = 1.4;
    camera.updateMatrixWorld();
    ctx.clearRect(0, 0, 110, 110);
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, 54, 0, 6.283); ctx.clip();
    const px = player.pos.x, pz = player.pos.z;
    ctx.fillStyle = 'rgba(148,163,184,.4)';
    (grid ? grid.rects : solids).forEach(s => ctx.fillRect(c + (s.x0 - px) * k, c + (s.z0 - pz) * k, (s.x1 - s.x0) * k, (s.z1 - s.z0) * k));
    const ang = Math.atan2(-Math.cos(cameraYaw), -Math.sin(cameraYaw)), hf = Math.atan(Math.tan(camera.fov * 0.5 * Math.PI / 180) * camera.aspect);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, 42, ang - hf, ang + hf); ctx.closePath(); ctx.fill();
    const dot = (x, y, col, r) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); };
    const ring = (x, y, a) => { ctx.strokeStyle = 'rgba(239,68,68,' + a + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 2.7, 0, 6.283); ctx.stroke(); };
    bots.forEach(b => {
      if (b.dead) return;
      const bx = b.mesh.position.x, bz = b.mesh.position.z;
      if (b.team === 'A') { dot(c + (bx - px) * k, c + (bz - pz) * k, '#3b82f6', 3.2); return; }
      const v = new V(bx, 1.2, bz), q = v.clone().project(camera);
      const mine = !player.dead && q.z < 1 && Math.abs(q.x) < 1 && Math.abs(q.y) < 1 && los(camera.position, v);
      if (mine || bots.some(a => !a.dead && a.team === 'A' && a.target && a.target.bot === b)) b.ls = { x: bx, z: bz, t: T };   // вижу я или кто-то из своих
      const l = b.ls;
      if (!l) return;
      if (T - l.t < 0.1) dot(c + (bx - px) * k, c + (bz - pz) * k, '#ef4444', 3.4);
      else if (T - l.t < 3) ring(c + (l.x - px) * k, c + (l.z - pz) * k, 1 - (T - l.t) / 3);
    });
    ctx.restore();
    dot(c, c, '#fff', 4);
    ctx.fillStyle = '#fff'; ctx.beginPath();                                    // стрелка: куда смотрю
    ctx.moveTo(c + Math.cos(ang) * 14, c + Math.sin(ang) * 14);
    ctx.lineTo(c + Math.cos(ang + 2.6) * 7, c + Math.sin(ang + 2.6) * 7); ctx.lineTo(c + Math.cos(ang - 2.6) * 7, c + Math.sin(ang - 2.6) * 7);
    ctx.closePath(); ctx.fill();
  };

  // ---------- оружие: колесо выбора, магазин на 10 секунд, хитмаркер ----------
  const WS = { rifle: { mag: 30, int: 110, name: 'AK-47' }, pistol: { mag: 12, int: 190, name: '' }, knife: { mag: 0, int: 550, name: 'НОЖ' } };
  const PN = { usp: 'USP-S', deagle: 'Desert Eagle', beretta: 'Beretta 92FS' };
  const loadout = { pistol: 'usp' }, store = { rifle: { mag: 30, res: 90 }, pistol: { mag: 12, res: 36 } };
  const wname = () => curW === 'pistol' ? PN[loadout.pistol] : WS[curW].name;
  function equip(slot) {
    if (store[curW]) { store[curW].mag = player.ammoInMag; store[curW].res = player.reserveAmmo; }
    curW = slot;
    const w = WS[slot], st = store[slot] || { mag: 0, res: 0 };
    player.maxMag = w.mag; player.ammoInMag = st.mag; player.reserveAmmo = st.res; player.shootInterval = w.int; player.isReloading = false;
    document.getElementById('weapon-name').innerText = wname(); updateUI();
    const sw = document.getElementById('wsw'); if (sw) sw.textContent = { rifle: 'AK', pistol: '🔫', knife: '🔪' }[slot];
    if (window.HW_set) window.HW_set(slot === 'pistol' ? loadout.pistol : slot);
  }
  window.GAME_SET = n => {                          // переключение из ⚙ тоже меняет оружие в игре (нож бьёт, а не стреляет)
    if (PN[n]) { loadout.pistol = n; if (curW === 'pistol') { document.getElementById('weapon-name').innerText = wname(); if (window.HW_set) window.HW_set(n); } else equip('pistol'); }
    else if (n !== curW) equip(n); else if (window.HW_set) window.HW_set(n);
  };
  function resetLoadout() { store.rifle = { mag: 30, res: 90 }; store.pistol = { mag: 12, res: 36 }; curW = 'knife'; equip('rifle'); }
  window.updateUI = function () {
    document.getElementById('hp-val').innerText = Math.round(player.hp);
    document.getElementById('hp-bar-fill').style.width = player.hp + '%';
    document.getElementById('score-val').innerText = player.score;
    document.getElementById('ammo-count').innerText = curW === 'knife' ? '—' : player.ammoInMag + ' / ' + player.reserveAmmo;
  };
  window.reloadAmmo = function () {
    if (curW === 'knife' || player.isReloading || player.reserveAmmo <= 0 || player.ammoInMag === player.maxMag) return;
    player.isReloading = true; document.getElementById('weapon-name').innerText = 'ПЕРЕЗАРЯДКА...';
    const w = curW;
    setTimeout(() => {
      if (curW !== w) return;
      const take = Math.min(player.maxMag - player.ammoInMag, player.reserveAmmo);
      player.ammoInMag += take; player.reserveAmmo -= take; player.isReloading = false;
      document.getElementById('weapon-name').innerText = wname(); updateUI();
    }, w === 'pistol' ? 1200 : 1500);
  };
  function knifeHit(now) {
    player.lastShootTime = now; weaponContainer.position.z = 0.08;
    const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
    let best = null, bd = 1e9;
    bots.forEach(b => {
      if (b.dead || b.team === 'A') return;
      const dx = b.mesh.position.x - player.pos.x, dz = b.mesh.position.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.9 && (dx * fx + dz * fz) / (d || 1) > 0.5 && d < bd) { bd = d; best = b; }
    });
    if (best) { damageBot(best, 55, 'A', player.pos, true, me); hm(best.dead); }
  }
  let hmT = null;
  function hm(kill) {                              // белый хитмаркер — попал, красный — убил
    const el = document.getElementById('hm'); if (!el) return;
    el.style.color = kill ? '#ef4444' : '#fff'; el.style.opacity = 1;
    clearTimeout(hmT); hmT = setTimeout(() => { el.style.opacity = 0; }, kill ? 320 : 150);
  }
  function openShop() { shopEnd = performance.now() + 10000; }
  function shopTick() {
    const cart = document.getElementById('cart'), shop = document.getElementById('shop');
    if (!cart) return;
    const left = Math.max(0, (shopEnd - performance.now()) / 1000), on = left > 0 && started && !over && !player.dead;
    cart.style.display = on ? 'flex' : 'none';
    if (!on) { shop.style.display = 'none'; return; }
    if (shop.style.display === 'block') {
      document.getElementById('shT').textContent = 'Покупка оружия 00:' + String(Math.ceil(left)).padStart(2, '0');
      document.getElementById('shB').firstChild.style.width = (left / 10 * 100) + '%';
    }
  }
  function uiWeapons() {
    const css = document.createElement('style');
    css.textContent = '#hm{position:absolute;left:50%;top:50%;width:0;height:0;z-index:25;pointer-events:none;opacity:0;color:#fff}' +
      '#hm i{position:absolute;left:-6px;top:-1px;width:12px;height:2.5px;background:currentColor;box-shadow:0 0 2px #000}' +
      '#hm i:nth-child(1){transform:translate(-13px,-13px) rotate(45deg)}#hm i:nth-child(2){transform:translate(13px,-13px) rotate(-45deg)}#hm i:nth-child(3){transform:translate(-13px,13px) rotate(-45deg)}#hm i:nth-child(4){transform:translate(13px,13px) rotate(45deg)}' +
      '#wheel{position:absolute;left:50%;top:50%;width:200px;height:200px;margin:-100px 0 0 -100px;border-radius:50%;background:rgba(15,23,42,.72);z-index:40;display:none;pointer-events:none;color:#fff;font:700 13px sans-serif}' +
      '#wheel div{position:absolute;left:50%;top:50%;width:70px;height:46px;margin:-23px 0 0 -35px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:.6;font-size:18px}#wheel div span{font-size:10px}#wheel div.on{opacity:1;background:rgba(255,255,255,.25)}' +
      '#wsw{position:absolute;right:240px;bottom:100px;z-index:30;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(15,23,42,.78);color:#fff;font:700 15px sans-serif}' +
      '#cart{position:absolute;left:18px;bottom:20px;z-index:30;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(15,23,42,.75);font-size:22px;display:none;align-items:center;justify-content:center}' +
      '#shop{position:absolute;top:0;left:0;width:100%;height:100%;z-index:120;background:rgba(10,12,18,.9);color:#fff;font-family:sans-serif;display:none}' +
      '#shT{position:absolute;left:14px;top:8px;font-size:14px}#shB{position:absolute;left:14px;right:60px;top:30px;height:4px;background:#333}#shB i{display:block;height:100%;background:#fff}' +
      '#shX{position:absolute;right:14px;top:6px;font-size:26px}#shC{position:absolute;left:14px;right:14px;top:48px;display:flex;gap:10px}' +
      '#shC .col{flex:1}#shC h4{margin:0 0 4px;font-size:12px;color:#94a3b8}#shC .it{padding:10px 8px;margin-bottom:4px;background:rgba(255,255,255,.1);border-radius:6px;font-size:13px}';
    document.head.appendChild(css);
    const d = document.createElement('div');
    d.innerHTML = '<div id="hm"><i></i><i></i><i></i><i></i></div>' +
      '<div id="wheel"><div id="wk" style="margin-left:-105px">🔪<span>Нож</span></div><div id="wp" style="margin-left:15px;margin-top:-75px">🔫<span>Пистолет</span></div><div id="wr" style="margin-top:47px">AK<span>Винтовка</span></div></div>' +
      '<button id="cart" class="interactive-ui">🛒</button><button id="wsw" class="interactive-ui">AK</button>' +
      '<div id="shop" class="interactive-ui"><div id="shT"></div><div id="shB"><i></i></div><div id="shX">✕</div><div id="shC"><div class="col"><h4>Пистолеты</h4><div class="it" data-p="usp">USP-S</div><div class="it" data-p="deagle">Desert Eagle</div><div class="it" data-p="beretta">Beretta 92FS</div></div><div class="col"><h4>Винтовки</h4><div class="it" data-r="1">AK-47</div></div></div></div>';
    document.body.appendChild(d);
    const $ = id => document.getElementById(id), shop = $('shop'), cart = $('cart');
    const toggle = () => { shop.style.display = shop.style.display === 'block' ? 'none' : 'block'; };
    cart.addEventListener('touchstart', e => { e.preventDefault(); toggle(); }, { passive: false });
    cart.addEventListener('click', toggle);
    const nxt = { rifle: 'pistol', pistol: 'knife', knife: 'rifle' }, swap = () => { if (!player.dead) equip(nxt[curW]); };
    $('wsw').addEventListener('touchstart', e => { e.preventDefault(); swap(); }, { passive: false });
    $('wsw').addEventListener('click', swap);
    $('shX').addEventListener('click', () => { shop.style.display = 'none'; });
    shop.addEventListener('click', e => {
      const it = e.target.closest('.it');
      if (!it || player.dead) return;
      if (it.dataset.p) { loadout.pistol = it.dataset.p; store.pistol = { mag: 12, res: 36 }; curW = 'knife'; equip('pistol'); } else equip('rifle');
      shop.style.display = 'none';
    });
    // колесо оружия: зажми панель патронов и потяни — влево нож, вверх или вправо пистолет, вниз винтовка
    const ap = $('ammo-panel'), wheel = $('wheel'), ids = { knife: 'wk', pistol: 'wp', rifle: 'wr' };
    ap.classList.add('interactive-ui');
    let sx = 0, sy = 0, pk = null;
    const choose = (dx, dy) => Math.hypot(dx, dy) < 22 ? null : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'knife' : 'pistol') : (dy < 0 ? 'pistol' : 'rifle');
    const mark = k => { for (const n in ids) $(ids[n]).classList.toggle('on', n === k); };
    ap.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; pk = null; mark(null); wheel.style.display = 'block'; e.preventDefault(); }, { passive: false });
    ap.addEventListener('touchmove', e => { const t = e.changedTouches[0]; pk = choose(t.clientX - sx, t.clientY - sy); mark(pk); e.preventDefault(); }, { passive: false });
    const done = () => { wheel.style.display = 'none'; if (pk && pk !== curW && !player.dead) equip(pk); pk = null; };
    ap.addEventListener('touchend', done); ap.addEventListener('touchcancel', done);
  }

  // ---------- игрок: движение с коллизиями ----------
  window.updatePlayer = function (dt) {
    shopTick();
    if (player.dead && (respawnIn -= dt) <= 0 && !over) respawnPlayer();
    player.vel.y -= 22 * dt;
    const mv = player.dead ? { x: 0, y: 0 } : moveJoystick;
    const move = new V(mv.x, 0, -mv.y).normalize().applyEuler(new THREE.Euler(0, cameraYaw, 0, 'YXZ'));
    player.pos.x += move.x * player.speed * dt; player.pos.z += move.z * player.speed * dt; player.pos.y += player.vel.y * dt;
    player.currentHeight = THREE.MathUtils.lerp(player.currentHeight, player.targetHeight, 12 * dt);
    resolve(player.pos, 0.4, player.pos.y - player.currentHeight);
    const gy = groundAt(player.pos.x, player.pos.z, player.pos.y - player.currentHeight);
    if (player.pos.y - player.currentHeight <= gy) { player.pos.y = gy + player.currentHeight; player.vel.y = 0; player.onGround = true; }
    else if (Math.abs(player.vel.y) > 0.5) player.onGround = false;
    recoilPitch = THREE.MathUtils.lerp(recoilPitch, 0, 10 * dt);
    recoilYaw = THREE.MathUtils.lerp(recoilYaw, 0, 10 * dt);
    weaponContainer.position.z = THREE.MathUtils.lerp(weaponContainer.position.z, 0, 12 * dt);
    camera.rotation.y = cameraYaw + recoilYaw; camera.rotation.x = cameraPitch + recoilPitch; camera.position.copy(player.pos);
  };

  // ---------- стрельба с разбросом ----------
  window.processShoot = function (now) {
    if (!started || over || player.dead || player.isReloading) return;
    if (now - player.lastShootTime < player.shootInterval) return;
    if (curW === 'knife') { knifeHit(now); return; }
    if (player.ammoInMag <= 0) { reloadAmmo(); return; }
    player.ammoInMag--; player.lastShootTime = now; updateUI();
    recoilPitch += 0.022; recoilYaw += (Math.random() - 0.5) * 0.012; weaponContainer.position.z = 0.05;
    // разброс: стоя — средний, сидя — меньше, бег — больше, прыжок — сильно больше, очередь накапливает
    burst = Math.max(0, burst - (now - lastShot) / 1000 * SPREAD.recover); lastShot = now;
    let s = SPREAD.base + burst;
    if (Math.hypot(moveJoystick.x, moveJoystick.y) > 0.1) s += SPREAD.move;
    if (!player.onGround) s += SPREAD.air;
    if (player.isCrouching) s *= SPREAD.crouch;
    burst = Math.min(burst + SPREAD.perShot, SPREAD.max);
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * s;
    raycaster.setFromCamera(new THREE.Vector2(Math.cos(a) * r / camera.aspect, Math.sin(a) * r), camera);
    const targets = colliders.slice();
    bots.forEach(b => { if (!b.dead) b.mesh.traverse(c => { if (c.userData.hb) { c.userData.bot = b; targets.push(c); } }); });
    const hit = raycaster.intersectObjects(targets)[0];
    if (!hit) return;
    const b = hit.object.userData.bot;
    if (b) { if (b.team !== 'A' && !b.dead) { damageBot(b, hit.object.userData.isHead ? 100 : 35, 'A', player.pos, true, me); hm(b.dead); } }
    else if (hit.face) createBulletHole(hit.point, hit.face.normal.clone().transformDirection(hit.object.matrixWorld));
  };

  // ---------- интерфейс и управление ----------
  function hud() {
    const css = document.createElement('style');
    css.textContent = '#sc{position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:10px;align-items:center;color:#fff;font:800 18px sans-serif;background:rgba(15,23,42,.7);border-radius:10px;padding:4px 12px;pointer-events:none}' +
      '#sc b{padding:2px 10px;border-radius:6px}#msg{position:absolute;top:35%;width:100%;text-align:center;z-index:30;color:#fff;font:900 28px sans-serif;text-shadow:0 2px 6px #000;pointer-events:none}' +
      '#hurt{position:absolute;top:0;left:0;width:100%;height:100%;z-index:15;background:rgba(220,38,38,.45);opacity:0;transition:opacity .4s;pointer-events:none}' +
      '#end{position:absolute;top:0;left:0;width:100%;height:100%;z-index:200;background:rgba(10,10,15,.9);color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif}' +
      '#end button{margin-top:16px;padding:14px 34px;font-size:18px;font-weight:700;background:#22c55e;color:#fff;border:0;border-radius:8px}';
    document.head.appendChild(css);
    const d = document.createElement('div');
    d.innerHTML = '<div id="sc"><b id="sa" style="background:#2563eb">0</b><span id="st">2:00</span><b id="sb" style="background:#d97706">0</b></div><div id="msg"></div><div id="hurt"></div>' +
      '<div id="end" class="interactive-ui"><div id="res" style="font-size:44px;font-weight:900"></div><div id="resd" style="margin-top:8px;font-size:18px"></div><button onclick="location.reload()">ИГРАТЬ СНОВА</button></div>';
    document.body.appendChild(d); tabUI(); uiExtra();
  }
  function initMatch() {
    buildNav(); hud();
    for (let i = 0; i < 5; i++) { if (i < 4) makeBot('A', i); makeBot('B', i); }
    respawnPlayer();
  }

  window.setupControls = function () {
    document.getElementById('start-btn').addEventListener('click', () => { document.getElementById('start-overlay').style.display = 'none'; started = true; openShop(); });
    initMatch(); loadModels(); loadMap();
    // плавающий джойстик: появляется там, куда ткнул в левой нижней части экрана
    const zone = document.getElementById('joystick-zone');
    Object.assign(zone.style, { left: '0', bottom: '0', width: '45%', height: '65%' });
    const joy = nipplejs.create({ zone, mode: 'dynamic', color: 'white', multitouch: true });
    joy.on('move', (e, data) => { if (data.vector) { moveJoystick.x = data.vector.x; moveJoystick.y = data.vector.y; } });
    joy.on('end', () => { moveJoystick.x = 0; moveJoystick.y = 0; });

    let lookId = null, fireId = null, lx = 0, ly = 0;
    const fireBtn = document.getElementById('btn-fire');
    window.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        const r = fireBtn.getBoundingClientRect();
        if (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom) { fireId = t.identifier; isFiring = true; lx = t.clientX; ly = t.clientY; continue; }
        if (t.target.closest('.interactive-ui')) continue;
        if (t.clientX > window.innerWidth * 0.45 && lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: false });
    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) if (t.identifier === lookId || t.identifier === fireId) {
        cameraYaw -= (t.clientX - lx) * 0.0045;
        cameraPitch = Math.max(-1.4, Math.min(1.4, cameraPitch - (t.clientY - ly) * 0.0045));
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
    const end = e => { for (const t of e.changedTouches) { if (t.identifier === lookId) lookId = null; if (t.identifier === fireId) { fireId = null; isFiring = false; } } };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);

    // кнопки реагируют на касание, а не на click: click не приходит, пока другой палец держит джойстик
    const tap = (el, fn) => { el.addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false }); el.addEventListener('click', fn); };
    const crouchBtn = document.getElementById('btn-crouch');
    const setCrouch = on => { player.isCrouching = on; player.targetHeight = on ? 0.9 : 1.6; player.speed = on ? 3.5 : 7; crouchBtn.classList.toggle('btn-active', on); };
    tap(crouchBtn, () => { if (player.onGround && !player.dead) setCrouch(!player.isCrouching); });   // в воздухе присесть нельзя
    tap(document.getElementById('btn-jump'), () => {
      if (!player.onGround || player.dead) return;
      if (player.isCrouching) setCrouch(false);                                                                       // прыжок встаёт из приседа
      player.vel.y = 7.5; player.onGround = false;
    });
    tap(document.getElementById('btn-reload'), () => { if (player.onGround && !player.dead) reloadAmmo(); });   // в прыжке не перезарядиться
  };
})();
