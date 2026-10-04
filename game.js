/* game.js — карта, столкновения, команды 5×5, боты с ИИ, разброс, плавающий джойстик.
   Подключать ПОСЛЕ hands.js: <script src="game.js"></script> */
(function () {
  const V = THREE.Vector3, MATCH = 120;
  const solids = [], walls = [], score = { A: 0, B: 0 };
  const squads = { A: [], B: [] }, intel = { A: null, B: null };
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
  function resolve(p, r, feet) {
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
    const d = new V().subVectors(b, a), dist = d.length();
    ray.set(a, d.normalize()); ray.far = dist;
    return ray.intersectObjects(walls).length === 0;
  }

  // ---------- сетка проходимости и поиск пути (A*) ----------
  const N = 40, CS = 2, blocked = new Uint8Array(N * N);
  const cellOf = v => Math.min(N - 1, Math.max(0, Math.floor((v + 40) / CS)));
  function buildNav() {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = -40 + i * CS + 1, z = -40 + j * CS + 1;
      blocked[i * N + j] = solids.some(s => x > s.x0 - 1.1 && x < s.x1 + 1.1 && z > s.z0 - 1.1 && z < s.z1 + 1.1) ? 1 : 0;
    }
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
    for (let k = g; k !== -1 && k !== s; k = prev[k]) path.push(new V(-40 + (k / N | 0) * CS + 1, 0, -40 + (k % N) * CS + 1));
    return path.reverse();
  }

  // ---------- боты ----------
  const COL = { A: 0x2563eb, B: 0xd97706 };
  const SPAWN = { A: [-8, -4, 0, 4, 8].map(x => [x, 34]), B: [-8, -4, 0, 4, 8].map(x => [x, -34]) };
  const LA = [[[-30, 24], [-34, 0], [-30, -24]], [[0, 16], [0, -16]], [[30, 24], [34, 0], [30, -24]]];   // маршруты по линиям
  const LANES = { A: LA.map(l => l.map(p => new V(p[0], 0, p[1]))), B: LA.map(l => l.map(p => new V(-p[0], 0, -p[1]))) };

  function makeBot(team, idx) {
    const g = new THREE.Group(), shirt = COL[team];
    const part = (w, h, d, c, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c }));
      m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    part(0.5, 0.6, 0.3, shirt, 0, 1.05, 0);
    part(0.35, 0.35, 0.35, 0xfca5a5, 0, 1.55, 0).userData.isHead = true;
    part(0.15, 0.5, 0.15, shirt, -0.35, 1.1, 0.05);
    part(0.15, 0.15, 0.5, shirt, 0.25, 1.2, 0.25);        // рука с автоматом
    part(0.08, 0.1, 0.6, 0x111111, 0.25, 1.25, 0.5);       // автомат
    const leg = x => {
      const p = new THREE.Group(); p.position.set(x, 0.75, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x334155 }));
      m.position.y = -0.3; p.add(m); g.add(p); return p;
    };
    const lane = idx % 3;
    if (!squads[team][lane]) squads[team][lane] = { bots: [], turn: 0, wp: 0, arr: 0 };
    const b = { mesh: g, team, idx, lane, sq: squads[team][lane], hp: 100, dead: false, respawn: 0, lL: leg(0.15), rL: leg(-0.15),
      path: [], goal: null, nextPath: 0, think: Math.random() * 0.2, react: 0, last: 0, target: null, anim: 0, walk: false, chk: -1 };
    b.sq.bots.push(b);
    scene.add(g); bots.push(b); spawnAt(b);
  }
  function spawnAt(b) {
    const s = SPAWN[b.team][Math.floor(Math.random() * 5)];
    b.mesh.position.set(s[0], 0, s[1]); b.mesh.rotation.y = b.team === 'A' ? Math.PI : 0;
    b.hp = 100; b.dead = false; b.mesh.visible = true; b.path = []; b.goal = null; b.target = null;
  }
  const eye = b => new V(b.mesh.position.x, 1.5, b.mesh.position.z);
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
    resolve(pos, 0.4, 0);
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
  function damageBot(o, dmg, team, from, byPlayer) {
    if (o.dead) return;
    o.hp -= dmg;
    intel[o.team] = { pos: new V(from.x, 0, from.z), t: T };
    if (o.hp <= 0) { o.dead = true; o.mesh.visible = false; o.respawn = 3; score[team]++; if (byPlayer) { player.score++; updateUI(); } }
  }
  function hurt(d) {
    if (player.dead || over) return;
    player.hp = Math.max(0, player.hp - d); updateUI();
    const h = document.getElementById('hurt'); h.style.opacity = 1; setTimeout(() => { h.style.opacity = 0; }, 80);
    if (player.hp <= 0) { player.dead = true; respawnIn = 3; score.B++; document.getElementById('msg').textContent = 'ВЫ УБИТЫ'; }
  }
  function respawnPlayer() {
    const s = SPAWN.A[Math.floor(Math.random() * 5)];
    player.pos.set(s[0], 1.6, s[1]); player.vel.set(0, 0, 0); player.hp = 100; player.dead = false;
    player.ammoInMag = player.maxMag; player.reserveAmmo = 90; player.isReloading = false; cameraYaw = 0; cameraPitch = 0;
    document.getElementById('msg').textContent = ''; updateUI();
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
        if (b.react <= 0 && T - b.last > 0.16) {
          b.last = T;
          if (Math.random() < Math.max(0.08, 0.55 - d * 0.012)) e.ply ? hurt(9) : damageBot(e.bot, 12, b.team, pos, false);
        }
        if (d > 22) follow(b, e.pos, dt, 2.2);
      } else {
        const it = intel[b.team];
        if (it && T - it.t < 10 && b.chk !== it.t && Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z) < 40) {
          follow(b, it.pos, dt, 3.8);                                  // проверить позицию вместе с командой
          if (Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z) < 3.5) b.chk = it.t;
        } else {
          const sq = b.sq, wps = LANES[b.team][b.lane], alive = sq.bots.filter(x => !x.dead).length;
          while (sq.bots[sq.turn].dead) sq.turn = (sq.turn + 1) % sq.bots.length;
          if (sq.bots[sq.turn] === b) {                                // идёт один, остальные держат углы
            const g = wps[sq.wp % wps.length];
            follow(b, g, dt, 3.4);
            if (Math.hypot(g.x - pos.x, g.z - pos.z) < 3.5) {
              sq.arr++; sq.turn = (sq.turn + 1) % sq.bots.length;
              if (sq.arr >= alive) { sq.arr = 0; sq.wp++; }
            }
          } else turnTo(b, (b.team === 'A' ? Math.PI : 0) + Math.sin(T * 0.9 + b.idx * 2) * 1.1, dt, 3);
        }
      }
      b.anim += (b.walk ? dt * 8 : 0);
      b.lL.rotation.x = b.walk ? Math.sin(b.anim) * 0.6 : 0; b.rL.rotation.x = -b.lL.rotation.x;
    });
    const t = Math.max(0, Math.ceil(timeLeft));
    document.getElementById('sa').textContent = score.A; document.getElementById('sb').textContent = score.B;
    document.getElementById('st').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };
  function endMatch() {
    over = true;
    document.getElementById('res').textContent = score.A > score.B ? 'ПОБЕДА' : score.A < score.B ? 'ПОРАЖЕНИЕ' : 'НИЧЬЯ';
    document.getElementById('resd').textContent = 'Счёт ' + score.A + ' : ' + score.B + ' · Ваши убийства: ' + player.score;
    document.getElementById('end').style.display = 'flex';
  }

  window.renderMinimap = function () {
    const ctx = document.getElementById('minimap-canvas').getContext('2d'), c = 55, k = 1.3;
    ctx.clearRect(0, 0, 110, 110);
    bots.forEach(b => {
      if (b.dead) return;
      ctx.fillStyle = b.team === 'A' ? '#3b82f6' : '#ef4444'; ctx.beginPath();
      ctx.arc(c + (b.mesh.position.x - player.pos.x) * k, c + (b.mesh.position.z - player.pos.z) * k, 3, 0, 6.3); ctx.fill();
    });
    ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(c, c, 4, 0, 6.3); ctx.fill();
  };

  // ---------- игрок: движение с коллизиями ----------
  window.updatePlayer = function (dt) {
    if (player.dead && (respawnIn -= dt) <= 0 && !over) respawnPlayer();
    player.vel.y -= 22 * dt;
    const mv = player.dead ? { x: 0, y: 0 } : moveJoystick;
    const move = new V(mv.x, 0, -mv.y).normalize().applyEuler(new THREE.Euler(0, cameraYaw, 0, 'YXZ'));
    player.pos.x += move.x * player.speed * dt; player.pos.z += move.z * player.speed * dt; player.pos.y += player.vel.y * dt;
    player.currentHeight = THREE.MathUtils.lerp(player.currentHeight, player.targetHeight, 12 * dt);
    if (player.pos.y <= player.currentHeight) { player.pos.y = player.currentHeight; player.vel.y = 0; player.onGround = true; }
    resolve(player.pos, 0.4, player.pos.y - player.currentHeight);
    recoilPitch = THREE.MathUtils.lerp(recoilPitch, 0, 10 * dt);
    recoilYaw = THREE.MathUtils.lerp(recoilYaw, 0, 10 * dt);
    weaponContainer.position.z = THREE.MathUtils.lerp(weaponContainer.position.z, 0, 12 * dt);
    camera.rotation.y = cameraYaw + recoilYaw; camera.rotation.x = cameraPitch + recoilPitch; camera.position.copy(player.pos);
  };

  // ---------- стрельба с разбросом ----------
  window.processShoot = function (now) {
    if (!started || over || player.dead || player.isReloading) return;
    if (now - player.lastShootTime < player.shootInterval) return;
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
    bots.forEach(b => { if (!b.dead) b.mesh.traverse(c => { if (c.isMesh) { c.userData.bot = b; targets.push(c); } }); });
    const hit = raycaster.intersectObjects(targets)[0];
    if (!hit) return;
    const b = hit.object.userData.bot;
    if (b) { if (b.team !== 'A') damageBot(b, hit.object.userData.isHead ? 100 : 35, 'A', player.pos, true); }
    else if (hit.face) createBulletHole(hit.point, hit.face.normal);
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
    document.body.appendChild(d);
  }
  function initMatch() {
    buildNav(); hud();
    for (let i = 0; i < 5; i++) { if (i < 4) makeBot('A', i); makeBot('B', i); }
    respawnPlayer();
  }

  window.setupControls = function () {
    document.getElementById('start-btn').addEventListener('click', () => { document.getElementById('start-overlay').style.display = 'none'; started = true; });
    initMatch();
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

    const crouchBtn = document.getElementById('btn-crouch');
    const setCrouch = on => { player.isCrouching = on; player.targetHeight = on ? 0.9 : 1.6; player.speed = on ? 3.5 : 7; crouchBtn.classList.toggle('btn-active', on); };
    crouchBtn.addEventListener('click', () => { if (player.onGround && !player.dead) setCrouch(!player.isCrouching); });   // в воздухе присесть нельзя
    document.getElementById('btn-jump').addEventListener('click', () => {
      if (!player.onGround || player.dead) return;
      if (player.isCrouching) setCrouch(false);                                                                       // прыжок встаёт из приседа
      player.vel.y = 7.5; player.onGround = false;
    });
    document.getElementById('btn-reload').addEventListener('click', () => { if (player.onGround && !player.dead) reloadAmmo(); });   // в прыжке не перезарядиться
  };
})();
