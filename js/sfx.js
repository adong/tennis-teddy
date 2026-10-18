/* Teddy & Tommy Tennis: tennis sounds, made from Kit.sound.tone / hiss (no audio files). */
(function () {
  'use strict';
  const S = window.Kit.sound;

  window.TTSfx = {
    // racket on ball: a hollow "pock"; harder shots are louder and lower
    pock(power = 0.5) {
      S.tone({ type: 'triangle', f: 760 - power * 200, to: 420, dur: 0.07, vol: 0.28 + power * 0.18 });
      S.hiss({ filter: 'highpass', f: 2500, dur: 0.04, vol: 0.14 + power * 0.1 });
    },
    smash() {
      S.tone({ type: 'square', f: 300, to: 90, dur: 0.18, vol: 0.2, lp: 1600 });
      S.hiss({ filter: 'lowpass', f: 3500, to: 500, dur: 0.25, vol: 0.32 });
      S.tone({ type: 'triangle', f: 600, to: 300, dur: 0.08, vol: 0.32 });
    },
    bounce(v = 1) {
      S.tone({ type: 'sine', f: 240, to: 150, dur: 0.07, vol: Math.min(0.3, 0.08 + v * 0.025) });
    },
    net() {
      S.hiss({ filter: 'lowpass', f: 900, to: 300, dur: 0.25, vol: 0.3 });
      S.tone({ type: 'sine', f: 140, to: 90, dur: 0.2, vol: 0.2 });
    },
    swing() {
      S.hiss({ filter: 'bandpass', f: 900, to: 2600, q: 1.4, dur: 0.16, vol: 0.12 });
    },
    toss() {
      S.tone({ type: 'sine', f: 400, to: 700, dur: 0.12, vol: 0.08 });
    },
    // a ding-dong for each point, a happy run for your side
    point(good) {
      const notes = good ? [659, 784, 1047] : [523, 392];
      notes.forEach((f, i) => S.tone({ type: 'triangle', f, at: i * 0.09, dur: 0.2, vol: 0.14 }));
    },
    // the crowd: a burst of filtered noise with a wobble
    cheer(vol = 1) {
      for (let i = 0; i < 6; i++) S.hiss({ filter: 'bandpass', f: 900 + Math.random() * 900, q: 0.8, at: i * 0.07, dur: 0.5, vol: 0.05 * vol });
    },
    aww() {
      S.tone({ type: 'sawtooth', f: 330, to: 220, dur: 0.5, vol: 0.05, lp: 900 });
    },
    whistle() {
      S.tone({ type: 'sine', f: 2100, dur: 0.12, vol: 0.12 });
      S.tone({ type: 'sine', f: 2300, at: 0.14, dur: 0.3, vol: 0.12 });
    },
    fanfare() {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => S.tone({ type: 'square', f, at: i * 0.12, dur: 0.18, vol: 0.07, lp: 2400 }));
      S.tone({ type: 'triangle', f: 1047, at: 0.75, dur: 0.6, vol: 0.12 });
    },
    boing() {
      S.tone({ type: 'sine', f: 220, to: 660, dur: 0.18, vol: 0.14 });
    },
    nope() {
      S.tone({ type: 'square', f: 180, dur: 0.08, vol: 0.06, lp: 900 });
    },
  };
})();
