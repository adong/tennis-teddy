/* Teddy & Tommy Tennis: the rules engine. There's no Three.js and no DOM in here. A match is plain state stepped
   at a fixed 60 frames a second, so the same code runs the browser game and the headless soak test
   (node tools/soak.js, or game.soak() in the console).

   The court, seen from the side: the net is at x = 0. Side 0 plays on the left (x < 0) and faces +x, side 1 plays
   on the right and faces -x. y is up, in metres. Everything happens in that x-y plane; z is only for looks.

   A swing sweeps the racket from behind you (start of the swing) to out in front (end). Where it meets the ball
   picks the shot: out in front (you swung early) is a LOB, or a CROSS if you're also running at the net; by your
   body is a DRIVE; behind you (you swung late) is a DROP shot. In the air with the ball up high, it's a SMASH.
   The shot solver then aims the ball so it clears the net and lands in the other court.

   Kid rules: first to 7 points, win by 2; one set or best of 3. Serves take turns every point and always go in.
   The ball may bounce once on your side (or be volleyed). Points end on a second bounce, OUT (a first bounce past
   the baseline) or a ball that doesn't get over the net.

   The companion (the other brother) joins either side for about 10 s: he plays the half of the court his player
   isn't in, and the first ball that gets past his side in a visit is saved ("TOMMY SAVED IT!"). */
(function (root) {
  'use strict';
  const DT = 1 / 60;
  const K = {
    HALF: 6.2, // net to baseline
    WALL: 8.6, // how far back the players can run
    NET_H: 1.0,
    NET_GAP: 0.55, // closest a player's feet get to the net
    LINE: 0.22, // a first bounce this far past the baseline still counts as in (kid rules)
    R: 0.15, // ball radius (big, so it's easy to see)
    G: 11.5, // gravity on the ball
    E: 0.72, F: 0.8, // bounce: vertical restitution, horizontal speed kept
    RUN: 6.2, ACCEL: 55, JUMP_V: 7.4, PG: 22,
    // swing frames: the racket is live from SW_A0 to SW_A1 (SW_A1_EASY with the little-kid assist), done at SW_LEN
    SW_A0: 3, SW_A1: 17, SW_A1_EASY: 20, SW_LEN: 26,
    // where the racket head is along the sweep (metres in front of you), and how close the ball has to be to it
    REL0: -0.75, REL1: 1.65, BAND: 0.7, BAND_EASY: 0.95, REACH: 2.45,
    TO_WIN: 7, BY: 2,
    SERVE_WALK: 40, // frames the players walk back to their spots before a serve
    AUTO_SERVE: 42, // frames before an auto-serve
    POINT_LEN: 125, SET_LEN: 160,
    // the companion's visit, in seconds
    BUD_HELLO: 1.0, BUD_TREAT: 2.0, BUD_BYE: 9.2, BUD_OUT: 10.4, BUD_HELP0: 0.7,
  };
  // How each shot flies: landing distance past the net [min, max], preferred flight time (s), net clearance (m),
  // and how the first bounce behaves (E bounce, F keep): drops have backspin and die, smashes skid on.
  const SHOTS = {
    drive: { d: [3.6, 5.4], T: 0.95, clear: 0.3, E: 0.7, F: 0.8 },
    cross: { d: [4.4, 5.6], T: 0.8, clear: 0.22, E: 0.68, F: 0.84 },
    lob: { d: [4.4, 5.8], T: 1.75, clear: 1.3, E: 0.72, F: 0.74 },
    drop: { d: [0.8, 1.8], T: 1.05, clear: 0.25, E: 0.5, F: 0.26 },
    smash: { d: [2.6, 5.0], T: 0.5, clear: 0.12, E: 0.74, F: 0.86 },
    serve: { d: [2.8, 4.6], T: 0.95, clear: 0.3, E: 0.72, F: 0.78 },
    power: { d: [3.6, 5.2], T: 0.72, clear: 0.2, E: 0.72, F: 0.84 },
    save: { d: [3.4, 5.2], T: 1.6, clear: 1.0, E: 0.72, F: 0.72 },
  };
  const EV_NET = 1, EV_CROSS = 2, EV_BOUNCE = 4;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
  const sideOf = (x) => (x < 0 ? 0 : 1);

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const blankInput = () => ({ left: false, right: false, jump: false, swing: false, call: false, aim: null });

  // ---------------------------------------------------------------- ball physics (pure, shared with the CPU's predictor)

  function newBall() {
    return {
      x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, spin: 0,
      held: -1, // the side holding it for a serve
      lastHitter: -1, by: 'p', shot: '', bounces: 0, nb: 0, netted: false, rolling: false, bE: K.E, bF: K.F,
    };
  }

  function copyBall(b) {
    return { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, netted: b.netted, rolling: b.rolling, nb: b.nb, bE: b.bE, bF: b.bF };
  }

  // One step of flight: gravity, the net and the ground. Returns EV_* bits.
  function ballStep(b, dt) {
    if (b.rolling) {
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.vx *= 0.97;
      return 0;
    }
    const px = b.x, py = b.y;
    b.vy -= K.G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    let ev = 0;
    if (!b.netted && (px < 0) !== (b.x < 0)) {
      const k = px / (px - b.x);
      const yc = py + (b.y - py) * k;
      if (yc < K.NET_H + K.R * 0.4) {
        // into the net: it drops back on the side it came from
        b.netted = true;
        b.x = px < 0 ? -K.R - 0.02 : K.R + 0.02;
        b.vx = -b.vx * 0.15;
        b.vy = Math.min(b.vy, 0.5) * 0.3;
        b.vz *= 0.3;
        ev |= EV_NET;
      } else ev |= EV_CROSS;
    }
    if (b.netted && Math.abs(b.x) < K.R) b.x = (b.x < 0 ? -1 : 1) * K.R;
    if (b.y <= K.R && b.vy < 0) {
      b.y = K.R;
      const e = b.nb === 0 ? b.bE : K.E, f = b.nb === 0 ? b.bF : K.F;
      b.nb++;
      b.vx *= f;
      b.vz *= 0.8;
      if (-b.vy * e < 1.0) {
        b.vy = 0;
        b.rolling = true;
      } else b.vy = -b.vy * e;
      ev |= EV_BOUNCE;
    }
    return ev;
  }

  // Aim a shot from where the ball is now, for a hitter facing f (+1 hits toward +x). `aimX` is an optional landing
  // spot (the CPU uses it). err: 'net' (it won't clear) or 'long' (it lands past the baseline).
  function launch(M, f, type, aimX, err) {
    const b = M.ball, s = SHOTS[type];
    let d = aimX != null ? clamp(Math.abs(aimX), s.d[0], s.d[1] + 0.3) : s.d[0] + (s.d[1] - s.d[0]) * M.rand();
    let clear = s.clear;
    if (err === 'long') d = K.HALF + K.LINE + 0.4 + M.rand() * 0.9;
    const xt = f * d, bx = b.x, by = b.y;
    const alpha = clamp(-bx / (xt - bx), 0.03, 0.97);
    const tmin = (c) => {
      const num = K.NET_H + K.R + c - by * (1 - alpha) - alpha * K.R;
      return num > 0 ? Math.sqrt(num / (0.5 * K.G * alpha * (1 - alpha))) : 0;
    };
    let T = Math.max(s.T * (0.94 + 0.12 * M.rand()), tmin(clear));
    if (err === 'net') {
      const low = tmin(-0.45);
      if (low > 0) T = low; // only a low ball can be netted; a high one just goes long instead
      else return launch(M, f, type, aimX, 'long');
    }
    T = clamp(T, 0.32, 2.8);
    b.vx = (xt - bx) / T;
    b.vy = (K.R - by) / T + 0.5 * K.G * T;
    // looks only: cross-court shots sweep across the court's depth
    const zt = type === 'cross' ? (b.z > 0 ? -1 : 1) * (1.6 + M.rand() * 0.7) : (M.rand() * 2 - 1) * 0.9;
    b.vz = (zt - b.z) / T;
    b.bE = s.E;
    b.bF = s.F;
    b.nb = 0;
    b.bounces = 0;
    b.netted = false;
    b.rolling = false;
    b.shot = type;
    b.err = err || null;
    b.spin = type === 'drop' ? -1 : 1;
    return T;
  }

  // ---------------------------------------------------------------- a match

  function makePlayer(side, id, opts) {
    return {
      side, id, isBud: false, f: side === 0 ? 1 : -1, x: side === 0 ? -5 : 5, y: 0, z: 0, vx: 0, vy: 0, air: false,
      swingT: -1, kind: 'fore', hitDone: false, size: 1, run: K.RUN * (opts.speed || 1),
      assist: !!opts.assist, auto: !!opts.autoServe, fwd: false, lastHit: -999,
    };
  }

  function makeBud(side, id, size, rest) {
    return {
      side, id, isBud: true, f: side === 0 ? 1 : -1, x: (side === 0 ? -1 : 1) * (K.WALL + 3), y: 0, z: -1.1, vx: 0, vy: 0, air: false,
      swingT: -1, kind: 'fore', hitDone: false, size, run: K.RUN * 1.05, assist: true,
      on: false, t: 0, gave: false, saveUsed: false, rest: 0, restLen: rest, cheerT: 0, diveT: 0,
      treats: 0, calls: 0, plan: null, planHit: -1, mode: 'gone',
    };
  }

  // opts: { chars: [id, id], buddies: [id, id], buddySize: [s, s], sets: 1 | 3, ballSpeed: 1, assist: [b, b],
  //         speed: [m, m], autoServe: [b, b], budRest: [frames, frames], seed, firstServer }
  function create(opts = {}) {
    const chars = opts.chars || ['teddy', 'tommy'];
    const buddies = opts.buddies || ['tommy', 'teddy'];
    const M = {
      K, frame: 0, t: 0, phase: 'serve', events: [],
      rand: rng(opts.seed != null ? opts.seed : (Math.random() * 2 ** 31) | 0),
      sf: opts.ballSpeed || 1,
      sets: [0, 0], score: [0, 0], setNo: 1, need: opts.sets === 3 ? 2 : 1, bestOf: opts.sets === 3 ? 3 : 1,
      setScores: [], server: opts.firstServer || 0, firstServer: opts.firstServer || 0, pointNo: 0,
      ball: newBall(), hitId: 0, hitFrame: 0, rallyHits: 0, longest: 0, lastPoint: null, setWinner: -1, winner: -1,
      stats: [0, 1].map(() => ({ points: 0, aces: 0, smashes: 0, winners: 0, saves: 0, treats: 0, calls: 0, hits: 0, drops: 0, lobs: 0 })),
    };
    M.p = [0, 1].map((s) => makePlayer(s, chars[s], {
      speed: opts.speed && opts.speed[s], assist: opts.assist && opts.assist[s], autoServe: opts.autoServe && opts.autoServe[s],
    }));
    M.b = [0, 1].map((s) => makeBud(s, buddies[s], (opts.buddySize && opts.buddySize[s]) || 0.8, (opts.budRest && opts.budRest[s]) || 0));
    M.step = (inputs) => step(M, inputs);
    M.call = (side) => callBud(M, side);
    startServe(M, true);
    return M;
  }

  const emit = (M, type, o) => M.events.push(Object.assign({ type }, o));
  const hitters = (M, side) => [M.p[side], M.b[side]];

  function startServe(M, first) {
    M.phase = 'serve';
    M.t = 0;
    M.ball = Object.assign(newBall(), { held: M.server });
    M.rallyHits = 0;
    for (const p of M.p) {
      p.swingT = -1;
      p.hitDone = false;
    }
    if (first) {
      for (const p of M.p) p.x = spot(M, p.side);
    }
    emit(M, 'serveReady', { side: M.server });
  }

  // where each player stands for a serve: the server just behind the baseline, the receiver near theirs
  const spot = (M, side) => (side === 0 ? -1 : 1) * (side === M.server ? K.HALF + 0.45 : K.HALF - 0.6);

  function step(M, inputs) {
    M.events = [];
    M.frame++;
    M.t++;
    const inp = [0, 1].map((s) => Object.assign(blankInput(), inputs && inputs[s]));
    for (let s = 0; s < 2; s++) {
      if (inp[s].call) callBud(M, s);
      M.p[s].fwd = M.p[s].f > 0 ? inp[s].right : inp[s].left;
    }
    const b = M.ball;

    if (M.phase === 'serve') {
      const walking = M.t < K.SERVE_WALK;
      for (const p of M.p) {
        if (walking || p.side === M.server) {
          const to = spot(M, p.side);
          const want = Math.abs(to - p.x) < 0.05 ? 0 : Math.sign(to - p.x);
          moveTo(p, want, true);
          if (Math.abs(to - p.x) < 0.08) p.x = to;
        } else updatePlayer(M, p, inp[p.side], true);
      }
      const sv = M.p[M.server];
      holdBall(M, sv);
      if (!walking) {
        const auto = sv.auto && M.t >= K.SERVE_WALK + K.AUTO_SERVE;
        if (inp[M.server].swing || auto) toss(M, sv);
      }
    } else if (M.phase === 'toss') {
      const sv = M.p[M.server];
      moveTo(sv, 0, false);
      updatePlayer(M, M.p[1 - M.server], inp[1 - M.server], true);
      ballStep(b, DT); // the toss isn't slowed down on Easy
      const high = b.y - sv.y;
      // press swing again near the top for a power serve; otherwise it's hit on the way down
      if (inp[M.server].swing && high > 2.0) serveHit(M, sv, Math.abs(b.vy) < 2.2);
      else if (b.vy < 0 && high < 2.4) serveHit(M, sv, false);
    } else if (M.phase === 'rally') {
      for (const p of M.p) updatePlayer(M, p, inp[p.side], true);
      rallyBall(M, inp);
    } else {
      // point / set / over: the ball keeps bouncing for show, the players stop to celebrate
      for (const p of M.p) {
        moveTo(p, 0, false);
        gravity(M, p);
        if (p.swingT >= 0 && ++p.swingT >= K.SW_LEN) p.swingT = -1;
      }
      if (b.held < 0) ballStep(b, DT * M.sf);
      if (M.phase === 'point' && M.t >= K.POINT_LEN) afterPoint(M);
      else if (M.phase === 'set' && M.t >= K.SET_LEN) startServe(M);
    }
    for (let s = 0; s < 2; s++) updateBud(M, M.b[s], inp[s]);
    // looks only: whoever the ball is coming to drifts toward the depth it will arrive at; companions stand a
    // little deeper into the court so they don't hide their player
    for (const p of [...M.p, ...M.b]) {
      const coming = M.phase === 'rally' && M.ball.lastHitter !== p.side && (!p.isBud || p.plan);
      const zt = coming ? clamp(M.ball.z + M.ball.vz * 0.3, -2.4, 2.4) : p.isBud ? -1.1 : 0;
      p.z = approach(p.z, zt, 2.6 * DT);
    }
  }

  function moveTo(p, want, run) {
    const target = want * p.run * (run ? 0.85 : 1);
    p.vx = approach(p.vx, target, K.ACCEL * DT);
    p.x += p.vx * DT;
    clampSide(p);
  }

  function clampSide(p) {
    const lo = p.side === 0 ? -K.WALL : K.NET_GAP, hi = p.side === 0 ? -K.NET_GAP : K.WALL;
    if (p.x < lo) {
      p.x = lo;
      p.vx = 0;
    } else if (p.x > hi) {
      p.x = hi;
      p.vx = 0;
    }
  }

  function gravity(M, p) {
    if (!p.air) return;
    p.vy -= K.PG * DT;
    p.y += p.vy * DT;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.air = false;
      emit(M, 'land', { side: p.side, bud: p.isBud });
    }
  }

  function updatePlayer(M, p, inp, canMove) {
    const want = canMove ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0;
    moveTo(p, want, false);
    if (canMove && inp.jump && !p.air) {
      p.vy = K.JUMP_V;
      p.air = true;
      emit(M, 'jump', { side: p.side });
    }
    gravity(M, p);
    if (p.swingT >= 0 && ++p.swingT >= K.SW_LEN) p.swingT = -1;
    // the little-kid assist can start a new swing as soon as the last one has been live
    const ready = p.swingT < 0 || (p.assist && p.swingT > activeEnd(p) + 2);
    if (canMove && inp.swing && ready) startSwing(M, p);
  }

  const activeEnd = (h) => (h.assist ? K.SW_A1_EASY : K.SW_A1);

  function startSwing(M, h) {
    const b = M.ball;
    const high = b.y - h.y;
    h.kind = h.air && b.y > 2.0 ? 'smash' : high > 1.8 * h.size ? 'over' : high < 0.65 * h.size ? 'low' : 'fore';
    h.swingT = 0;
    h.hitDone = false;
    emit(M, 'swing', { side: h.side, bud: h.isBud, kind: h.kind });
  }

  function holdBall(M, sv) {
    const b = M.ball;
    b.x = sv.x + sv.f * 0.32;
    b.y = 1.15;
    b.z = sv.z + 0.35;
    b.vx = b.vy = b.vz = 0;
  }

  function toss(M, sv) {
    const b = M.ball;
    M.phase = 'toss';
    M.t = 0;
    b.held = -1;
    b.x = sv.x + sv.f * 0.38;
    b.y = 1.6;
    b.vy = 4.9;
    b.vx = 0;
    b.vz = 0;
    sv.kind = 'serve';
    emit(M, 'toss', { side: sv.side });
  }

  function serveHit(M, sv, power) {
    const b = M.ball;
    sv.kind = 'serve';
    sv.swingT = K.SW_A0 + 6;
    sv.hitDone = true;
    launch(M, sv.f, power ? 'power' : 'serve', null, null);
    b.lastHitter = sv.side;
    b.by = 'p';
    M.phase = 'rally';
    M.t = 0;
    M.hitId++;
    M.hitFrame = M.frame;
    M.rallyHits = 1;
    sv.lastHit = M.frame;
    emit(M, 'serve', { side: sv.side, power, x: b.x, y: b.y });
    emit(M, 'hit', { side: sv.side, bud: false, shot: power ? 'power' : 'serve', x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
  }

  function rallyBall(M, inp) {
    const b = M.ball;
    // hits first, from the side the ball is on: the player has first go, then his companion
    const s = sideOf(b.x);
    if (b.lastHitter !== s && !b.netted && b.bounces < 2) {
      for (const h of hitters(M, s)) if (tryHit(M, h, inp[s])) break;
    }
    const ev = ballStep(b, DT * M.sf);
    if (ev & EV_NET) emit(M, 'net', { side: b.lastHitter, x: b.x, y: b.y });
    if (ev & EV_CROSS) emit(M, 'cross', { side: b.lastHitter });
    if (ev & EV_BOUNCE) bounce(M);
    if (M.phase === 'rally' && (Math.abs(b.x) > 13 || b.y < -1)) {
      const where = sideOf(b.x), h = b.lastHitter;
      if (where === h) endPoint(M, 1 - h, 'net');
      else if (b.bounces === 0) endPoint(M, where, 'out');
      else endPoint(M, h, 'past');
    }
  }

  function bounce(M) {
    const b = M.ball, s = sideOf(b.x), h = b.lastHitter;
    emit(M, 'bounce', { x: b.x, z: b.z, side: s, speed: Math.abs(b.vy) });
    if (M.phase !== 'rally') return;
    if (s === h) return endPoint(M, 1 - h, b.netted ? 'net' : 'short');
    b.bounces++;
    if (b.bounces === 1) {
      if (Math.abs(b.x) > K.HALF + K.LINE) endPoint(M, s, 'out');
      else if (b.rolling) endPoint(M, h, 'double'); // a dead ball counts as two bounces
      else emit(M, 'in', { x: b.x, side: s });
    } else endPoint(M, h, 'double');
  }

  // Contact test for one hitter (a player or a companion) during the live part of his swing.
  function tryHit(M, h, inp) {
    if (h.swingT < K.SW_A0 || h.swingT > activeEnd(h) || h.hitDone) return false;
    if (h.isBud && (!h.on || h.t < K.BUD_HELP0 || h.t >= K.BUD_OUT)) return false;
    const b = M.ball, sz = h.size;
    const a = (h.swingT - K.SW_A0) / (activeEnd(h) - K.SW_A0);
    const rel = (b.x - h.x) * h.f;
    const racket = (K.REL0 + (K.REL1 - K.REL0) * a) * sz;
    const band = (h.assist ? K.BAND_EASY : K.BAND) * sz;
    if (Math.abs(rel - racket) > band) return false;
    const high = b.y - h.y;
    if (high < -0.15 || high > K.REACH * sz + 0.15) return false;
    const isBud = h.isBud;
    let shot;
    if (h.air && b.y > 2.3) shot = 'smash';
    else if (a < 0.3) shot = 'drop';
    else if (a < 0.62) shot = 'drive';
    else shot = h.fwd ? 'cross' : 'lob';
    if (isBud && h.plan) shot = h.plan.shot === 'lob' ? 'lob' : shot === 'smash' ? 'smash' : 'drive';
    let err = null;
    if (!h.assist) {
      if (a < 0.07 && M.rand() < 0.5) err = 'net';
      else if (a > 0.93 && M.rand() < 0.5) err = 'long';
    }
    h.hitDone = true;
    h.lastHit = M.frame;
    launch(M, h.f, shot, inp && inp.aim != null && !isBud ? inp.aim : isBud && h.plan ? h.plan.aim : null, err);
    b.lastHitter = h.side;
    b.by = isBud ? 'b' : 'p';
    M.hitId++;
    M.hitFrame = M.frame;
    M.rallyHits++;
    M.longest = Math.max(M.longest, M.rallyHits);
    const st = M.stats[h.side];
    st.hits++;
    if (shot === 'smash') st.smashes++;
    if (shot === 'drop') st.drops++;
    if (shot === 'lob') st.lobs++;
    emit(M, 'hit', { side: h.side, bud: isBud, shot, err, timing: a, x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
    return true;
  }

  // The point is over... unless the loser's companion is there to save a ball that got past.
  function endPoint(M, winner, reason) {
    const loser = 1 - winner, bd = M.b[loser], b = M.ball;
    if ((reason === 'double' || reason === 'past') && bd.on && !bd.saveUsed && bd.t >= K.BUD_HELP0 && bd.t < K.BUD_OUT) {
      return save(M, bd);
    }
    M.phase = 'point';
    M.t = 0;
    M.score[winner]++;
    const ws = M.stats[winner];
    ws.points++;
    const ace = M.rallyHits === 1 && winner === M.server && (reason === 'double' || reason === 'past');
    if (ace) ws.aces++;
    else if (reason === 'double' || reason === 'past') ws.winners++;
    M.lastPoint = { winner, reason, ace, shot: b.shot, by: b.by, rally: M.rallyHits };
    M.pointNo++;
    const [a, c] = M.score;
    let setDone = -1;
    if (Math.max(a, c) >= K.TO_WIN && Math.abs(a - c) >= K.BY) setDone = a > c ? 0 : 1;
    if (setDone >= 0) {
      M.sets[setDone]++;
      M.setScores.push([a, c]);
      M.setWinner = setDone;
      if (M.sets[setDone] >= M.need) M.winner = setDone;
    } else M.setWinner = -1;
    emit(M, 'point', Object.assign({ score: [a, c], sets: M.sets.slice(), setWon: setDone, matchWon: M.winner }, M.lastPoint));
  }

  function save(M, bd) {
    const b = M.ball, f = bd.f;
    bd.saveUsed = true;
    M.stats[bd.side].saves++;
    const lo = bd.side === 0 ? -K.WALL + 0.2 : 0.8, hi = bd.side === 0 ? -0.8 : K.WALL - 0.2;
    b.x = clamp(b.x, lo, hi);
    b.y = Math.max(b.y, 0.5);
    b.rolling = false;
    launch(M, f, 'save', null, null);
    b.lastHitter = bd.side;
    b.by = 'b';
    M.hitId++;
    M.hitFrame = M.frame;
    M.rallyHits++;
    bd.x = b.x - f * 0.5;
    bd.diveT = 30;
    bd.swingT = K.SW_A0 + 6;
    bd.kind = 'low';
    bd.hitDone = true;
    clampSide(bd);
    emit(M, 'save', { side: bd.side, x: b.x, y: b.y, id: bd.id });
  }

  function afterPoint(M) {
    if (M.winner >= 0) {
      M.phase = 'over';
      M.t = 0;
      emit(M, 'over', { winner: M.winner });
      return;
    }
    if (M.setWinner >= 0) {
      M.setNo++;
      M.score = [0, 0];
      M.firstServer ^= 1;
      M.server = M.firstServer;
      M.pointNo = 0;
      M.setWinner = -1;
      M.phase = 'set';
      M.t = 0;
      M.ball.held = -1;
      emit(M, 'newSet', { setNo: M.setNo });
      return;
    }
    M.server = (M.firstServer + M.pointNo) % 2;
    startServe(M);
  }

  // ---------------------------------------------------------------- the companion

  function callBud(M, side) {
    const bd = M.b[side];
    M.stats[side].calls++;
    if (M.phase === 'over') return;
    if (bd.on) {
      if (bd.t < K.BUD_BYE) {
        // another treat (he doesn't stay longer)
        bd.cheerT = 1.0;
        bd.treats++;
        M.stats[side].treats++;
        emit(M, 'treat', { side, again: true, id: bd.id });
      }
      return;
    }
    if (bd.rest > 0) return emit(M, 'budRest', { side });
    Object.assign(bd, {
      on: true, t: 0, gave: false, saveUsed: false, cheerT: 0, diveT: 0, plan: null, planHit: -1, swingT: -1,
      x: (side === 0 ? -1 : 1) * (K.WALL + 3), y: 0, vy: 0, air: false, mode: 'in',
    });
    bd.calls++;
    emit(M, 'budIn', { side, id: bd.id });
  }

  // He plays the half of the court his player isn't in: at the net while you're back, at the back if you come in.
  function budZone(M, bd) {
    const px = Math.abs(M.p[bd.side].x);
    return px > 3.4 ? { lo: K.NET_GAP, hi: 3.1, home: 2.0 } : { lo: 3.7, hi: K.WALL, home: 5.6 };
  }

  function updateBud(M, bd, inp) {
    if (!bd.on) {
      if (bd.rest > 0) bd.rest--;
      return;
    }
    bd.t += DT;
    const t = bd.t, sgn = bd.side === 0 ? -1 : 1;
    bd.cheerT = Math.max(0, bd.cheerT - DT);
    if (bd.diveT > 0) bd.diveT--;
    if (bd.swingT >= 0 && ++bd.swingT >= K.SW_LEN) bd.swingT = -1;
    if (!bd.gave && t >= K.BUD_TREAT) {
      bd.gave = true;
      bd.treats++;
      M.stats[bd.side].treats++;
      emit(M, 'treat', { side: bd.side, again: false, id: bd.id });
    }
    if (t >= K.BUD_OUT) {
      // bye: run off the back of the court
      bd.mode = 'out';
      const off = sgn * (K.WALL + 3.2);
      bd.vx = Math.sign(off - bd.x) * bd.run * 1.2;
      bd.x += bd.vx * DT;
      gravity(M, bd);
      if (Math.abs(bd.x) >= K.WALL + 3) {
        bd.on = false;
        bd.mode = 'gone';
        bd.rest = bd.restLen;
        emit(M, 'budOut', { side: bd.side });
      }
      return;
    }
    if (t >= K.BUD_BYE) bd.mode = 'bye';
    else if (t < K.BUD_HELLO) bd.mode = 'in';
    else bd.mode = t < K.BUD_TREAT || bd.cheerT > 0 ? 'hello' : 'play';
    const zone = budZone(M, bd);
    let target = sgn * zone.home;
    const help = t >= K.BUD_HELP0 && M.phase === 'rally';
    const b = M.ball;
    if (help && b.lastHitter !== bd.side && !b.netted) {
      // a moment after the other side hits, he checks: can his player get there in time? If not, he goes for it.
      if (bd.planHit !== M.hitId && M.frame - M.hitFrame >= 8) {
        bd.planHit = M.hitId;
        const mine = plan(M, M.p[bd.side], { tau: 0.46 });
        bd.plan = mine && !mine.late ? null : plan(M, bd, { tau: 0.46 });
        if (bd.plan && bd.plan.late) bd.plan = null;
        if (bd.plan) {
          // a lob over a player at the net, otherwise a drive away from him
          const foe = M.p[1 - bd.side];
          bd.plan.shot = Math.abs(foe.x) < 3.2 ? 'lob' : 'drive';
          bd.plan.aim = Math.abs(foe.x) > 4.5 ? 2.2 : 5.2;
          M.stats[bd.side].budHelps = (M.stats[bd.side].budHelps || 0) + 1;
        }
      }
    } else if (b.lastHitter === bd.side || M.phase !== 'rally') bd.plan = null;
    const pl = bd.plan;
    if (pl && !pl.miss) target = pl.x;
    const speed = t < K.BUD_HELLO ? 1.5 : 1;
    let want = Math.abs(target - bd.x) < 0.1 ? 0 : Math.sign(target - bd.x);
    if (bd.diveT > 0) want = 0;
    const tv = want * bd.run * speed;
    bd.vx = approach(bd.vx, tv, K.ACCEL * DT);
    bd.x += bd.vx * DT;
    if (t >= K.BUD_HELLO) clampSide(bd);
    gravity(M, bd);
    if (pl && !pl.miss && help && M.frame >= pl.pressAt && bd.swingT < 0 && !bd.hitDone) startSwing(M, bd);
    if (bd.swingT < 0) bd.hitDone = false;
  }


  // ---------------------------------------------------------------- planning a return (the CPU and the companion)

  // Look ahead along the ball's flight and pick where to stand and when to swing, so the racket meets the ball at
  // sweep position `tau` (0 = late, by your back foot ... 1 = early, out in front). opts: { tau, zone: { lo, hi } in
  // metres from the net, smash: also consider jumping for high balls }. Returns null if the ball isn't coming
  // (netted, or landing on the hitter's own side), else { x, pressAt, contactAt, jumpAt, smash, out, late }:
  // `out` means it will land past the baseline, and `late` that he can't get there in time.
  function plan(M, h, o) {
    const sim = copyBall(M.ball);
    const side = h.side, f = h.f, sz = h.size;
    const zlo = (o.zone && o.zone.lo) || K.NET_GAP, zhi = (o.zone && o.zone.hi) || K.WALL;
    let bounces = M.ball.bounces, out = false;
    const samples = [];
    for (let i = 1; i <= 260; i++) {
      const ev = ballStep(sim, DT * M.sf);
      if (ev & EV_NET) return null;
      if (ev & EV_BOUNCE) {
        if (sideOf(sim.x) !== side) return null;
        bounces++;
        if (bounces === 1 && Math.abs(sim.x) > K.HALF + K.LINE) out = true;
        if (bounces >= 2 || sim.rolling) break;
      }
      if (sideOf(sim.x) === side) samples.push({ i, x: sim.x, y: sim.y, b: bounces });
      if (Math.abs(sim.x) > 13) break;
    }
    if (!samples.length) return null;
    const tau = o.tau;
    const lead = Math.round(K.SW_A0 + tau * (activeEnd(h) - K.SW_A0));
    const rel = (K.REL0 + (K.REL1 - K.REL0) * tau + (h.assist ? K.BAND_EASY : K.BAND) * 0.8) * sz;
    let best = null, bestScore = -1e9, near = null, nearGap = 1e9;
    for (const s of samples) {
      const smash = !!o.smash && s.y > 2.5 && s.y < 3.4;
      if (!smash && (s.y < 0.25 || s.y > (K.REACH - 0.3) * sz)) continue;
      const x = s.x - f * rel;
      if (sideOf(x) !== side || Math.abs(x) < zlo || Math.abs(x) > zhi) continue;
      const press = s.i - lead;
      if (press < 1 || (smash && s.i < 22)) continue;
      const travel = Math.abs(x - h.x) / (h.run * 0.92) / DT;
      const slack = s.i - travel - 4;
      if (slack < 0) {
        if (-slack < nearGap) {
          nearGap = -slack;
          near = { s, x, press };
        }
        continue;
      }
      const score = -Math.abs(s.y - 1.1 * sz) + (s.b > 0 ? 0.35 : 0) - s.i * 0.003 + (smash ? 2.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { s, x, press, smash, slack };
      }
    }
    const pick = best || near;
    if (!pick) return null;
    return {
      x: pick.x, pressAt: M.frame + pick.press, contactAt: M.frame + pick.s.i, by: pick.s.y,
      jumpAt: pick.smash ? M.frame + pick.s.i - 20 : -1, smash: !!pick.smash, out, late: !best, slack: best ? best.slack : 0,
    };
  }

  root.TTMatch = { K, SHOTS, DT, EV_NET, EV_CROSS, EV_BOUNCE, create, blankInput, ballStep, copyBall, launch, plan, sideOf, rng, clamp, activeEnd };
})(typeof window !== 'undefined' ? window : globalThis);
