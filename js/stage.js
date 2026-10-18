/* Teddy & Tommy Tennis: the park court. A blue hard court with white lines on a green lawn, the net, a fence with
   a green windscreen, trees, a little umpire's chair, bunting, a sky with clouds and hills.
   The net is at x = 0 and the court runs along x; the camera looks at it from +z. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit;
  const { makeCanvas, toTexture, std, shade, roundRect } = Kit.gfx;

  function box(w, h, d, mat, x, y, z, parent, shadow = true) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // The court surface as one painted canvas: lawn apron, blue court, white lines.
  function courtTexture(K, W, D) {
    const ppm = 64; // pixels per metre
    const [c, g] = makeCanvas(W * ppm, D * ppm);
    const X = (x) => (x + W / 2) * ppm, Z = (z) => (z + D / 2) * ppm;
    g.fillStyle = '#3f9a55';
    g.fillRect(0, 0, c.width, c.height);
    // a mown stripe pattern on the apron
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < c.width; x += ppm * 2) g.fillRect(x, 0, ppm, c.height);
    const half = K.HALF, side = 3.0;
    g.fillStyle = '#2f80d8';
    g.fillRect(X(-half - 1.6), Z(-side - 1.0), (half + 1.6) * 2 * ppm, (side + 1.0) * 2 * ppm);
    g.fillStyle = '#3a90e6';
    g.fillRect(X(-half), Z(-side), half * 2 * ppm, side * 2 * ppm);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 0.08 * ppm;
    g.strokeRect(X(-half), Z(-side), half * 2 * ppm, side * 2 * ppm);
    const svc = half * 0.58;
    g.beginPath();
    g.moveTo(X(-svc), Z(-side)); g.lineTo(X(-svc), Z(side));
    g.moveTo(X(svc), Z(-side)); g.lineTo(X(svc), Z(side));
    g.moveTo(X(-svc), Z(0)); g.lineTo(X(svc), Z(0));
    g.moveTo(X(-half), Z(0)); g.lineTo(X(-half + 0.3), Z(0));
    g.moveTo(X(half), Z(0)); g.lineTo(X(half - 0.3), Z(0));
    g.stroke();
    const t = toTexture(c);
    t.anisotropy = 16;
    return t;
  }

  function netTexture() {
    const [c, g] = makeCanvas(256, 64);
    g.strokeStyle = 'rgba(20,24,30,0.85)';
    g.lineWidth = 2;
    for (let x = 0; x <= 256; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
    for (let y = 0; y <= 64; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    const t = toTexture(c);
    t.wrapS = T.RepeatWrapping;
    return t;
  }

  function skyTexture() {
    const [c, g] = makeCanvas(1024, 512);
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#5fb2ff');
    gr.addColorStop(0.6, '#a9dcff');
    gr.addColorStop(1, '#e8f7ff');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 512);
    // fluffy clouds
    g.fillStyle = 'rgba(255,255,255,0.92)';
    const cloud = (x, y, s) => {
      for (const [dx, dy, r] of [[0, 0, 26], [28, -10, 30], [58, 0, 24], [26, 10, 24], [-24, 6, 18]]) {
        g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill();
      }
    };
    cloud(140, 110, 1.2); cloud(470, 70, 0.9); cloud(760, 130, 1.3); cloud(930, 60, 0.7); cloud(330, 190, 0.7);
    // far hills
    g.fillStyle = '#8fd08a';
    g.beginPath(); g.moveTo(0, 512);
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, 400 - Math.sin(x / 140) * 26 - Math.sin(x / 57) * 10);
    g.lineTo(1024, 512); g.fill();
    g.fillStyle = '#74bf72';
    g.beginPath(); g.moveTo(0, 512);
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, 440 - Math.sin(x / 90 + 1) * 18);
    g.lineTo(1024, 512); g.fill();
    return toTexture(c);
  }

  function fenceTexture() {
    const [c, g] = makeCanvas(128, 128);
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(210,225,230,0.75)';
    g.lineWidth = 2.5;
    for (let i = -128; i < 256; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
    }
    const t = toTexture(c, true);
    return t;
  }

  function windscreenTexture(title) {
    const [c, g] = makeCanvas(2048, 128);
    g.fillStyle = '#1f6b45';
    g.fillRect(0, 0, 2048, 128);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x < 2048; x += 24) g.fillRect(x, 0, 2, 128);
    g.font = `64px ${Kit.gfx.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    const words = ['🎾', title.toUpperCase(), '🎾', 'TEDDY ★ TOMMY', '🎾', title.toUpperCase(), '🎾'];
    words.forEach((w, i) => {
      g.font = w === '🎾' ? `60px ${Kit.gfx.EMOJI_FONT}` : `56px ${Kit.gfx.FONT}`;
      g.fillText(w, 150 + i * 290, 70);
    });
    return toTexture(c);
  }

  function tree(parent, x, z, s) {
    const trunk = std('#8a5a33');
    const leaf = std('#3fa34d'), leaf2 = std('#58bb5a');
    box(0.5 * s, 2.2 * s, 0.5 * s, trunk, x, 1.1 * s, z, parent);
    box(2.6 * s, 1.6 * s, 2.6 * s, leaf, x, 2.9 * s, z, parent);
    box(1.8 * s, 1.2 * s, 1.8 * s, leaf2, x + 0.2 * s, 4.0 * s, z + 0.1, parent);
  }

  function bunting(parent, x0, x1, y, z) {
    const cols = ['#ff4b5c', '#ffd400', '#18d4ff', '#7dff5a', '#ff9f1c', '#b45cff'];
    const n = Math.round((x1 - x0) / 0.7);
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * ((x1 - x0) / n);
      const sag = Math.sin(((i + 0.5) / n) * Math.PI) * 0.45;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.42, 0], 3));
      geo.computeVertexNormals();
      const m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: cols[i % cols.length], side: T.DoubleSide, roughness: 0.9 }));
      m.position.set(x, y - sag, z);
      parent.add(m);
    }
  }

  // The umpire's chair, at the far end of the net. The game puts a character on it.
  function chair(parent, z) {
    const wood = std('#e9eef2'), dark = std('#2f6fbf');
    const g = new T.Group();
    g.position.set(0, 0, z);
    for (const [x, zz] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) box(0.1, 2.0, 0.1, wood, x, 1.0, zz, g);
    box(1.1, 0.12, 0.9, dark, 0, 2.0, 0, g);
    box(1.1, 0.7, 0.1, dark, 0, 2.4, -0.45, g);
    for (let y = 0.4; y < 2; y += 0.4) box(1.0, 0.06, 0.06, wood, 0, y, 0.38, g);
    parent.add(g);
    return g;
  }

  function build(scene, K, title) {
    const root = new T.Group();
    scene.add(root);
    // sky backdrop far behind
    const sky = new T.Mesh(new T.PlaneGeometry(220, 80), new T.MeshBasicMaterial({ map: skyTexture(), depthWrite: false, fog: false }));
    sky.position.set(0, 22, -60);
    root.add(sky);
    // the lawn
    const lawnTex = (() => {
      const [c, g] = makeCanvas(256, 256);
      g.fillStyle = '#4caf5c';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,40,0,0.06)';
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 5);
      }
      const t = toTexture(c, true);
      t.repeat.set(30, 16);
      return t;
    })();
    const lawn = new T.Mesh(new T.PlaneGeometry(160, 90), new T.MeshStandardMaterial({ map: lawnTex, roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(0, -0.01, -20);
    lawn.receiveShadow = true;
    root.add(lawn);
    // the court
    const W = 2 * (K.HALF + 4.2), D = 10;
    const court = new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshStandardMaterial({ map: courtTexture(K, W, D), roughness: 0.85 }));
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.002;
    court.receiveShadow = true;
    root.add(court);
    // the net: posts, mesh, white tape on top and a strap in the middle
    const NZ = 3.5;
    const post = std('#244a36', { roughness: 0.5, metalness: 0.3 });
    for (const z of [-NZ, NZ]) box(0.1, K.NET_H + 0.12, 0.1, post, 0, (K.NET_H + 0.12) / 2, z, root);
    const ntex = netTexture();
    ntex.repeat.set(2 * NZ / 1.0, 1);
    const net = new T.Mesh(new T.PlaneGeometry(2 * NZ, K.NET_H - 0.08), new T.MeshStandardMaterial({ map: ntex, transparent: true, side: T.DoubleSide, depthWrite: false, roughness: 1 }));
    net.rotation.y = Math.PI / 2;
    net.position.set(0, (K.NET_H - 0.08) / 2, 0);
    root.add(net);
    const white = std('#ffffff', { roughness: 0.6 });
    box(0.05, 0.09, 2 * NZ, white, 0, K.NET_H - 0.045, 0, root);
    box(0.04, K.NET_H, 0.08, white, 0, K.NET_H / 2, 0, root, false);
    // the fence behind the court with its windscreen, and a low one in front (out of sight but casting nothing)
    const fz = -6.4;
    const fence = new T.Mesh(new T.PlaneGeometry(30, 3.2), new T.MeshStandardMaterial({ map: (() => { const t = fenceTexture(); t.repeat.set(30 / 0.9, 3.2 / 0.9); return t; })(), transparent: true, depthWrite: false, roughness: 1 }));
    fence.position.set(0, 1.6, fz);
    root.add(fence);
    const ws = new T.Mesh(new T.PlaneGeometry(30, 1.5), new T.MeshStandardMaterial({ map: windscreenTexture(title || 'Tennis'), roughness: 1 }));
    ws.position.set(0, 0.85, fz + 0.02);
    ws.receiveShadow = true;
    root.add(ws);
    const pole = std('#9aa7ad', { metalness: 0.4, roughness: 0.5 });
    for (let x = -15; x <= 15; x += 3) box(0.1, 3.3, 0.1, pole, x, 1.65, fz, root);
    box(30, 0.08, 0.08, pole, 0, 3.25, fz, root);
    bunting(root, -12, 12, 3.2, fz + 0.1);
    // trees and the umpire's chair
    tree(root, -11, -9.5, 1.3);
    tree(root, -5.5, -11, 1.1);
    tree(root, 2.5, -10.5, 1.4);
    tree(root, 9, -9.2, 1.2);
    tree(root, 14, -11, 1.3);
    tree(root, -16, -8.5, 1.1);
    const ump = chair(root, -NZ - 0.9);
    // benches by the side of the court
    const bench = std('#ff9f1c'), legs = std('#5a5f6b');
    for (const x of [-4.2, 4.2]) {
      box(2.0, 0.08, 0.45, bench, x, 0.5, -5.4, root);
      box(2.0, 0.4, 0.08, bench, x, 0.8, -5.6, root);
      for (const dx of [-0.85, 0.85]) box(0.08, 0.5, 0.4, legs, x + dx, 0.25, -5.4, root);
    }
    return { root, net, umpire: ump };
  }

  window.TTStage = { build };
})();
