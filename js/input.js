/* Teddy & Tommy Tennis: controls. The keyboard for one or two players, and big on-screen buttons for touch.
   Presses are latched until the engine's next frame reads them, so a tap shorter than one frame still counts.
   P1: A D move, W jump, F swing, T calls your brother.
   P2: ← → move, ↑ jump, L swing, Enter calls your brother.
   In 1-player mode both sets drive P1, and Space swings too. */
(function () {
  'use strict';

  const KEYS = {
    KeyA: [0, 'left'], KeyD: [0, 'right'], KeyW: [0, 'jump'], KeyF: [0, 'swing'], KeyT: [0, 'call'],
    ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], ArrowUp: [1, 'jump'], KeyL: [1, 'swing'],
    Enter: [1, 'call'], NumpadEnter: [1, 'call'], Space: [2, 'swing'],
  };
  const PRESS = { jump: 1, swing: 1, call: 1 };

  // held keys per player and per key, so letting go of one key doesn't cancel the same move held on another
  const held = [{}, {}, {}];
  const latched = [{}, {}, {}];
  const touch = { left: false, right: false };
  const touchLatched = {};
  let twoPlayer = false;

  function setKey(code, down, repeat) {
    const m = KEYS[code];
    if (!m) return false;
    const [side, act] = m;
    if (PRESS[act]) {
      if (down && !repeat) latched[side][act] = true;
    } else held[side][act + ':' + code] = down;
    return true;
  }

  function heldAct(side, act) {
    for (const k in held[side]) if (held[side][k] && k.startsWith(act + ':')) return true;
    return false;
  }

  // The input for one engine frame. Clears the presses it reports.
  function snapshot(side) {
    const srcs = side === 0 ? (twoPlayer ? [0] : [0, 1, 2]) : [1];
    const out = { left: false, right: false, jump: false, swing: false, call: false, aim: null };
    for (const s of srcs) {
      for (const a of ['left', 'right']) if (heldAct(s, a)) out[a] = true;
      for (const a in PRESS) {
        if (latched[s][a]) out[a] = true;
        latched[s][a] = false;
      }
    }
    if (side === 0) {
      if (touch.left) out.left = true;
      if (touch.right) out.right = true;
      for (const a in PRESS) {
        if (touchLatched[a]) out[a] = true;
        touchLatched[a] = false;
      }
    }
    return out;
  }

  // Is any key or button down right now? (for "press any key" moments)
  const anyLatched = (side) => !!(latched[side].swing || (side === 0 && (touchLatched.swing || latched[2].swing)));

  function clear() {
    for (const s of [0, 1, 2]) {
      for (const k in held[s]) held[s][k] = false;
      for (const k in latched[s]) latched[s][k] = false;
    }
    touch.left = touch.right = false;
    for (const a in touchLatched) touchLatched[a] = false;
  }

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (setKey(e.code, true, e.repeat) && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => setKey(e.code, false, false));
  window.addEventListener('blur', clear);

  // Touch: hold ◀ ▶ to run, tap ⤒ to jump and 🎾 to swing, and his face to call your brother.
  function bindTouch(buttons) {
    const capture = (el, e) => {
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not an active pointer (synthetic events) */ }
    };
    for (const b of buttons) {
      const act = b.dataset.act;
      const up = () => {
        if (act === 'left' || act === 'right') touch[act] = false;
        b.classList.remove('down');
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        capture(b, e);
        if (act === 'left' || act === 'right') touch[act] = true;
        else touchLatched[act] = true;
        b.classList.add('down');
      });
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    }
  }

  window.TTInput = {
    snapshot, clear, bindTouch, anyLatched, KEYS,
    setTwoPlayer(on) { twoPlayer = !!on; },
  };
})();
