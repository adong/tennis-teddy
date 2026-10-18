/* Teddy & Tommy Tennis: the game. Scene, camera, characters, companions, menus, HUD, the main loop and the
   window.game test hooks. The rules live in js/match.js; this file reads match state every frame and turns
   match.events into POW bursts, sounds, the umpire's calls and celebrations. Behind the menus, two CPUs play a
   quiet demo rally. */
(function () {
  'use strict';
  const T = THREE, TM = window.TTMatch, C = window.TTCPU, P = window.TTPoses, FX = window.TTFx, S = window.TTSfx, I = window.TTInput;
  const Kit = window.Kit, K = TM.K;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const PI = Math.PI;
  const SIDE_COLOR = ['#8cc2ff', '#ffb0b0'];
  const RACKET_COLOR = ['#2a7bd6', '#e53950'];
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const HOLD_TREAT = 4.5; // seconds you hold a treat
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('ttTennis.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try { localStorage.setItem('ttTennis.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
    },
  };

  const G = {
    screen: 'title', // title | select | play | pause | results
    mode: '1p', level: store.get('level', 'easy'), sets: store.get('sets', 1), autoServe: store.get('auto', false),
    picks: [store.get('pick0', 'teddy'), store.get('pick1', 'tommy')], selSide: 0, locked: [false, false], vsT: 0,
    attract: true, slowT: 0, shake: 0, time: 0, acc: 0, timers: [], hold: false, testing: false, frozen: false,
    lastMatch: null, overT: -1,
  };
  let renderer, scene, camera, sun, stage, ballFx, umpire = null;
  let M = null, brains = [null, null], views = [], buds = [];
  let portraits = {}, last = 0;
  const cam = { x: 0, look: 2.2, shake: 0 };
  const ui = {};
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
  const ROSTER = () => Kit.roster.list;
  const nameOf = (side) => (M && views[side] ? views[side].entry.name : side ? 'P2' : 'P1');
  const sound = (fn) => { if (!G.attract) fn(); };
  const later = (t, fn) => G.timers.push({ t, fn });

  // ---------------------------------------------------------------- characters

  function altLook(look) {
    // a mirror match: the second one wears different colours
    const shift = (hex, h) => '#' + new T.Color(hex).offsetHSL(h, 0, 0).getHexString();
    return Object.assign({}, look, { top: shift(look.top, 0.42), bottom: shift(look.bottom, 0.3), shoes: shift(look.shoes, 0.5) });
  }

  function dispose(obj) {
    scene.remove(obj);
    obj.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }

  function buildPerson(id, side, alt, scale) {
    const entry = Kit.roster.get(id) || Kit.roster.list[0];
    const person = Kit.people.build(alt ? altLook(entry.look) : entry.look);
    P.arm(person, side, RACKET_COLOR[side]);
    person.root.scale.setScalar(scale || 1);
    person.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(person.root);
    return { entry, person };
  }

  function buildPlayer(id, side, alt, label) {
    const { entry, person } = buildPerson(id, side, alt, 1);
    let tag = null;
    if (label) {
      tag = Kit.gfx.nameTag(Kit.lang.t(label), label === 'CPU' ? '#ff8a8a' : SIDE_COLOR[side]);
      tag.userData.label = label;
      tag.scale.multiplyScalar(0.62);
      tag.renderOrder = 15;
      scene.add(tag);
    }
    return { side, id, entry, person, tag, t: 0, ph: 0, cel: null, celT: 0, sadT: 0, hop: 0, treat: null, treatT: 0 };
  }

  // The companion (the other brother) for one side: built at his buddy size, with a name tag in his caller's colour.
  function buildBud(side, id, alt) {
    const entry0 = Kit.roster.get(id);
    const { entry, person } = buildPerson(id, side, alt, entry0.buddyScale || 0.8);
    person.root.visible = false;
    const tag = Kit.gfx.nameTag(entry.name, SIDE_COLOR[side]);
    tag.scale.multiplyScalar(0.8);
    tag.renderOrder = 15;
    tag.visible = false;
    scene.add(tag);
    return { side, id, entry, person, tag, t: 0, ph: 0, shot: false, mode: '', x: null };
  }

  // A friend in the umpire's chair: whoever isn't playing.
  function seatUmpire(chars) {
    if (umpire) dispose(umpire.root);
    const id = ['bolt', 'bruno', 'luna', 'zoom', 'zombie'].find((c) => !chars.includes(c)) || 'bolt';
    const p = Kit.people.build(Kit.roster.get(id).look);
    p.root.position.set(stage.umpire.position.x, 1.42, stage.umpire.position.z + 0.05);
    p.root.rotation.y = PI;
    p.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    p.legL.rotation.x = p.legR.rotation.x = 1.45;
    p.armL.rotation.x = p.armR.rotation.x = 0.5;
    scene.add(p.root);
    umpire = p;
  }

  // The 1P / 2P / CPU tags are drawn on a canvas: draw them again when the language changes (中文 / EN).
  function relabel() {
    for (const v of views) {
      if (!v.tag) continue;
      const label = v.tag.userData.label;
      const fresh = Kit.gfx.nameTag(Kit.lang.t(label), label === 'CPU' ? '#ff8a8a' : SIDE_COLOR[v.side]);
      v.tag.material.map.dispose();
      v.tag.material.map = fresh.material.map;
      v.tag.material.needsUpdate = true;
    }
  }
  Kit.lang.onChange(relabel);

  function clearViews() {
    for (const v of views) {
      dispose(v.person.root);
      if (v.tag) dispose(v.tag);
      if (v.treat) scene.remove(v.treat);
    }
    for (const b of buds) {
      dispose(b.person.root);
      dispose(b.tag);
    }
    views = [];
    buds = [];
  }

  // who: 'human' (keyboard / touch for that side) or a CPU level
  function startMatch(chars, who, attract) {
    clearViews();
    FX.clear();
    const cfg = C.setup({ who, chars, level: attract ? 'normal' : G.level, sets: attract ? 1 : G.sets, mode: G.mode });
    cfg.autoServe = who.map((w) => w === 'human' && G.autoServe);
    cfg.firstServer = Math.random() < 0.5 ? 0 : 1;
    M = TM.create(cfg);
    brains = who.map((w) => (w === 'human' ? (m, side) => I.snapshot(side) : C.brain(w)));
    const labels = attract ? [null, null] : who.map((w, side) => (w === 'human' ? (G.mode === '2p' ? `${side + 1}P` : '1P') : 'CPU'));
    views = chars.map((id, side) => buildPlayer(id, side, side === 1 && chars[0] === chars[1], labels[side]));
    buds = M.b.map((bd, side) => buildBud(side, bd.id, side === 1 && M.b[0].id === M.b[1].id));
    seatUmpire(chars);
    G.attract = !!attract;
    G.slowT = 0;
    G.acc = 0;
    G.timers = [];
    G.overT = -1;
    G.who = who.slice();
    I.setTwoPlayer(G.mode === '2p');
    I.clear();
    if (!attract) {
      G.lastMatch = { chars: chars.slice(), who: who.slice() };
      setupHud();
    }
  }

  function startAttract() {
    const ids = ROSTER().map((e) => e.id);
    const a = Math.random() < 0.6 ? 'teddy' : Kit.gfx.pick(ids);
    let b = Math.random() < 0.6 ? 'tommy' : Kit.gfx.pick(ids);
    if (b === a) b = a === 'tommy' ? 'teddy' : 'tommy';
    startMatch(Math.random() < 0.5 ? [a, b] : [b, a], ['normal', 'normal'], true);
  }

  function startGame() {
    G.vsT = 0;
    store.set('pick0', G.picks[0]);
    store.set('pick1', G.picks[1]);
    const who = G.mode === '2p' ? ['human', 'human'] : ['human', G.level];
    startMatch(G.picks.slice(), who, false);
    show('play');
    Kit.sound.music('play');
  }

  // ---------------------------------------------------------------- the loop

  function tick() {
    if (!M) return;
    const a = brains[0](M, 0), b = brains[1](M, 1);
    M.step([a, b]);
    handleEvents();
  }

  function advance(dt) {
    for (let i = G.timers.length - 1; i >= 0; i--) {
      const t = G.timers[i];
      if ((t.t -= dt) <= 0) {
        G.timers.splice(i, 1);
        t.fn();
      }
    }
    G.time += dt;
    if (G.screen === 'pause' || G.frozen) return;
    if (G.screen === 'select' && G.vsT > 0 && (G.vsT -= dt) <= 0) startGame();
    let scale = 1;
    if (G.slowT > 0) {
      G.slowT -= dt;
      scale = 0.35; // slow motion for a save
    }
    G.acc += dt * scale;
    let n = 0;
    while (G.acc >= TM.DT && n < 8) {
      tick();
      G.acc -= TM.DT;
      n++;
    }
    if (n === 8) G.acc = 0;
    if (G.attract && M && M.phase === 'over' && M.t > 200) startAttract();
    // the results screen, a moment after the last point
    if (G.overT > 0 && (G.overT -= dt) <= 0) {
      G.overT = -1;
      if (G.screen === 'play') showResults();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.1);
    last = now;
    if (G.hold) return;
    advance(dt);
    render(G.screen === 'pause' ? 0 : dt);
  }

  // ---------------------------------------------------------------- events -> effects

  const SHOT_WORDS = {
    smash: ['SMASH!', '#ff4b5c', 2.1], drop: ['PLOP!', '#7dff5a', 1.2], lob: ['BOING!', '#18d4ff', 1.3],
    cross: ['ZING!', '#ff9f1c', 1.4], power: ['WHAM!', '#ff3d7f', 1.7], serve: ['POCK!', '#ffd400', 1.2], save: ['SAVED!', '#ffd400', 1.8],
  };
  const SHOT_NAMES = { smash: 'SMASH!', drop: 'DROP SHOT!', lob: 'LOB!', cross: 'CROSS!', power: 'POWER SERVE!' };

  function handleEvents() {
    for (const e of M.events) {
      const b = M.ball;
      switch (e.type) {
        case 'hit': {
          const [w, col, size] = SHOT_WORDS[e.shot] || [Kit.gfx.pick(['POCK!', 'POP!', 'THWACK!']), '#ffd400', 1.15];
          FX.burst(e.x, e.y, b.z, w, col, size * (G.attract ? 0.8 : 1));
          FX.sparkle(e.x, e.y, b.z, '#f4ff8a');
          sound(() => (e.shot === 'smash' ? S.smash() : S.pock(clamp(e.speed / 14, 0, 1))));
          if (e.shot === 'smash') {
            G.shake = 0.35;
            const v = views[e.side];
            const teddy = !e.bud && v && v.id === 'teddy';
            shotCallout(e.side, teddy ? 'JUMP SHOT SMASH!' : 'SMASH!');
          } else if (SHOT_NAMES[e.shot] && !e.bud) shotCallout(e.side, SHOT_NAMES[e.shot]);
          if (e.bud && !G.attract) shotCallout(e.side, `${buds[e.side].entry.name}!`);
          ballFx.clearTrail();
          break;
        }
        case 'swing': sound(() => S.swing()); break;
        case 'toss': sound(() => S.toss()); break;
        case 'bounce':
          FX.dust(e.x, e.z, 6);
          sound(() => S.bounce(e.speed));
          break;
        case 'net':
          FX.burst(e.x, K.NET_H * 0.6, b.z, 'NET!', '#ffffff', 1.1);
          sound(() => S.net());
          break;
        case 'jump': sound(() => Kit.sound.jump()); break;
        case 'point': onPoint(e); break;
        case 'newSet':
          banner(`SET ${e.setNo}`, 'set', 1.8);
          setupHud();
          break;
        case 'over':
          if (!G.attract) G.overT = 1.6;
          break;
        case 'budIn':
          sound(() => Kit.sound.powerup());
          toast(`${buds[e.side].entry.name}'S HERE! 👋`);
          break;
        case 'treat': giveTreat(e.side); break;
        case 'save': onSave(e); break;
        case 'budRest':
          sound(() => S.nope());
          nudge(e.side);
          break;
      }
    }
  }

  function onPoint(e) {
    const w = e.winner, l = 1 - w;
    const wv = views[w], lv = views[l];
    // the winner's signature move: Teddy's boxing combo (or his jump shot after a smash), Tommy's Y pose
    let cel = Kit.roster.signature(wv.entry, 'hello');
    if (wv.id === 'teddy' && e.shot === 'smash' && e.by === 'p') cel = 'jumpshot';
    wv.cel = cel;
    wv.celT = 1.9;
    wv.t = 0;
    wv.shot = false;
    lv.sadT = 1.4;
    const bd = buds[w];
    if (M.b[w].on) {
      bd.cel = Kit.roster.signature(bd.entry, 'hello');
      bd.celT = 1.6;
    }
    FX.confetti(M.p[w].x, 2.2, M.p[w].z);
    const human = G.who[w] === 'human';
    sound(() => {
      S.point(G.mode === '2p' || human);
      S.cheer(e.ace || e.shot === 'smash' ? 1.4 : 1);
      if (!human && G.mode === '1p') S.aww();
    });
    if (G.attract) return;
    // what happened...
    const reason = e.ace ? 'ACE!' : e.reason === 'out' ? 'OUT!' : e.reason === 'net' ? 'IN THE NET!' : e.reason === 'short' ? 'OOPS!' :
      e.shot === 'smash' ? 'SMASH!' : e.shot === 'drop' ? 'DROP SHOT!' : e.shot === 'lob' ? 'LOB WINNER!' : 'WINNER!';
    shotCallout(e.reason === 'out' || e.reason === 'net' || e.reason === 'short' ? l : w, reason);
    // ...and the umpire's call
    if (e.matchWon >= 0) {
      call('GAME, SET & MATCH!', `${nameOf(w)} WINS!`, 'good');
      sound(() => S.fanfare());
    } else if (e.setWon >= 0) {
      call('GAME & SET!', `${nameOf(w)} ${e.score[w]}–${e.score[l]}`, 'good');
      sound(() => S.whistle());
    } else {
      const [txt, sub] = scoreCall(e.score, M.sets);
      call(txt, sub, human || G.mode === '2p' ? 'good' : 'bad');
    }
  }

  // "15–LOVE!" style calls for kid scoring: first to 7, win by 2
  function scoreCall(sc, sets) {
    const [a, b] = sc;
    const n = (v) => (v === 0 ? 'LOVE' : String(v));
    let txt;
    if (a >= K.TO_WIN - 1 && b >= K.TO_WIN - 1) txt = a === b ? 'DEUCE!' : `ADVANTAGE ${nameOf(a > b ? 0 : 1)}!`;
    else if (a === b) txt = `${n(a)} ALL!`;
    else txt = `${n(a)}–${n(b)}!`;
    let sub = '';
    const lead = a > b ? 0 : b > a ? 1 : -1;
    if (lead >= 0) {
      const mine = sc[lead] + 1, theirs = sc[1 - lead];
      if (mine >= K.TO_WIN && mine - theirs >= K.BY) sub = sets[lead] + 1 >= M.need ? 'MATCH POINT!' : 'SET POINT!';
    }
    return [txt, sub];
  }

  function onSave(e) {
    const bd = buds[e.side];
    G.slowT = 0.55;
    FX.burst(e.x, e.y + 0.3, M.ball.z, 'SAVED!', '#ffd400', 1.8);
    FX.sparkle(e.x, e.y, M.ball.z, '#ffffff');
    FX.dust(e.x, M.ball.z, 14);
    sound(() => {
      Kit.sound.powerup();
      S.cheer(1.2);
    });
    toast(`${bd.entry.name} SAVED IT!`, 'save');
    bd.t = 0;
  }

  // the companion's treat: it flies from his hand into his player's free hand, who holds it for a while
  const vA = new T.Vector3(), vB = new T.Vector3();
  function giveTreat(side) {
    const [emoji, label] = Kit.gfx.pick(TREATS);
    const bd = buds[side], v = views[side];
    sound(() => Kit.sound.powerup());
    toast(`${emoji} ${label} FROM ${bd.entry.name}!`, 'treat');
    bd.person.root.updateMatrixWorld(true);
    Kit.people.handWorld(bd.person, side === 0 ? 1 : -1, vA);
    vA.z += 0.4;
    FX.fly(emoji, vA, (out) => freeHand(v, out), {
      dur: 0.7, arc: 1.4, size: 0.8,
      done: (s) => {
        if (v.treat) scene.remove(v.treat);
        v.treat = s;
        v.treatT = HOLD_TREAT;
        FX.sparkle(s.position.x, s.position.y, s.position.z, '#ffffff');
      },
    });
  }

  function freeHand(v, out) {
    v.person.root.updateMatrixWorld(true);
    Kit.people.handWorld(v.person, v.side === 0 ? -1 : 1, out);
    out.z += 0.45; // the camera side of the hand, so the body doesn't hide it
    return out;
  }

  // Teddy's jump shot: a 🏀 arcs off toward an imaginary hoop high up behind him, then SWISH!
  function shootBall(v) {
    v.person.root.updateMatrixWorld(true);
    Kit.people.handWorld(v.person, 1, vA);
    const f = v.side === 0 ? 1 : -1;
    vB.set(vA.x - f * 3.5, vA.y + 2.5, vA.z - 2.5);
    const to = vB.clone();
    FX.fly('🏀', vA, (out) => out.copy(to), {
      dur: 0.8, arc: 1.6, size: 0.45, spin: -10,
      done: (s) => {
        scene.remove(s);
        FX.emit(to.x, to.y, to.z, { color: '#ff9f1c', n: 16, speed: 2.5, up: 2, life: 0.5, size: 0.2 });
        sound(() => Kit.sound.swish());
      },
    });
  }

  // ---------------------------------------------------------------- drawing a frame

  function render(dt) {
    if (!M) return;
    const b = M.ball;
    for (let s = 0; s < 2; s++) {
      renderPlayer(views[s], M.p[s], dt);
      renderBud(buds[s], M.b[s], dt);
    }
    const fast = M.phase === 'rally' && Math.hypot(b.vx, b.vy) * M.sf > 9;
    ballFx.update(b, dt, fast, true);
    updateRing(dt);
    if (umpire) {
      // the umpire follows the ball with his head
      umpire.head.rotation.y += (clamp(-b.x * 0.09, -0.9, 0.9) - umpire.head.rotation.y) * damp(6, dt);
    }
    FX.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
    updateHud(dt);
  }

  function renderPlayer(v, p, dt) {
    const person = v.person, root = person.root;
    v.t += dt;
    const k = damp(18, dt);
    const st = { id: v.id, t: v.t, ph: v.ph, air: p.air };
    v.celT = Math.max(0, v.celT - dt);
    v.sadT = Math.max(0, v.sadT - dt);
    if (v.celT > 0 && p.swingT < 0) {
      st.mode = 'celebrate';
      st.cel = v.cel;
    } else if (v.sadT > 0 && p.swingT < 0) st.mode = 'sad';
    else if (p.swingT >= 0) {
      st.mode = 'swing';
      st.u = p.swingT / K.SW_LEN;
      st.kind = p.kind;
      st.run = !p.air && Math.abs(p.vx) > 1.2;
    } else if (M.phase === 'toss' && M.server === v.side) st.mode = 'toss';
    else if (p.air) st.mode = 'air';
    else if (Math.abs(p.vx) > 0.6) st.mode = 'run';
    else st.mode = 'ready';
    if (st.mode === 'run' || st.run) v.ph += dt * (7 + Math.abs(p.vx) * 1.4);
    st.ph = v.ph;
    P.pose(person, st, k);
    // Teddy's jump-shot celebration: a hop, and the 🏀 leaves his hands at the top
    let hop = 0;
    if (st.mode === 'celebrate' && st.cel === 'jumpshot') {
      const u = (1.9 - v.celT) / 0.75;
      if (u < 1) hop = Math.sin(u * PI) * 0.9;
      if (u > 0.45 && !v.shot) {
        v.shot = true;
        shootBall(v);
      }
    } else if (st.mode === 'celebrate' && st.cel === 'peace') hop = Math.abs(Math.sin(v.t * 6)) * 0.18;
    root.position.set(p.x, p.y + hop, p.z);
    root.rotation.y = p.f > 0 ? -PI / 2 - 0.42 : PI / 2 + 0.42;
    if (st.mode === 'celebrate') root.rotation.y += (p.f > 0 ? -1 : 1) * 0.95; // turn to face the camera
    if (v.tag) v.tag.position.set(p.x, p.y + hop + 2.55, p.z);
    // a treat in the free hand
    if (v.treat) {
      v.treatT -= dt;
      if (v.treatT <= 0) {
        scene.remove(v.treat);
        v.treat = null;
      } else freeHand(v, v.treat.position);
    }
  }

  function renderBud(bv, bd, dt) {
    const person = bv.person, root = person.root;
    root.visible = bv.tag.visible = bd.on;
    if (!bd.on) {
      bv.x = null;
      return;
    }
    // he's drawn where the engine has him, except that a big jump (the dive for a save) is a quick visible dash
    if (bv.x === null || Math.abs(bd.x - bv.x) < 0.5) bv.x = bd.x;
    else {
      const step = Math.min(Math.abs(bd.x - bv.x), 40 * dt);
      bv.x += Math.sign(bd.x - bv.x) * step;
      FX.dust(bv.x, bd.z, 2);
    }
    bv.t += dt;
    const k = damp(18, dt);
    const st = { id: bv.id, t: bv.t, ph: bv.ph, air: bd.air };
    bv.celT = Math.max(0, (bv.celT || 0) - dt);
    let face = bd.f;
    const hello = Kit.roster.signature(bv.entry, 'hello'), bye = Kit.roster.signature(bv.entry, 'goodbye');
    if (bd.mode !== bv.mode) {
      bv.mode = bd.mode;
      bv.t = 0;
      st.t = 0;
      if (bd.mode === 'bye') bv.shot = false;
    }
    if (bd.diveT > 0) st.mode = 'dive';
    else if (bd.swingT >= 0) {
      st.mode = 'swing';
      st.u = bd.swingT / K.SW_LEN;
      st.kind = bd.kind;
      st.run = Math.abs(bd.vx) > 1.2;
    } else if (bd.mode === 'in' || bd.mode === 'out') {
      st.mode = 'run';
      if (bd.mode === 'out') face = -bd.f;
    } else if (bd.mode === 'hello' || bv.celT > 0) {
      st.mode = 'hello';
      st.cel = bv.celT > 0 ? bv.cel : hello;
    } else if (bd.mode === 'bye') {
      st.mode = 'hello';
      st.cel = bye;
    } else if (bd.t > K.BUD_TREAT - 0.35 && bd.t < K.BUD_TREAT + 0.25) st.mode = 'give';
    else st.mode = Math.abs(bd.vx) > 0.6 ? 'run' : 'ready';
    if (st.mode === 'run' || st.run) bv.ph += dt * (8 + Math.abs(bd.vx) * 1.4);
    st.ph = bv.ph;
    P.pose(person, st, k);
    let hop = 0;
    if (st.mode === 'hello' && st.cel === 'jumpshot') {
      const u = bv.t / 0.75;
      if (u < 1) hop = Math.sin(u * PI) * 0.8;
      if (u > 0.45 && !bv.shot) {
        bv.shot = true;
        shootBall(bv);
      }
    } else if (st.mode === 'hello' && st.cel === 'peace') hop = Math.abs(Math.sin(bv.t * 6)) * 0.15;
    root.position.set(bv.x, bd.y + hop, bd.z);
    root.rotation.y = face > 0 ? -PI / 2 - 0.42 : PI / 2 + 0.42;
    if (st.mode === 'hello' || st.mode === 'give') root.rotation.y += (face > 0 ? -1 : 1) * 0.95;
    bv.tag.position.set(bv.x, bd.y + hop + 2.55 * root.scale.y + 0.2, bd.z);
  }

  // The little-kid helper: on Easy, a ring shows where a ball coming to you will bounce.
  const sim = {};
  function updateRing(dt) {
    const ring = ballFx.ring, b = M.ball;
    let show = false;
    if (!G.attract && G.level === 'easy' && M.phase === 'rally' && b.bounces === 0 && !b.netted) {
      const to = 1 - b.lastHitter;
      if (G.who[to] === 'human') {
        Object.assign(sim, TM.copyBall(b));
        for (let i = 0; i < 240; i++) {
          if (TM.ballStep(sim, TM.DT * M.sf) & TM.EV_BOUNCE) {
            show = !sim.netted && TM.sideOf(sim.x) === to;
            break;
          }
        }
        if (show) ring.position.set(sim.x, 0.02, sim.z);
      }
    }
    const want = show ? 0.75 : 0;
    ring.material.opacity += (want - ring.material.opacity) * damp(10, dt);
    ring.visible = ring.material.opacity > 0.02;
    ring.scale.setScalar(1 + Math.sin(G.time * 8) * 0.08);
  }

  function updateCamera(dt) {
    if (G.look) {
      // a fixed close-up for checking poses (game.look)
      const [x, y, d] = G.look;
      camera.position.set(x, y + d * 0.1, d);
      camera.lookAt(x, y, 0);
      camera.updateMatrixWorld();
      return;
    }
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const aspect = w / h;
    const tanH = Math.tan((camera.fov * PI) / 360);
    // fit about 19.5 m of court across the screen, but never less than 8.6 m top to bottom
    let dist = Math.max(19.5 / (2 * tanH * aspect), 8.6 / (2 * tanH));
    const b = M.ball;
    const serving = M.phase === 'serve' || M.phase === 'toss';
    if (serving) dist *= 0.95;
    const visH = 2 * dist * tanH;
    const tx = M.phase === 'rally' || serving ? clamp(b.x * 0.08, -0.7, 0.7) : 0;
    const ty = 2.0 + Math.max(0, visH - 11) * 0.25 + Math.max(0, b.y - 4.2) * 0.35;
    cam.x += (tx - cam.x) * damp(1.6, dt);
    cam.look += (ty - cam.look) * damp(2, dt);
    G.shake = Math.max(0, G.shake - dt);
    const sh = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 0.5 : 0;
    camera.position.set(cam.x + sh, cam.look + dist * Math.tan(0.14) + sh * 0.5, dist);
    camera.lookAt(cam.x, cam.look, 0);
    camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- HUD

  function setupHud() {
    ui.p.forEach((u, side) => {
      const v = views[side];
      u.face.src = portraits[v.id] || '';
      u.name.textContent = v.entry.name;
      u.who.textContent = G.who[side] === 'human' ? (G.mode === '2p' ? `${side + 1}P` : '1P') : 'CPU';
      u.budImg.src = portraits[buds[side].id] || '';
      u.budKey.textContent = G.who[side] !== 'human' ? 'CPU' : G.mode === '2p' ? (side === 0 ? 'T' : 'Enter') : 'T';
      u.budWrap.title = `Call ${buds[side].entry.name} (${u.budKey.textContent})`;
      u.sets.classList.toggle('solo', M.bestOf === 1);
      u.lastPts = -1;
    });
    $('budBtn').querySelector('img').src = portraits[buds[0].id] || '';
    $('budBtn').querySelector('small').textContent = buds[0].entry.name;
    ui.goal.textContent = M.bestOf === 3 ? `FIRST TO ${K.TO_WIN} · BEST OF 3` : `FIRST TO ${K.TO_WIN}, WIN BY ${K.BY}`;
  }

  function nudge(side) {
    const el = ui.p[side].budWrap;
    el.classList.remove('no');
    void el.offsetWidth;
    el.classList.add('no');
  }

  const projV = new T.Vector3();
  function updateHud() {
    if (G.attract || !M || G.screen === 'title' || G.screen === 'select') return;
    ui.setNo.textContent = `SET ${M.setNo}`;
    ui.p.forEach((u, side) => {
      const pts = M.score[side];
      if (u.lastPts !== pts) {
        if (u.lastPts >= 0 && pts > u.lastPts) {
          u.pts.classList.remove('bump');
          void u.pts.offsetWidth;
          u.pts.classList.add('bump');
        }
        u.lastPts = pts;
        u.pts.textContent = pts;
      }
      u.srv.classList.toggle('on', M.server === side && M.phase !== 'over');
      u.setPips.forEach((el, i) => el.classList.toggle('on', i < M.sets[side]));
      const bd = M.b[side];
      let fill = 1;
      if (bd.on) fill = clamp(1 - bd.t / K.BUD_OUT, 0, 1);
      else if (bd.rest > 0) fill = 1 - bd.rest / Math.max(1, bd.restLen);
      u.budWrap.classList.toggle('on', bd.on);
      u.budWrap.classList.toggle('rest', !bd.on && bd.rest > 0);
      u.bud.style.setProperty('--fill', fill.toFixed(3));
      if (side === 0) {
        ui.budBtn.classList.toggle('on', bd.on);
        ui.budBtn.classList.toggle('rest', !bd.on && bd.rest > 0);
        ui.budBtn.style.setProperty('--fill', fill.toFixed(3));
      }
    });
    // "press F to serve" over a human server who has to serve by hand
    const sv = M.server;
    const need = M.phase === 'serve' && M.t > K.SERVE_WALK + 20 && G.who[sv] === 'human' && !M.p[sv].auto && G.screen === 'play';
    ui.serveHint.classList.toggle('hidden', !need);
    if (need) {
      const p = M.p[sv];
      projV.set(p.x, 2.9, p.z).project(camera);
      ui.serveHint.style.left = `${((projV.x + 1) / 2) * window.innerWidth}px`;
      ui.serveHint.style.top = `${((1 - projV.y) / 2) * window.innerHeight}px`;
      const key = isTouch && G.mode === '1p' ? 'Tap 🎾 to serve' : G.mode === '2p' ? `Press <kbd>${sv === 0 ? 'F' : 'L'}</kbd> to serve` : 'Press <kbd>F</kbd> to serve';
      if (ui.serveHint.dataset.k !== key) {
        ui.serveHint.dataset.k = key;
        ui.serveHint.innerHTML = key;
      }
    }
  }

  function call(text, sub, kind) {
    const el = ui.call;
    el.querySelector('b').textContent = text;
    el.querySelector('small').textContent = sub || '';
    el.className = 'call';
    void el.offsetWidth;
    el.className = 'call show ' + (kind || '');
  }

  function shotCallout(side, text) {
    if (G.attract) return;
    const el = ui.shot[side];
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function toast(text, cls) {
    if (G.attract) return;
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    ui.toasts.appendChild(el);
    setTimeout(() => el.remove(), 1900);
    while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  }

  function banner(text, kind, secs) {
    if (G.attract) return;
    const el = ui.banner;
    el.textContent = text;
    el.className = 'banner ' + (kind || '');
    void el.offsetWidth;
    el.className = 'banner show ' + (kind || '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'banner ' + (kind || ''); }, (secs || 1.5) * 1000);
  }

  // ---------------------------------------------------------------- screens

  function show(name) {
    G.screen = name;
    for (const id of ['title', 'select', 'pause', 'results']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', name !== 'play' && name !== 'pause');
    $('touch').classList.toggle('hidden', !(isTouch && G.mode === '1p' && (name === 'play')));
    $('menuMute').classList.toggle('hidden', name === 'play');
    if (name !== 'play') ui.serveHint.classList.add('hidden');
  }

  function toTitle() {
    show('title');
    if (!G.attract) startAttract();
    Kit.sound.music('title');
    renderOpts();
  }

  function renderOpts() {
    document.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.level === G.level)));
    document.querySelectorAll('[data-sets]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.sets === G.sets)));
    $('autoBtn').setAttribute('aria-checked', String(G.autoServe));
    $('autoSub').textContent = G.autoServe ? 'on: serves by itself' : 'off: you press swing';
  }

  function setOpt(k, v) {
    G[k] = v;
    store.set(k === 'autoServe' ? 'auto' : k, v);
    renderOpts();
  }

  function toSelect(mode) {
    G.mode = mode;
    G.selSide = 0;
    G.locked = [false, false];
    G.vsT = 0;
    show('select');
    renderSelect();
  }

  function renderSelect() {
    const two = G.mode === '2p';
    ui.selTitle.textContent = two ? 'PICK YOUR PLAYERS' : G.selSide === 0 ? 'PICK YOUR PLAYER' : 'WHO DO YOU PLAY?';
    ui.vs.forEach((u, side) => {
      const id = G.picks[side], e = Kit.roster.get(id);
      const bud = Kit.roster.get(Kit.roster.buddyFor(id));
      u.img.src = portraits[id] || '';
      u.name.textContent = e.name;
      u.who.textContent = two ? `${side + 1}P` : side === 0 ? 'YOU' : 'CPU';
      u.palImg.src = portraits[bud.id] || '';
      u.palName.textContent = bud.name;
      u.box.classList.toggle('locked', two ? G.locked[side] : !two && G.selSide > side);
    });
    ui.cards.forEach((c) => {
      const id = c.dataset.id;
      c.classList.toggle('p0', G.picks[0] === id);
      c.classList.toggle('p1', G.picks[1] === id);
      c.classList.toggle('c0', !two && G.selSide === 0 && G.picks[0] === id);
      c.classList.toggle('c1', (!two && G.selSide === 1 && G.picks[1] === id) || (two && !G.locked[1] && G.picks[1] === id));
      if (two && !G.locked[0] && G.picks[0] === id) c.classList.add('c0');
    });
    ui.vsMid.classList.toggle('go', G.vsT > 0);
  }

  function pickCard(id, side) {
    if (id === 'random') id = Kit.gfx.pick(ROSTER().map((e) => e.id));
    G.picks[side] = id;
    if (id === 'zombie') sound(() => Kit.sound.groan());
    Kit.sound.click();
  }

  function clickCard(i) {
    const id = ui.cards[i].dataset.id;
    if (G.mode === '2p') {
      // tap: the first unlocked player picks it and locks
      const side = !G.locked[0] ? 0 : !G.locked[1] ? 1 : 1;
      pickCard(id, side);
      G.locked[side] = true;
      if (G.locked[0] && G.locked[1]) G.vsT = 0.9;
    } else {
      pickCard(id, G.selSide);
      if (G.selSide === 0) G.selSide = 1;
      else G.vsT = 0.9;
    }
    renderSelect();
  }

  function moveCursor(side, d) {
    const ids = ROSTER().map((e) => e.id);
    const s = G.mode === '2p' ? side : G.selSide;
    if (G.mode === '2p' && G.locked[s]) return;
    const i = (ids.indexOf(G.picks[s]) + d + ids.length) % ids.length;
    G.picks[s] = ids[i];
    Kit.sound.click();
    renderSelect();
  }

  function confirmPick(side) {
    if (G.mode === '2p') {
      G.locked[side] = !G.locked[side];
      if (G.locked[0] && G.locked[1]) G.vsT = 0.9;
    } else if (G.selSide === 0) G.selSide = 1;
    else G.vsT = 0.9;
    Kit.sound.click();
    renderSelect();
  }

  function unpick() {
    if (G.vsT > 0) G.vsT = 0;
    if (G.mode === '1p' && G.selSide === 1) G.selSide = 0;
    else if (G.mode === '2p' && (G.locked[0] || G.locked[1])) G.locked = [false, false];
    else return toTitle();
    renderSelect();
  }

  function togglePause() {
    if (G.screen === 'play') {
      show('pause');
      Kit.sound.music('pause');
    } else if (G.screen === 'pause') {
      show('play');
      Kit.sound.music('play');
      last = performance.now();
    }
  }

  function showResults() {
    const w = M.winner >= 0 ? M.winner : M.score[0] >= M.score[1] ? 0 : 1;
    const v = views[w];
    ui.resFace.src = portraits[v.id] || '';
    ui.resTitle.textContent = `${v.entry.name} WINS!`;
    const sets = M.setScores.map(([a, b]) => `${a}–${b}`).join(', ');
    ui.resSub.textContent = G.mode === '2p' ? `${nameOf(0)} vs ${nameOf(1)}: ${sets}` : G.who[w] === 'human' ? `You won ${sets}! 🎉` : `${sets}. Good try! Call your brother next time 😉`;
    const s = M.stats;
    const rows = [['points', 'points'], ['aces', 'aces 🎯'], ['smashes', 'smashes 💥'], ['saves', 'saves by a buddy'], ['treats', 'treats 🍦']];
    ui.resStats.innerHTML = `<span></span><span class="h">${nameOf(0)}</span><span class="h">${nameOf(1)}</span>` +
      rows.map(([k, label]) => `<span class="l">${label}</span><span>${s[0][k]}</span><span>${s[1][k]}</span>`).join('') +
      `<span class="l">longest rally</span><span>${M.longest}</span><span>hits</span>`;
    show('results');
    Kit.sound.music('over');
  }

  function rematch() {
    if (!G.lastMatch) return toTitle();
    startMatch(G.lastMatch.chars, G.lastMatch.who, false);
    show('play');
    Kit.sound.music('play');
  }

  function bindMenus() {
    const tap = (id, fn) => $(id).addEventListener('click', (e) => {
      Kit.sound.init();
      Kit.sound.click();
      fn(e);
      e.currentTarget.blur();
    });
    tap('play1', () => toSelect('1p'));
    tap('play2', () => toSelect('2p'));
    document.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { Kit.sound.init(); Kit.sound.click(); setOpt('level', b.dataset.level); }));
    document.querySelectorAll('[data-sets]').forEach((b) => b.addEventListener('click', () => { Kit.sound.init(); Kit.sound.click(); setOpt('sets', +b.dataset.sets); }));
    tap('autoBtn', () => setOpt('autoServe', !G.autoServe));
    tap('selBack', unpick);
    tap('selGo', () => { G.vsT = 0.01; });
    tap('pauseBtn', togglePause);
    tap('resumeBtn', togglePause);
    tap('quitBtn', toTitle);
    tap('againBtn', rematch);
    tap('newBtn', () => toSelect(G.mode));
    tap('menuBtn', toTitle);
    ui.cards.forEach((c, i) => c.addEventListener('click', () => { Kit.sound.init(); clickCard(i); }));
    document.querySelectorAll('.muteBtn').forEach((b) => b.addEventListener('click', () => { Kit.sound.init(); Kit.sound.toggleMute(); updateMute(); b.blur(); }));
    window.addEventListener('pointerdown', () => Kit.sound.init(), { capture: true });
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      Kit.sound.init();
      const c = e.code;
      if (c === 'KeyM') {
        Kit.sound.toggleMute();
        updateMute();
        return;
      }
      if (G.screen === 'title') {
        if (c === 'Enter' || c === 'Digit1' || c === 'Space') toSelect('1p');
        else if (c === 'Digit2') toSelect('2p');
        else if (c === 'ArrowLeft' || c === 'ArrowRight') setOpt('level', G.level === 'easy' ? 'normal' : 'easy');
        else if (c === 'Digit3') setOpt('sets', G.sets === 1 ? 3 : 1);
      } else if (G.screen === 'select') {
        if (e.repeat) return;
        if (c === 'Escape') unpick();
        else if (c === 'KeyA') moveCursor(0, -1);
        else if (c === 'KeyD') moveCursor(0, 1);
        else if (c === 'ArrowLeft') moveCursor(1, -1);
        else if (c === 'ArrowRight') moveCursor(1, 1);
        else if (c === 'KeyF' || c === 'Space') confirmPick(0);
        else if (c === 'KeyL') confirmPick(1);
        else if (c === 'Enter') {
          if (G.mode === '1p') confirmPick(0);
          else G.vsT = 0.01;
        }
      } else if (G.screen === 'play') {
        if (c === 'KeyP' || c === 'Escape') togglePause();
      } else if (G.screen === 'pause') {
        if (c === 'KeyP' || c === 'Escape' || c === 'Space') togglePause();
        else if (c === 'KeyQ') toTitle();
      } else if (G.screen === 'results') {
        if (c === 'Enter' || c === 'Space') rematch();
        else if (c === 'KeyC') toSelect(G.mode);
        else if (c === 'Escape') toTitle();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        Kit.sound.suspend && Kit.sound.suspend();
        if (G.screen === 'play' && !G.testing) togglePause();
      } else Kit.sound.resume && Kit.sound.resume();
    });
  }

  function updateMute() {
    document.querySelectorAll('.muteBtn').forEach((b) => { b.textContent = Kit.sound.isMuted() ? '🔇' : '🔊'; });
  }

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight); // a hidden pane can report 0
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- boot

  function buildDom() {
    ui.p = [0, 1].map((side) => {
      const root = $('p' + side);
      return {
        root, face: root.querySelector('.face img'), name: root.querySelector('.nm'), who: root.querySelector('.who'),
        srv: root.querySelector('.srv'), pts: root.querySelector('.pts'), sets: root.querySelector('.sets'),
        setPips: [...root.querySelectorAll('.sets i')], budWrap: root.querySelector('.bud'), bud: root.querySelector('.bud i'),
        budImg: root.querySelector('.bud img'), budKey: root.querySelector('.bud .k'), lastPts: -1,
      };
    });
    Object.assign(ui, {
      setNo: $('setNo'), goal: $('goal'), call: $('call'), shot: [$('shot0'), $('shot1')], toasts: $('toasts'), banner: $('banner'),
      serveHint: $('serveHint'), budBtn: $('budBtn'), selTitle: $('selTitle'), vsMid: $('vsMid'),
      resTitle: $('resTitle'), resSub: $('resSub'), resFace: $('resFace'), resStats: $('resStats'),
    });
    ui.vs = [0, 1].map((side) => {
      const box = $('vs' + side);
      return {
        box, img: box.querySelector(':scope > img'), name: box.querySelector('.nm'), who: box.querySelector('.who'),
        palImg: box.querySelector('.pal img'), palName: box.querySelector('.pal b'),
      };
    });
    const grid = $('cards');
    for (const e of ROSTER()) {
      const b = document.createElement('button');
      b.className = 'card';
      b.dataset.id = e.id;
      b.innerHTML = `<img alt="" src="${portraits[e.id] || ''}"><span class="nm">${e.name}</span><span class="tg t0">1P</span><span class="tg t1">2P</span>`;
      grid.appendChild(b);
    }
    const r = document.createElement('button');
    r.className = 'card random';
    r.dataset.id = 'random';
    r.innerHTML = '<span class="q">?</span><span class="nm">RANDOM</span><span class="tg t0">1P</span><span class="tg t1">2P</span>';
    grid.appendChild(r);
    ui.cards = [...grid.querySelectorAll('.card')];
    I.bindTouch([...document.querySelectorAll('#touch .tb')]);
    // the logo comes from the title constant: 'Tennis: Teddy & Tommy' -> big TENNIS, small TEDDY & TOMMY
    const [big, small] = (window.TT_TITLE || 'Tennis').split(/:\s*/);
    $('logo2').textContent = big.toUpperCase();
    $('logo1').textContent = (small || '').toUpperCase();
    if (!small) $('logo1').remove();
    updateMute();
  }

  async function boot() {
    try {
      await Promise.race([document.fonts.load('64px Bungee'), new Promise((r) => setTimeout(r, 1500))]);
    } catch (e) { /* system fonts it is */ }
    const canvas = $('game');
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      $('loading').textContent = 'This browser can’t run WebGL, so the game can’t start.';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    scene.background = new T.Color('#a9dcff');
    scene.fog = new T.Fog('#cfeeff', 45, 120);
    camera = new T.PerspectiveCamera(30, 1, 0.1, 300);
    scene.add(new T.HemisphereLight('#e6f4ff', '#6f8f4a', 0.85));
    sun = new T.DirectionalLight('#fff1d6', 1.2);
    sun.position.set(-4, 14, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -8, near: 1, far: 45 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    stage = window.TTStage.build(scene, K, (window.TT_TITLE || 'Tennis').split(':')[0]);
    FX.init(scene);
    ballFx = FX.makeBall(K.R);

    portraits = Kit.portraits(ROSTER(), { size: 160 });
    buildDom();
    bindMenus();
    resize();
    window.addEventListener('resize', resize);
    startAttract();
    toTitle();
    $('loading').remove();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- console hooks for testing

  window.game = {
    get state() {
      if (!M) return null;
      return {
        screen: G.screen, phase: M.phase, score: M.score.slice(), sets: M.sets.slice(), setNo: M.setNo, server: M.server,
        rally: M.rallyHits, attract: G.attract, ball: { x: +M.ball.x.toFixed(2), y: +M.ball.y.toFixed(2), last: M.ball.lastHitter },
        players: M.p.map((p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), swing: p.swingT })),
        buds: M.b.map((b) => ({ on: b.on, t: +b.t.toFixed(2), mode: b.mode, x: +b.x.toFixed(2), saved: b.saveUsed, rest: b.rest })),
      };
    },
    get M() { return M; },
    G,
    // Advance `seconds` of game time right now, drawing every frame (works while the pane's rAF is throttled).
    step(seconds = 1) {
      G.testing = true;
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) {
        advance(1 / 60);
        render(1 / 60);
      }
      return this.state;
    },
    // Stop the live loop so only step() moves time (for setting up a screenshot).
    hold(on = true) { G.hold = on; G.testing = true; return on; },
    freeze(on = true) { G.frozen = on; return on; },
    // A fixed close-up camera: game.look(-3, 1.2, 7); game.look() goes back to the game camera.
    look(x, y, d) { G.look = x === undefined ? null : [x, y, d]; return G.look; },
    // Jump straight into a match: game.start({ p1: 'teddy', p2: 'tommy', mode: '1p', level: 'easy', sets: 1, auto: true })
    start(o = {}) {
      G.testing = true;
      G.mode = o.mode || '1p';
      if (o.level) G.level = o.level;
      if (o.sets) G.sets = o.sets;
      if (o.auto !== undefined) G.autoServe = o.auto;
      G.picks = [o.p1 || 'teddy', o.p2 || 'tommy'];
      startGame();
      return this.state;
    },
    // Hold keys for a side for some frames: game.press(0, { swing: true }) or game.press(0, { right: true }, 30)
    press(side, keys, frames = 1) {
      const orig = brains[side];
      let n = frames;
      brains[side] = (m, s) => {
        if (--n <= 0) brains[side] = orig;
        return Object.assign(TM.blankInput(), keys);
      };
    },
    // Call a side's companion, as if T (P1) or Enter (P2) was pressed.
    buddy(side = 0) { this.press(side, { call: true }); return this.step(1 / 60).buds[side]; },
    // Play a celebration on a side: game.celebrate(0, 'boxing' | 'jumpshot' | 'peace' | 'wave')
    celebrate(side, cel) {
      const v = views[side];
      Object.assign(v, { cel: cel || Kit.roster.signature(v.entry, 'hello'), celT: 1.9, t: 0, shot: false });
      return v.cel;
    },
    // Let the CPU play a side (e.g. game.cpu(0, 'normal') to watch two CPUs in a real match).
    cpu(side, level = 'normal') { brains[side] = C.brain(level); G.who[side] = level; },
    sim: C.sim, soak: C.soak, versus: C.versus,
    toTitle, toSelect, pick: clickCard, showResults, togglePause,
    get camera() { return camera; },
  };

  boot();
})();
