#!/usr/bin/env node
/* Headless CPU-vs-CPU matches, to show that every match finishes. It loads the same engine files the page uses
   (js/match.js, js/cpu.js, and the kit roster for the companions) into node, with no browser.

   node tools/soak.js                 200 random matches (CPUs and test bots, one set or best of 3)
   node tools/soak.js 50 --max 600    proves the check can fail: matches cut off after 10 s are reported unfinished
   node tools/soak.js --versus kid easy 100     win counts for one pairing
   Exit code 1 if any match didn't finish or threw. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..');
const ctx = { console, Math, Date };
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.Kit = {};
vm.createContext(ctx);
for (const f of ['kit/roster.js', 'js/match.js', 'js/cpu.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}

const args = process.argv.slice(2);
const flag = (name, d) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : d;
};

if (args[0] === '--versus') {
  const [a, b, n] = args.slice(1);
  const levels = [a, b];
  const res = ctx.TTCPU.versus(a, b, +(n || 50), { level: flag('--level', levels.includes('easy') ? 'easy' : 'normal') });
  console.log(JSON.stringify(res));
  process.exit(0);
}

const n = +(args.find((a) => /^\d+$/.test(a)) || 200);
const maxFrames = +flag('--max', 0) || undefined;
const t0 = Date.now();
const res = ctx.TTCPU.soak(n, { maxFrames });
res.seconds = +((Date.now() - t0) / 1000).toFixed(1);
console.log(JSON.stringify(res, null, 1));
process.exit(res.ok ? 0 : 1);
