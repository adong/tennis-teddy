/* Teddy & Tommy Tennis: effects. The tennis ball with its round shadow on the ground and a speed trail, comic
   POW bursts on hits, dust puffs on bounces, confetti, the landing-spot ring for little players, and flying emoji
   (treats, Teddy's 🏀). */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit;
  const { makeCanvas, toTexture, radialTexture, dotTexture, emojiTexture, FONT } = Kit.gfx;

  let scene = null;

  // ---------------------------------------------------------------- the ball

  function ballTexture() {
    const [c, g] = makeCanvas(256, 128);
    g.fillStyle = '#d9f23a';
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(120,150,0,0.12)';
      g.fillRect(Math.random() * 256, Math.random() * 128, 2, 2);
    }
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 64 + Math.sin((x / 256) * Math.PI * 4) * 30;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    return toTexture(c);
  }

  function makeBall(R) {
    // drawn a bit bigger than it bounces, to be easy to see
    const ball = new T.Mesh(new T.SphereGeometry(R * 1.3, 20, 14), new T.MeshStandardMaterial({ map: ballTexture(), roughness: 0.75, emissive: '#3a4400', emissiveIntensity: 0.25 }));
    ball.castShadow = false;
    scene.add(ball);
    // the round shadow right under it: smaller and fainter the higher it is, so you can see where it'll come down
    const shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
      map: radialTexture(64, [[0, 'rgba(10,20,40,0.85)'], [0.55, 'rgba(10,20,40,0.55)'], [1, 'rgba(10,20,40,0)']]),
      transparent: true, depthWrite: false,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    scene.add(shadow);
    const trail = [];
    const tmat = () => new T.SpriteMaterial({ map: dotTexture(), color: '#f4ff8a', transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < 8; i++) {
      const s = new T.Sprite(tmat());
      s.scale.setScalar(R * 2);
      scene.add(s);
      trail.push(s);
    }
    const hist = [];
    // a ring on the ground where the ball will come down (the little-kid helper)
    const ring = new T.Mesh(new T.RingGeometry(0.32, 0.46, 32), new T.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.0, depthWrite: false, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    scene.add(ring);
    return {
      ball, shadow, trail, ring,
      // b: the engine's ball, fast: draw the trail, dt: frame time
      update(b, dt, fast, visible) {
        ball.visible = shadow.visible = visible;
        ball.position.set(b.x, b.y, b.z);
        ball.rotation.z -= (b.vx || 0) * dt * 2.5 * (b.spin || 1);
        ball.rotation.x += 2 * dt;
        const h = Math.max(0, b.y - R);
        const s = 0.55 * (1 + h * 0.12);
        shadow.scale.set(s, s, 1);
        shadow.position.set(b.x, 0.012, b.z);
        shadow.material.opacity = Math.max(0.18, 0.9 / (1 + h * 0.35));
        hist.unshift([b.x, b.y, b.z]);
        if (hist.length > 16) hist.pop();
        trail.forEach((sp, i) => {
          const p = hist[(i + 1) * 2];
          if (!p || !fast || !visible) {
            sp.visible = false;
            return;
          }
          sp.visible = true;
          sp.position.set(p[0], p[1], p[2]);
          sp.material.opacity = 0.45 * (1 - i / trail.length);
          sp.scale.setScalar(R * 2 * (1 - i / (trail.length * 1.5)));
        });
      },
      clearTrail() { hist.length = 0; },
    };
  }

  // ---------------------------------------------------------------- comic bursts

  const burstCache = {};
  function burstTexture(word, fill) {
    const key = word + fill;
    if (burstCache[key]) return burstCache[key];
    const [c, g] = makeCanvas(256, 256);
    g.translate(128, 128);
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const r = i % 2 ? 70 : 118 + (i % 4 === 0 ? 8 : 0);
      const a = (i / 24) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = '#14121f';
    g.stroke();
    g.rotate(-0.12);
    g.font = `${word.length > 5 ? 40 : 52}px ${FONT}, ${Kit.gfx.EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#14121f';
    g.strokeText(word, 0, 4);
    g.fillStyle = '#ffffff';
    g.fillText(word, 0, 4);
    return (burstCache[key] = toTexture(c));
  }

  const bursts = [];
  function burst(x, y, z, word, fill = '#ffd400', size = 1.4) {
    if (Kit.lang) word = Kit.lang.t(word); // drawn on a canvas, so it's translated here (中文)
    let b = bursts.find((s) => !s.visible);
    if (!b) {
      b = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      b.renderOrder = 20;
      scene.add(b);
      bursts.push(b);
    }
    b.material.map = burstTexture(word, fill);
    b.material.needsUpdate = true;
    b.material.opacity = 1;
    b.position.set(x, y, z + 0.3);
    b.userData = { t: 0, size, rot: (Math.random() - 0.5) * 0.4 };
    b.material.rotation = b.userData.rot;
    b.visible = true;
  }

  // ---------------------------------------------------------------- particles: dust, confetti, sparkles

  const parts = [];
  function particle() {
    let p = parts.find((s) => !s.visible);
    if (!p) {
      p = new T.Sprite(new T.SpriteMaterial({ map: dotTexture(), transparent: true, depthWrite: false }));
      p.renderOrder = 5;
      scene.add(p);
      parts.push(p);
    }
    p.visible = true;
    return p;
  }

  // o: { color, n, speed, up, life, size, gravity, spread }
  function emit(x, y, z, o = {}) {
    const n = o.n || 10;
    for (let i = 0; i < n; i++) {
      const p = particle();
      const cols = Array.isArray(o.color) ? o.color : [o.color || '#ffffff'];
      p.material.color.set(cols[i % cols.length]);
      p.material.opacity = o.alpha || 0.9;
      const sp = o.speed || 2;
      const a = Math.random() * Math.PI * 2;
      p.position.set(x + (Math.random() - 0.5) * (o.spread || 0.2), y, z + (Math.random() - 0.5) * (o.spread || 0.2));
      p.userData = {
        vx: Math.cos(a) * sp * Math.random(), vy: (o.up || 1) * (0.5 + Math.random()), vz: Math.sin(a) * sp * Math.random() * 0.6,
        t: 0, life: (o.life || 0.6) * (0.7 + Math.random() * 0.6), size: (o.size || 0.25) * (0.7 + Math.random() * 0.6), g: o.gravity != null ? o.gravity : 3, a0: p.material.opacity,
      };
      p.scale.setScalar(p.userData.size);
    }
  }

  const dust = (x, z, n = 8) => emit(x, 0.08, z, { color: '#e6eef5', n, speed: 1.6, up: 0.9, life: 0.45, size: 0.3, gravity: 1, alpha: 0.75 });
  const confetti = (x, y, z) => emit(x, y, z, { color: ['#ff4b5c', '#ffd400', '#18d4ff', '#7dff5a', '#ff9f1c', '#b45cff'], n: 40, speed: 4, up: 5, life: 1.4, size: 0.18, gravity: 6, spread: 1.2 });
  const sparkle = (x, y, z, color = '#fff6a0') => emit(x, y, z, { color, n: 14, speed: 3, up: 2.5, life: 0.5, size: 0.22, gravity: 2 });

  // ---------------------------------------------------------------- flying emoji (treats, the basketball)

  const flyers = [];
  // An emoji sprite that flies from `from` to `to()` (a function, so it can follow a moving hand) in an arc, then
  // calls done(sprite). The caller keeps or hides it.
  function fly(emoji, from, to, o = {}) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false }));
    s.scale.setScalar(o.size || 0.6);
    s.renderOrder = 12;
    s.position.copy(from);
    scene.add(s);
    flyers.push({ s, from: from.clone(), to, t: 0, dur: o.dur || 0.55, arc: o.arc || 1.2, spin: o.spin || 0, done: o.done });
    return s;
  }

  const tmp = new T.Vector3();
  function update(dt) {
    for (const b of bursts) {
      if (!b.visible) continue;
      const u = (b.userData.t += dt) / 0.55;
      const pop = u < 0.15 ? u / 0.15 * 1.15 : u < 0.3 ? 1.15 - (u - 0.15) / 0.15 * 0.15 : 1;
      b.scale.setScalar(b.userData.size * pop);
      b.material.opacity = u > 0.7 ? Math.max(0, 1 - (u - 0.7) / 0.3) : 1;
      if (u >= 1) b.visible = false;
    }
    for (const p of parts) {
      if (!p.visible) continue;
      const d = p.userData;
      d.t += dt;
      d.vy -= d.g * dt;
      p.position.x += d.vx * dt;
      p.position.y += d.vy * dt;
      p.position.z += d.vz * dt;
      if (p.position.y < 0.02) {
        p.position.y = 0.02;
        d.vy = 0;
        d.vx *= 0.9;
      }
      p.material.opacity = d.a0 * Math.max(0, 1 - d.t / d.life);
      if (d.t >= d.life) p.visible = false;
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt / f.dur;
      const k = Math.min(1, f.t);
      f.to(tmp);
      f.s.position.lerpVectors(f.from, tmp, k);
      f.s.position.y += Math.sin(k * Math.PI) * f.arc;
      f.s.material.rotation += f.spin * dt;
      if (k >= 1) {
        flyers.splice(i, 1);
        if (f.done) f.done(f.s);
        else scene.remove(f.s);
      }
    }
  }

  function clear() {
    for (const b of bursts) b.visible = false;
    for (const p of parts) p.visible = false;
    for (const f of flyers) scene.remove(f.s);
    flyers.length = 0;
  }

  window.TTFx = {
    init(s) { scene = s; },
    makeBall, burst, emit, dust, confetti, sparkle, fly, update, clear,
  };
})();
