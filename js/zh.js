/* 中文 for Tennis: Teddy & Tommy: the words on the page, the umpire's calls, toasts, the POW bursts and the ? panel
   (Kit.lang, from kit/lang.js). The kids' names, the game's name and logo, and the court's windscreen (the game's
   name and TEDDY ★ TOMMY) stay in English on purpose. */
(function () {
  const L = Kit.lang;
  L.keep([
    'TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'ZOOM', 'LUNA', 'BOLT', 'BRUNO',
    'Tennis: Teddy & Tommy', 'TEDDY & TOMMY', 'TENNIS', 'Claude Code', 'VS', 'Esc',
  ]);

  L.add({
    // names
    'ZOMBIE': '僵尸', 'CPU': '电脑', 'YOU': '你', 'RANDOM': '随机',
    // title screen
    'Smash, lob and drop shot in the park. Call your brother for doubles!': '在公园里扣杀、高吊、放小球！叫兄弟来打双打！',
    '▶ 1 PLAYER': '▶ 单人', 'you vs the computer': '你和电脑比赛', '👫 2 PLAYERS': '👫 双人', 'one keyboard, two kids': '一个键盘，两人一起玩',
    'LEVEL': '难度', 'Level': '难度', 'slow ball, big racket': '球慢，球拍大', 'full speed': '全速',
    'MATCH': '比赛', 'Match length': '比赛长度', 'ONE SET': '一盘', 'first to 7': '先得 7 分', 'BEST OF 3': '三盘两胜', 'win 2 sets': '先赢 2 盘',
    'SERVE': '发球', 'AUTO SERVE': '自动发球', 'off: you press swing': '关：按挥拍发球', 'on: serves by itself': '开：自己发球',
    'PLAYER 1': '玩家 1', 'PLAYER 2': '玩家 2', 'swing · serve': '挥拍 · 发球',
    'Swing early for a lob, on time for a drive, late for a drop shot. Jump + swing for a SMASH!':
      '早点挥拍是高吊球，准时是抽球，晚点是放小球。跳起来挥拍就是扣杀！',
    "Hold ◀ ▶ to run, ⤒ to jump and 🎾 to swing. Swing early for a lob, late for a drop shot, and jump for a smash. Tap your brother's face to call him in. Two players need a keyboard.":
      '按住 ◀ ▶ 跑，⤒ 跳，🎾 挥拍。早点挥拍是高吊球，晚点是放小球，跳起来能扣杀。点兄弟的头像叫他来帮忙。双人要用键盘。',
    // player select
    'PICK YOUR PLAYER': '选你的球员', 'PICK YOUR PLAYERS': '选球员', 'WHO DO YOU PLAY?': '你想和谁比？',
    'Players': '球员', '+ buddy': '+ 帮手', '◀ BACK': '◀ 返回', 'PLAY!': '开始！', 'Tap a player · keys: 1P': '点一个球员 · 按键：1P', 'back': '返回',
    // the match: HUD, buttons, tooltips
    'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', 'Sound on / off (M)': '声音 开 / 关 (M)', 'Sound on or off': '声音开关',
    'Run left': '向左跑', 'Run right': '向右跑', 'JUMP': '跳', 'SWING': '挥拍',
    'FIRST TO 7': '先得 7 分', 'FIRST TO 7, WIN BY 2': '先得 7 分，领先 2 分赢', 'FIRST TO 7 · BEST OF 3': '先得 7 分 · 三盘两胜',
    'Press': '按', 'to serve': '发球', 'Tap 🎾 to serve': '点 🎾 发球',
    // shots and points (the callouts by each player)
    'SMASH!': '扣杀！', 'JUMP SHOT SMASH!': '跳投扣杀！', 'DROP SHOT!': '放小球！', 'LOB!': '高吊球！', 'CROSS!': '斜线球！',
    'POWER SERVE!': '大力发球！', 'ACE!': '发球得分！', 'OUT!': '出界！', 'IN THE NET!': '下网啦！', 'OOPS!': '哎呀！',
    'LOB WINNER!': '高吊球得分！', 'WINNER!': '好球得分！',
    // the umpire's calls
    'DEUCE!': '平分！', 'SET POINT!': '盘点！', 'MATCH POINT!': '赛点！', 'GAME, SET & MATCH!': '比赛结束！', 'GAME & SET!': '赢下这一盘！',
    // POW bursts on the court (drawn on a canvas, through Kit.lang.t)
    'POCK!': '啪！', 'POP!': '啵！', 'THWACK!': '啪！', 'PLOP!': '噗！', 'BOING!': '嘣！', 'ZING!': '嗖！', 'WHAM!': '砰！',
    'SAVED!': '救到啦！', 'NET!': '下网！', 'SWISH!': '唰！进球！',
    // pause and results
    'P · Esc · Space to resume · Q for the menu · M sound': 'P · Esc · 空格 继续 · Q 回菜单 · M 声音',
    '↻ REMATCH': '↻ 再来一局', 'NEW PLAYERS': '换球员', 'Enter rematch · C new players · Esc menu': '回车 再来一局 · C 换球员 · Esc 菜单',
    'points': '得分', 'aces 🎯': '发球得分 🎯', 'smashes 💥': '扣杀 💥', 'saves by a buddy': '兄弟救球', 'treats 🍦': '零食 🍦',
    'longest rally': '最长回合', 'hits': '拍',
    // other screens
    'LOADING…': '加载中…', '↻ Turn sideways for a bigger court!': '↻ 横过来，球场更大！',
    'This browser can’t run WebGL, so the game can’t start.': '这个浏览器跑不了 WebGL，游戏开不了。',
    // the ? panel (js/keys.js)
    'P or Esc · M': 'P 或 Esc · M',
    'In 1 player both sets of keys work, and Space swings too. Swing early for a lob, on time for a drive, late for a drop shot.':
      '单人时两套按键都能用，空格也能挥拍。早点挥拍是高吊球，准时是抽球，晚点是放小球。',
    "Hold ◀ ▶ to run, then ⤒ JUMP and 🎾 SWING. Tap your brother's face to call him.": '按住 ◀ ▶ 跑，⤒ 跳，🎾 挥拍。点兄弟的头像叫他来帮忙。',
  });

  // a name, with a space after it when it stays in English letters (TEDDY 赢啦！), none when it's Chinese (僵尸赢啦！)
  const name = (n) => L.t(n);
  const who_ = (n) => (/[A-Za-z]$/.test(name(n)) ? name(n) + ' ' : name(n));
  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  // the umpire: "2–LOVE!", "LOVE ALL!", "3 ALL!", "ADVANTAGE TEDDY!" (love is 0)
  const n0 = (v) => (v === 'LOVE' ? '0' : v);
  L.rule(/^(\d+|LOVE)–(\d+|LOVE)!$/, (m, a, b) => `${n0(a)}–${n0(b)}！`);
  L.rule(/^(\d+|LOVE) ALL!$/, (m, a) => `${n0(a)} 平！`);
  L.rule(/^ADVANTAGE (.+)!$/, (m, who) => `${who_(who)}占先！`);
  L.rule(/^SET (\d+)$/, '第 $1 盘');
  // the companion
  L.rule(/^(.+)'S HERE! 👋$/, (m, who) => `${who_(who)}来啦！👋`);
  L.rule(/^(.+) SAVED IT!$/, (m, who) => `${who_(who)}救回来啦！`);
  L.rule(/^(TEDDY|TOMMY)!$/, '$1！');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (.+)!$/, (m, emoji, item, who) => `${emoji} ${who_(who)}送来的${TREAT[item]}！`);
  L.rule(/^Call (.+) \((.+)\)$/, (m, who, key) => `叫 ${who_(who)}来帮忙 (${L.t(key)})`);
  // winning
  L.rule(/^(.+) WINS!$/, (m, who) => `${who_(who)}赢啦！`);
  const sets = (sc) => sc.replace(/, /g, '，'); // "7–5, 4–7" -> "7–5，4–7"
  L.rule(/^You won (.*)! 🎉$/, (m, sc) => `你赢啦，${sets(sc)}！🎉`);
  L.rule(/^(.+)\. Good try! Call your brother next time 😉$/, (m, sc) => `${sets(sc)}。打得好！下次叫兄弟来帮忙 😉`);
  L.rule(/^(.+) vs (.+): (.+)$/, (m, a, b, sc) => `${name(a)} 对 ${name(b)}：${sets(sc)}`);
  L.rule(/^(TEDDY|TOMMY|ZOOM|LUNA|BOLT|BRUNO|ZOMBIE) (\d+–\d+)$/, (m, who, sc) => `${name(who)} ${sc}`);
})();
