/* Teddy & Tommy Tennis: tennis poses and the racket, on top of the kit's people.
   The racket goes in the hand nearer the camera: the right hand for side 0 (facing +x), the left for side 1.
   TTPoses.drive() eases every channel of a kit person (legs, arms, lean, twist, head, crouch); the named poses below
   give the targets. The kit's own run / jump / boxing / peace / jumpshot poses are used where they fit. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit;
  const { makeCanvas, toTexture, std, mesh } = Kit.gfx;
  const PI = Math.PI;

  // ---------------------------------------------------------------- the racket

  let strings = null;
  function stringTexture() {
    if (strings) return strings;
    const [c, g] = makeCanvas(128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    for (let i = 8; i < 128; i += 15) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
    }
    strings = toTexture(c);
    return strings;
  }

  // A racket about 0.75 m long. The group's origin is the wrist: the handle starts there and the head points along
  // -y. Its `head` child marks the middle of the strings. Tilt it with rotation.x (the wrist).
  function racket(color) {
    const g = new T.Group();
    const frame = std(color, { roughness: 0.45 });
    const grip = std('#f4f4f4', { roughness: 0.9 });
    mesh(new T.BoxGeometry(0.07, 0.24, 0.07), grip, 0, -0.08, 0, g);
    mesh(new T.BoxGeometry(0.05, 0.14, 0.05), frame, 0, -0.26, 0, g);
    const throatL = mesh(new T.BoxGeometry(0.035, 0.18, 0.035), frame, -0.045, -0.34, 0, g);
    throatL.rotation.z = -0.45;
    const throatR = mesh(new T.BoxGeometry(0.035, 0.18, 0.035), frame, 0.045, -0.34, 0, g);
    throatR.rotation.z = 0.45;
    const ring = mesh(new T.TorusGeometry(0.19, 0.035, 8, 24), frame, 0, -0.6, 0, g);
    ring.scale.set(0.85, 1.12, 1);
    const net = new T.Mesh(new T.CircleGeometry(0.18, 20), new T.MeshBasicMaterial({ map: stringTexture(), transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
    net.position.set(0, -0.6, 0);
    net.scale.set(0.85, 1.12, 1);
    g.add(net);
    const head = new T.Object3D();
    head.position.set(0, -0.6, 0);
    g.add(head);
    g.head = head;
    return g;
  }

  // Give a kit person a racket. side 0 holds it in the right hand, side 1 in the left (the camera side).
  function arm(p, side, color) {
    const r = racket(color);
    p.racketArm = side === 0 ? p.armR : p.armL;
    p.freeArm = side === 0 ? p.armL : p.armR;
    p.rSign = side === 0 ? 1 : -1; // sign that swings the racket arm outward (rotation.z)
    r.position.y = -0.68; // in the hand
    r.rotation.x = 1;
    p.racketArm.add(r);
    p.racket = r;
    return r;
  }

  // ---------------------------------------------------------------- driving the rig

  const ease = (o, prop, v, k) => { o[prop] += (v - o[prop]) * k; };

  // targets: rx / fx (racket / free arm forward swing), rz / fz (outward), wr (the wrist: racket tilt from the arm), lL / lR (legs forward), sp (leg spread),
  // lean, twist, bob, head, crouch (drops the rig), tilt (sideways lean of the whole rig).
  function drive(p, t, k) {
    const s = p.rSign || 1;
    const ra = p.racketArm || p.armR, fa = p.freeArm || p.armL;
    ease(ra.rotation, 'x', t.rx || 0, k);
    if (p.racket) ease(p.racket.rotation, 'x', t.wr !== undefined ? t.wr : 1, k);
    ease(ra.rotation, 'z', s * (t.rz || 0), k);
    ease(fa.rotation, 'x', t.fx || 0, k);
    ease(fa.rotation, 'z', -s * (t.fz || 0), k);
    if (t.lL !== undefined) ease(p.legL.rotation, 'x', t.lL, k);
    if (t.lR !== undefined) ease(p.legR.rotation, 'x', t.lR, k);
    ease(p.legL.rotation, 'z', -(t.sp || 0), k);
    ease(p.legR.rotation, 'z', t.sp || 0, k);
    ease(p.hips.rotation, 'x', t.lean !== undefined ? t.lean : -0.1, k);
    ease(p.hips.rotation, 'y', (t.twist || 0) * s, k);
    ease(p.head.rotation, 'x', t.head || 0, k);
    ease(p.head.rotation, 'y', -(t.twist || 0) * s * 0.6, k);
    ease(p.rig.position, 'y', 0.55 - (t.crouch || 0), k);
    ease(p.rig.rotation, 'z', t.tilt || 0, k);
    if (t.bob !== undefined) p.hips.position.y = p.hipY + t.bob;
  }

  // The legs from the kit's run cycle, the arms our own.
  function legsRun(p, ph, k) {
    const sn = Math.sin(ph);
    ease(p.legL.rotation, 'x', sn * 0.9, k);
    ease(p.legR.rotation, 'x', -sn * 0.9, k);
    return Math.abs(Math.cos(ph)) * 0.08;
  }

  const smooth = (a, b, u) => a + (b - a) * (u * u * (3 - 2 * u));
  // a piecewise curve through [u, value] keys
  function curve(keys, u) {
    if (u <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) {
        const [u0, v0] = keys[i - 1], [u1, v1] = keys[i];
        return smooth(v0, v1, (u - u0) / (u1 - u0));
      }
    }
    return keys[keys.length - 1][1];
  }

  // Swing shapes over u = 0..1 of the whole swing. The racket sweeps from behind to in front through the live part.
  const SWINGS = {
    // forehand: coil back, then a big sweep forward and up
    fore: {
      wr: [[0, 1.0], [0.1, 0.7], [0.3, 1.1], [0.62, 0.8], [1, 1.0]],
      rx: [[0, 0.4], [0.1, -1.25], [0.3, 0.2], [0.62, 1.9], [1, 0.8]],
      rz: [[0, 0.5], [0.1, 0.95], [0.62, 0.7], [1, 0.4]],
      twist: [[0, 0], [0.1, -0.7], [0.62, 0.6], [1, 0.1]],
      crouch: 0.08,
    },
    low: {
      wr: [[0, 0.8], [0.1, 0.4], [0.3, 0.6], [0.62, 0.9], [1, 1.0]],
      rx: [[0, 0.3], [0.1, -1.1], [0.3, -0.2], [0.62, 1.5], [1, 0.6]],
      rz: [[0, 0.4], [0.1, 0.5], [0.62, 0.45], [1, 0.3]],
      twist: [[0, 0], [0.1, -0.6], [0.62, 0.5], [1, 0.1]],
      crouch: 0.22,
    },
    // overhead (high balls, serves and smashes): from behind the head, down and forward
    over: {
      wr: [[0, 0.6], [0.1, 1.4], [0.3, 0.4], [0.62, 0.2], [1, 0.6]],
      rx: [[0, 2.4], [0.1, 3.5], [0.3, 2.9], [0.62, 1.0], [1, 0.7]],
      rz: [[0, 0.3], [0.62, 0.3], [1, 0.3]],
      twist: [[0, 0], [0.1, -0.5], [0.62, 0.5], [1, 0.1]],
      crouch: 0,
    },
  };
  SWINGS.smash = SWINGS.over;
  SWINGS.serve = SWINGS.over;

  // One frame of a player. st: { mode, u (swing 0..1), kind, ph (run phase), air, vx, f, id, t (pose clock) }.
  // modes: ready, run, swing, toss (serve toss), air, celebrate (with st.cel), sad, wave, give.
  function pose(p, st, k) {
    const ph = st.ph || 0;
    let bob = 0;
    if (st.mode === 'celebrate' || st.mode === 'wave' || st.mode === 'hello') {
      // signature moves come straight from the kit, with the legs kept still
      const cel = st.cel || 'wave';
      Kit.people.pose(p, cel === 'boxing' ? st.t * 6 : st.t * 5, cel, k);
      p.legL.rotation.x *= 0.3;
      p.legR.rotation.x *= 0.3;
      if (p.racket) p.racket.visible = cel !== 'peace' && cel !== 'boxing' && cel !== 'jumpshot';
      return;
    }
    if (p.racket) p.racket.visible = true;
    if (p.fingers) for (const f of p.fingers) f.visible = false;
    // ready: knees bent, racket held up in front
    const t = { rx: 0.5, wr: 1.25, rz: 0.4, fx: 0.55, fz: 0.25, sp: 0.12, lean: -0.18, crouch: 0.07, lL: 0.25, lR: -0.15, bob: 0 };
    if (st.mode === 'run') {
      bob = legsRun(p, ph, k);
      t.lL = t.lR = undefined;
      t.fx = Math.sin(ph) * 0.7;
      t.lean = -0.22;
      t.crouch = 0.02;
      t.sp = 0.03;
      t.bob = bob;
    } else if (st.mode === 'air') {
      Object.assign(t, { lL: 0.7, lR: -0.3, sp: 0.1, fx: 2.2, fz: 0.4, rx: 2.4, rz: 0.4, crouch: 0, lean: -0.05 });
    } else if (st.mode === 'toss') {
      // serve: tossing hand up, racket cocked behind
      Object.assign(t, { fx: 2.9, fz: 0.15, rx: 2.6, wr: 1.6, rz: 0.55, lean: 0.05, crouch: 0.04, lL: 0.15, lR: -0.2, head: -0.4 });
    } else if (st.mode === 'sad') {
      Object.assign(t, { rx: 0.15, rz: 0.15, fx: 0.1, fz: 0.1, lean: -0.32, head: 0.45, crouch: 0.05, lL: 0, lR: 0, sp: 0.04 });
    } else if (st.mode === 'give') {
      Object.assign(t, { fx: 1.55, fz: 0.1, rx: 0.4, lean: -0.1 });
    } else if (st.mode === 'dive') {
      Object.assign(t, { rx: 1.6, rz: 0.9, fx: 1.4, fz: 0.6, lL: -0.9, lR: -1.2, lean: -0.9, crouch: 0.35, tilt: 0 });
    }
    if (st.mode === 'swing') {
      const sw = SWINGS[st.kind] || SWINGS.fore;
      const u = st.u;
      t.rx = curve(sw.rx, u);
      t.wr = curve(sw.wr, u);
      t.rz = curve(sw.rz, u);
      t.twist = curve(sw.twist, u);
      t.crouch = sw.crouch;
      t.fx = st.kind === 'over' || st.kind === 'smash' || st.kind === 'serve' ? curve([[0, 2.4], [0.3, 2.6], [0.62, 0.6]], u) : 0.9;
      if (st.air) Object.assign(t, { lL: 0.7, lR: -0.3, crouch: 0 });
      // Teddy's smash starts from his basketball jump shot: both hands up overhead
      if (st.kind === 'smash' && st.id === 'teddy' && u < 0.32) Object.assign(t, { rx: 2.6, rz: 0.2, fx: 2.45, fz: 0.2, twist: 0, head: -0.3 });
      if (st.run) {
        bob = legsRun(p, ph, k);
        t.lL = t.lR = undefined;
        t.bob = bob;
      }
    }
    drive(p, t, k);
  }

  window.TTPoses = { racket, arm, drive, pose };
})();
