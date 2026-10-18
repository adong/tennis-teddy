/* Teddy & Tommy Tennis: the computer players, two test bots, and the headless match runner.
   A brain is a function (M, side) -> input for one frame. The CPU looks ahead along the ball (TTMatch.plan), runs
   to a spot and swings at the moment that gives the shot it wants. Its mistakes are made on purpose, as a person
   would make them: it reacts late, stands a bit off, swings a bit early or late, and sometimes misses outright.
   Runs in the browser and in node (tools/soak.js). */
(function (root) {
  'use strict';
  const TM = root.TTMatch, K = TM.K, DT = TM.DT;

  // The two levels. react: frames before it starts running; err: how far off its spot (m); jitter: swing timing
  // (frames); miss: chance it swings at the wrong moment; speed: running speed; smash: chance it jumps for a high
  // ball; power: chance of a power serve; smart: lets balls go that will land out; aimAtYou: hits back to you.
  const LEVELS = {
    easy: { react: 26, err: 0.4, jitter: 3, miss: 0.2, speed: 0.72, smash: 0, power: 0, smart: 0, aimAtYou: true, serveDelay: [50, 80], calls: false },
    normal: { react: 14, err: 0.2, jitter: 2, miss: 0.12, speed: 0.86, smash: 0.7, power: 0.4, smart: 0.6, aimAtYou: false, serveDelay: [30, 60], calls: true },
  };
  const TAU = { drop: 0.14, drive: 0.46, lob: 0.8, cross: 0.8 };
  // Test stand-in for an 8-year-old who really plays: runs to the ball and times the swing, but late and loose,
  // with no aim (a human's shots land wherever the timing sends them).
  const EIGHT = { react: 20, err: 0.35, jitter: 4, miss: 0.14, speed: 1, smash: 0.3, power: 0.2, smart: 0, aimAtYou: false, noAim: true, serveDelay: [40, 70], calls: false };

  function gauss(r) {
    return (r() + r() + r() - 1.5) / 0.5; // about -3..3, sd ~1
  }

  function brain(level, seed) {
    const L = level === 'eight' ? EIGHT : level === 'eightBud' ? Object.assign({}, EIGHT, { always: true }) : LEVELS[level] || LEVELS.normal;
    const r = TM.rng(seed != null ? seed : (Math.random() * 2 ** 31) | 0);
    const st = { hitId: -1, wait: 0, plan: null, serveAt: -1, power: null, nextCall: 0 };
    return function (M, side) {
      const inp = TM.blankInput();
      const me = M.p[side], foe = M.p[1 - side], b = M.ball, f = me.f;
      let target = (side === 0 ? -1 : 1) * (K.HALF - 0.4);
      // serving: wait a moment, toss, and (sometimes) hit it at the top for a power serve
      if (M.phase === 'serve' && M.server === side && M.t >= K.SERVE_WALK) {
        if (st.serveAt < 0) st.serveAt = M.frame + L.serveDelay[0] + Math.floor(r() * (L.serveDelay[1] - L.serveDelay[0]));
        if (M.frame >= st.serveAt) inp.swing = true;
      } else if (M.phase !== 'serve') st.serveAt = -1;
      if (M.phase === 'toss' && M.server === side) {
        if (st.power === null) st.power = r() < L.power;
        if (st.power && Math.abs(b.vy) < 1.0) inp.swing = true;
      } else st.power = null;
      if (L.always && !M.b[side].on && M.b[side].rest <= 0) inp.call = true;
      // the companion: the Normal CPU calls him in when it's behind
      if (L.calls && M.phase === 'serve' && M.frame >= st.nextCall && M.score[1 - side] - M.score[side] >= 2 && !M.b[side].on && M.b[side].rest <= 0) {
        inp.call = true;
        st.nextCall = M.frame + 60 * 30;
      }
      if (M.phase === 'rally' && b.lastHitter !== side && !b.netted) {
        if (st.hitId !== M.hitId) {
          st.hitId = M.hitId;
          st.plan = null;
          st.wait = L.react + Math.floor(r() * 6);
        }
        if (st.wait > 0) st.wait--;
        else if (!st.plan) st.plan = think(M, side, L, r);
      } else if (M.phase !== 'rally' || b.lastHitter === side) st.plan = null;
      const pl = st.plan;
      if (pl && !pl.letGo) target = pl.x;
      if (M.phase === 'serve' || M.phase === 'toss' || M.phase === 'rally') {
        const d = target - me.x;
        if (Math.abs(d) > 0.1) inp[d > 0 ? 'right' : 'left'] = true;
      }
      if (pl && !pl.letGo) {
        if (M.frame === pl.pressAt) inp.swing = true;
        if (pl.jumpAt >= 0 && M.frame === pl.jumpAt) inp.jump = true;
        if (pl.shot === 'cross' && M.frame >= pl.pressAt) inp[f > 0 ? 'right' : 'left'] = true;
        inp.aim = pl.aim;
      }
      return inp;
    };
  }

  // Pick a shot, plan the return, then spoil it a little.
  function think(M, side, L, r) {
    const me = M.p[side], foe = M.p[1 - side];
    const fx = Math.abs(foe.x);
    let shot;
    if (L.noAim) shot = ['drive', 'drive', 'lob', 'drop', 'cross'][Math.floor(r() * 5)];
    else if (L.aimAtYou) shot = r() < 0.65 ? 'drive' : 'lob';
    else if (fx < 3.2) shot = 'lob';
    else if (fx > 5.4 && r() < 0.35) shot = 'drop';
    else shot = r() < 0.5 ? 'cross' : 'drive';
    let pl = TM.plan(M, me, { tau: TAU[shot], smash: r() < L.smash });
    if (pl && pl.late && shot !== 'drive') {
      shot = 'drive';
      pl = TM.plan(M, me, { tau: TAU.drive, smash: false }) || pl;
    }
    if (!pl) return null;
    if (pl.out && r() < L.smart) return { letGo: true };
    pl.shot = pl.smash ? 'smash' : shot;
    // under pressure (a long run, or only just in time) it gets sloppier
    const rushed = pl.late || pl.slack < 12 ? 1 : 0;
    pl.x += gauss(r) * (L.err + rushed * 0.25);
    pl.pressAt += Math.round((r() * 2 - 1) * (L.jitter + rushed * 3));
    if (r() < L.miss) {
      // a clean miss: it runs to a spot a bit off and then just watches the ball go by
      pl.x -= me.f * (0.4 + r() * 0.6);
      pl.pressAt = -1;
    }
    // where to aim: the Easy CPU sends it back near you, the Normal one away from you
    if (L.noAim) pl.aim = null;
    else if (L.aimAtYou) pl.aim = TM.clamp(fx + (r() * 2 - 1) * 1.0, 2.5, 5.4);
    else pl.aim = fx > 4.2 ? 1.5 + r() * 2.2 : 4.8 + r() * 0.8;
    return pl;
  }

  // ---------------------------------------------------------------- test bots (stand-ins for real kids)

  // 'kid': wanders toward the ball now and then, jumps a lot, presses swing every 0.25-0.75 s, calls his brother.
  // 'masher': chases the ball and presses swing every 0.1-0.25 s.
  function bot(kind, seed) {
    const r = TM.rng(seed != null ? seed : (Math.random() * 2 ** 31) | 0);
    let next = 0, dir = 0, dirT = 0;
    return function (M, side) {
      const inp = TM.blankInput();
      const me = M.p[side], b = M.ball;
      if (M.frame >= next) {
        inp.swing = true;
        next = M.frame + (kind === 'masher' ? 6 + Math.floor(r() * 9) : 15 + Math.floor(r() * 30));
      }
      if (M.frame >= dirT) {
        dirT = M.frame + 12 + Math.floor(r() * 30);
        const chase = r() < (kind === 'masher' ? 0.9 : 0.55);
        dir = chase ? Math.sign(b.x - me.x - me.f * 0.6) : Math.floor(r() * 3) - 1;
      }
      if (dir < 0) inp.left = true;
      if (dir > 0) inp.right = true;
      if (kind === 'kid' && r() < 0.02) inp.jump = true;
      if (kind === 'kid' && r() < 0.002) inp.call = true;
      return inp;
    };
  }

  const brainFor = (who, seed) => (LEVELS[who] || who === 'eight' || who === 'eightBud' ? brain(who, seed) : bot(who, seed));

  // ---------------------------------------------------------------- headless matches

  // Build a match the way the game does: speeds and the little-kid assist come from who plays each side.
  function setup(o) {
    const easy = o.level === 'easy';
    const who = o.who || ['normal', 'normal'];
    const R = root.Kit && root.Kit.roster;
    const bud = (id) => (R ? R.buddyFor(id) : id === 'tommy' ? 'teddy' : 'tommy');
    const size = (id) => {
      const e = R && R.get(id);
      return (e && e.buddyScale) || (id === 'teddy' ? 0.85 : id === 'tommy' ? 0.72 : 0.8);
    };
    const chars = o.chars || ['teddy', 'tommy'];
    const buddies = chars.map(bud);
    return {
      chars, buddies, buddySize: buddies.map(size), sets: o.sets || 1, seed: o.seed,
      ballSpeed: easy ? 0.78 : 1,
      assist: who.map((w) => !LEVELS[w] && easy),
      speed: who.map((w) => (LEVELS[w] ? LEVELS[w].speed : 1)),
      autoServe: who.map(() => true),
      budRest: who.map((w) => (LEVELS[w] ? 60 * 25 : o.mode === '2p' ? 240 : 30)),
    };
  }

  // One whole match, as fast as it goes. Returns the result, or { finished: false } if it hit maxFrames.
  function sim(o = {}) {
    const seed = o.seed != null ? o.seed : (Math.random() * 2 ** 31) | 0;
    const M = TM.create(setup(Object.assign({}, o, { seed })));
    const who = o.who || ['normal', 'normal'];
    const brains = who.map((w, i) => brainFor(w, seed * 7 + i + 1));
    const maxFrames = o.maxFrames || 60 * 60 * 40;
    const points = [], rallies = [];
    let errors = 0;
    while (M.phase !== 'over' && M.frame < maxFrames) {
      try {
        M.step([brains[0](M, 0), brains[1](M, 1)]);
      } catch (e) {
        errors++;
        if (errors > 3) throw e;
      }
      for (const e of M.events) {
        if (e.type === 'point') {
          points.push(e.reason);
          rallies.push(e.rally);
        }
      }
    }
    const reasons = {};
    for (const p of points) reasons[p] = (reasons[p] || 0) + 1;
    return {
      finished: M.phase === 'over', winner: M.winner, sets: M.sets.slice(), setScores: M.setScores.slice(),
      points: points.length, minutes: +(M.frame / 3600).toFixed(1), reasons, longest: M.longest,
      avgRally: rallies.length ? +(rallies.reduce((a, b) => a + b, 0) / rallies.length).toFixed(1) : 0,
      stats: M.stats, errors, seed,
    };
  }

  // Many random matches: every one must finish. opts: { n, maxFrames, who, level, chars }
  function soak(n = 50, o = {}) {
    const ids = (root.Kit && root.Kit.roster && root.Kit.roster.list.map((e) => e.id)) || ['teddy', 'tommy', 'zoom', 'luna', 'bolt', 'bruno', 'zombie'];
    const pairs = [['normal', 'normal'], ['easy', 'easy'], ['normal', 'easy'], ['kid', 'easy'], ['kid', 'normal'], ['masher', 'normal'], ['kid', 'kid']];
    const out = { matches: 0, finished: 0, unfinished: [], points: 0, minutes: 0, reasons: {}, longest: 0, aces: 0, smashes: 0, saves: 0, treats: 0, errors: 0 };
    const r = TM.rng(o.seed || 12345);
    for (let i = 0; i < n; i++) {
      const who = o.who || pairs[i % pairs.length];
      const chars = o.chars || [ids[Math.floor(r() * ids.length)], ids[Math.floor(r() * ids.length)]];
      const level = o.level || (who.includes('easy') ? 'easy' : 'normal');
      const res = sim({ who, chars, level, sets: o.sets || (i % 3 === 0 ? 3 : 1), maxFrames: o.maxFrames, seed: Math.floor(r() * 1e9) });
      out.matches++;
      if (res.finished) out.finished++;
      else out.unfinished.push({ who, chars, seed: res.seed, points: res.points });
      out.points += res.points;
      out.minutes += res.minutes;
      out.longest = Math.max(out.longest, res.longest);
      out.errors += res.errors;
      for (const k in res.reasons) out.reasons[k] = (out.reasons[k] || 0) + res.reasons[k];
      for (const s of res.stats) {
        out.aces += s.aces;
        out.smashes += s.smashes;
        out.saves += s.saves;
        out.treats += s.treats;
      }
    }
    out.avgPoints = +(out.points / out.matches).toFixed(1);
    out.avgMinutes = +(out.minutes / out.matches).toFixed(1);
    out.minutes = +out.minutes.toFixed(1);
    out.ok = out.finished === out.matches && out.errors === 0;
    return out;
  }

  // Win counts for one pairing: versus('kid', 'easy', 100) -> { wins: [a, b] }
  function versus(a, b, n = 50, o = {}) {
    const wins = [0, 0];
    let points = [0, 0], minutes = 0;
    const r = TM.rng(o.seed || 777);
    for (let i = 0; i < n; i++) {
      const res = sim({ who: [a, b], chars: o.chars, level: o.level || (b === 'easy' || a === 'easy' ? 'easy' : 'normal'), sets: o.sets || 1, seed: Math.floor(r() * 1e9) });
      if (res.winner >= 0) wins[res.winner]++;
      points[0] += res.stats[0].points;
      points[1] += res.stats[1].points;
      minutes += res.minutes;
    }
    return { pairing: `${a} vs ${b}`, wins, points, avgMinutes: +(minutes / n).toFixed(1) };
  }

  root.TTCPU = { LEVELS, brain, bot, brainFor, setup, sim, soak, versus };
})(typeof window !== 'undefined' ? window : globalThis);
