/* SIGMA 155: FIRE MISSION — WebGL world renderer (PixiJS v8).
   Renders the battlefield on a GPU canvas behind the 2D HUD canvas:
   additive-blended glows, mass particles, retina resolution, color grading.
   The 2D renderer remains as an automatic fallback when WebGL is unavailable. */
'use strict';

const PixiWorld = {
  app: null,
  ok: false,

  // palette (numeric for Pixi)
  C: {
    steel: 0x394130, body: 0x4f5a40, body2: 0x5e6a4b,
    darkBody: 0x33302a, darkBody2: 0x262420, darkSteel: 0x222222,
    wheel: 0x1c1c19, hub: 0x3a3a33, hubDark: 0x2a2a26,
    enemy1: 0x6b5d49, enemy2: 0x57503e, enemyDead1: 0x2e2a24, enemyDead2: 0x262320,
    red: 0xff5f56, green: 0x7dff9a, cyan: 0x6fd7ff, amber: 0xffb454, white: 0xe8f0e8
  },

  async create() {
    if (typeof PIXI === 'undefined') return false;
    try {
      const app = new PIXI.Application();
      await app.init({
        preference: 'webgl',
        autoStart: false,
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
        resizeTo: window,
        background: 0x05070a
      });
      this.app = app;
      app.canvas.id = 'gl-stage';
      document.body.insertBefore(app.canvas, document.body.firstChild);
      this._build();
      this.ok = true;
    } catch (e) {
      this.ok = false;
    }
    return this.ok;
  },

  _radialTex(stops) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return PIXI.Texture.from(c);
  },

  _skyTex(env) {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, env.skyTop);
    g.addColorStop(0.62, env.skyMid);
    g.addColorStop(1, env.skyLow);
    x.fillStyle = g;
    x.fillRect(0, 0, 2, 256);
    return PIXI.Texture.from(c);
  },

  _build() {
    const stage = this.app.stage;
    this.glowTex = this._radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    this.vignTex = this._radialTex([[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.85)']]);
    this._skyCache = {};

    this.sky = new PIXI.Sprite();
    this.sunGlow = new PIXI.Sprite(this.glowTex);
    this.sunGlow.anchor.set(0.5);
    this.sunGlow.blendMode = 'add';
    this.starsG = new PIXI.Graphics();
    this.sunG = new PIXI.Graphics();
    this.ridgesG = [new PIXI.Graphics(), new PIXI.Graphics(), new PIXI.Graphics()];
    this.groundG = new PIXI.Graphics();
    this.decalsG = new PIXI.Graphics();
    this.entG = new PIXI.Graphics();          // FOB, convoys, drones, escort, icons
    this.siteLayer = new PIXI.Container();    // per-site containers (nested rotations)
    this._sitePool = [];

    // vehicle: container in meter-space, nested barrel pivot
    this.vehC = new PIXI.Container();
    this.vehG = new PIXI.Graphics();
    this.barrelC = new PIXI.Container();
    this.barrelG = new PIXI.Graphics();
    this.barrelC.addChild(this.barrelG);
    this.vehC.addChild(this.vehG);
    this.vehC.addChild(this.barrelC);
    this._drawBarrel();

    this.trailsG = new PIXI.Graphics();
    this.trailsG.blendMode = 'add';
    this.partG = new PIXI.Graphics();         // smoke / debris (normal blend)
    this.flashG = new PIXI.Graphics();        // shock rings / tracer lines (additive)
    this.flashG.blendMode = 'add';
    this.glowLayer = new PIXI.Container();    // pooled additive glow sprites
    this._glowPool = [];
    this._glowIdx = 0;

    this.vign = new PIXI.Sprite(this.vignTex);
    this.tint = new PIXI.Graphics();          // night/dawn grading overlay

    stage.addChild(this.sky, this.starsG, this.sunGlow, this.sunG,
      this.ridgesG[0], this.ridgesG[1], this.ridgesG[2],
      this.groundG, this.decalsG, this.entG, this.siteLayer, this.vehC,
      this.trailsG, this.partG, this.glowLayer, this.flashG, this.tint, this.vign);
  },

  _glow(x, y, r, color, alpha) {
    let s = this._glowPool[this._glowIdx];
    if (!s) {
      s = new PIXI.Sprite(this.glowTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this._glowPool.push(s);
      this.glowLayer.addChild(s);
    }
    this._glowIdx++;
    s.visible = true;
    s.position.set(x, y);
    s.width = s.height = r * 2;
    s.tint = color;
    s.alpha = alpha;
  },

  _hex(rgbStr) { // '255,170,70' -> 0xffaa46
    const p = rgbStr.split(',');
    return ((+p[0]) << 16) | ((+p[1]) << 8) | (+p[2]);
  },

  /* ============== entity drawing (meter space, y up = negative) ============== */

  _drawBarrel() {
    const g = this.barrelG, C = this.C;
    g.clear();
    g.rect(0, -0.22, 6.6, 0.44).fill(C.steel);
    g.rect(6.6, -0.28, 1.05, 0.56).fill(C.steel);
    g.rect(2.9, -0.3, 0.8, 0.6).fill(C.steel);
    g.rect(-0.7, -0.62, 1.7, 1.24).fill(C.body2);
  },

  _drawVehicle(veh, game) {
    const g = this.vehG, C = this.C;
    const dark = veh.destroyed;
    const body = dark ? C.darkBody : C.body;
    const body2 = dark ? C.darkBody2 : C.body2;
    const steel = dark ? C.darkSteel : C.steel;
    g.clear();

    const sf = veh.stabFrac();
    if (sf > 0.02) {
      for (const sx of [-5.6, 1.6]) {
        g.moveTo(sx, -1.5).lineTo(sx - 0.5, -1.5 + sf * 1.5).stroke({ width: 0.35, color: steel });
        g.rect(sx - 1.0, -0.25 + (sf - 1) * 1.4, 1.0, 0.3).fill(steel);
      }
    }
    for (const wx of [-5.2, -3.4, -1.6, 1.8, 3.6]) {
      g.circle(wx, -0.85, 0.85).fill(C.wheel);
      g.circle(wx, -0.85, 0.45).fill(dark ? C.hubDark : C.hub);
      g.moveTo(wx, -0.85)
        .lineTo(wx + Math.cos(veh.wheelPhase) * 0.42, -0.85 + Math.sin(veh.wheelPhase) * 0.42)
        .stroke({ width: 0.16, color: 0x181815 });
    }
    g.rect(-6.4, -2.2, 12.6, 0.85).fill(body);
    g.poly([3.0, -2.2, 3.0, -4.6, 4.6, -4.6, 6.2, -3.4, 6.2, -2.2]).fill(body2);
    if (dark) {
      g.poly([4.55, -4.35, 5.85, -3.4, 4.55, -3.4]).fill(0x1a1a18);
      g.rect(3.35, -4.3, 0.95, 0.95).fill(0x1a1a18);
    } else {
      g.poly([4.55, -4.35, 5.85, -3.4, 4.55, -3.4]).fill({ color: 0x78b4c8, alpha: 0.85 });
      g.rect(3.35, -4.3, 0.95, 0.95).fill({ color: 0x78b4c8, alpha: 0.85 });
    }
    g.rect(3.7, -5.05, 0.7, 0.5).fill(steel);
    g.rect(4.35, -4.95, 0.9, 0.18).fill(steel);
    g.poly([-6.2, -2.2, -6.0, -4.4, 0.6, -4.7, 2.4, -2.9, 2.4, -2.2]).fill(body2);
    g.rect(-5.4, -4.95, 3.3, 0.6).fill(body);
    void game;
  },

  _siteEntry(i) {
    let e = this._sitePool[i];
    if (!e) {
      e = { c: new PIXI.Container(), g: new PIXI.Graphics(), subC: new PIXI.Container(), subG: new PIXI.Graphics(), hpG: new PIXI.Graphics() };
      e.subC.addChild(e.subG);
      e.c.addChild(e.g);
      e.c.addChild(e.subC);
      e.c.addChild(e.hpG);
      this.siteLayer.addChild(e.c);
      this._sitePool[i] = e;
    }
    return e;
  },

  _drawSite(e, s) {
    const C = this.C;
    const alive = !s.dead;
    const c1 = alive ? C.enemy1 : C.enemyDead1;
    const c2 = alive ? C.enemy2 : C.enemyDead2;
    const g = e.g, sg = e.subG;
    g.clear(); sg.clear();
    e.subC.rotation = 0;
    e.subC.position.set(0, 0);

    if (s.type === 'ROCKET') {
      g.rect(-4, -2.4, 8, 1.6).fill(c1);
      for (const wx of [-2.8, 0, 2.8]) g.circle(wx, -0.8, 0.8).fill(C.wheel);
      e.subC.position.set(1.0, -2.4);
      e.subC.rotation = Util.deg2rad(-55);
      sg.rect(-4.4, -1.1, 4.4, 2.2).fill(c2);
      for (let i = 0; i < 3; i++) sg.rect(-4.2, -0.95 + i * 0.7, 4.0, 0.5).fill(alive ? 0x3c3c33 : 0x222222);
    } else if (s.type === 'GUN') {
      g.rect(-3.6, -2.0, 7.2, 1.4).fill(c1);
      for (const wx of [-2.4, 2.4]) g.circle(wx, -0.7, 0.9).fill(C.wheel);
      g.rect(-1.6, -3.0, 2.6, 1.2).fill(c2);
      e.subC.position.set(-0.5, -2.2);
      e.subC.rotation = Util.deg2rad(-180 + 38);
      sg.rect(0, -0.25, 6.0, 0.5).fill(c2);
    } else if (s.type === 'RADAR') {
      g.rect(-0.4, -4.6, 0.8, 4.6).fill(c2);
      g.rect(-2.2, -1.4, 4.4, 1.4).fill(c2);
      e.subC.position.set(0, -4.6);
      if (alive) e.subC.rotation = Math.sin(s.anim * 1.8) * 0.7;
      sg.rect(-1.7, -1.5, 3.4, 1.5).fill(alive ? 0x7a8577 : 0x33302a);
    } else if (s.type === 'JAMMER') {
      g.rect(-0.35, -5.2, 0.7, 5.2).fill(c2);
      g.rect(-1.9, -1.2, 3.8, 1.2).fill(c2);
      sg.circle(0, -5.4, 0.7).fill(alive ? 0x8a7f5d : 0x33302a);
      if (alive) {
        const ph = (s.anim % 1.6) / 1.6;
        for (let i = 0; i < 2; i++) {
          const r = 1.2 + ((ph + i * 0.5) % 1) * 3.4;
          sg.circle(0, -5.4, r).stroke({ width: 0.16, color: C.amber, alpha: 0.7 * (1 - ((ph + i * 0.5) % 1)) });
        }
      }
    } else if (s.type === 'ATGM') {
      g.rect(-1.8, -1.0, 3.6, 1.0).fill(c2);
      g.rect(-0.7, -1.9, 1.8, 0.9).fill(c1);
    } else if (s.type === 'DUMP') {
      for (let i = 0; i < 4; i++) g.rect(-3.4 + i * 1.8, -1.5, 1.5, 1.5).fill(c2);
      for (let i = 0; i < 3; i++) g.rect(-2.6 + i * 1.8, -2.6, 1.5, 1.1).fill(c1);
    }
    if (s.dead) g.rect(-4.5, -3.2, 9, 3.2).fill({ color: 0x14120f, alpha: 0.55 });
  },

  /* ============== frame ============== */

  render(scene) {
    if (!this.ok) return;
    const W = window.innerWidth, H = window.innerHeight;
    const cam = scene.camera;
    const env = scene.env;
    const terrain = scene.terrain;
    this._glowIdx = 0;

    // --- sky / stars / sun
    const key = env.skyTop + env.skyLow;
    if (this._skyKey !== key) {
      this._skyKey = key;
      if (!this._skyCache[key]) this._skyCache[key] = this._skyTex(env);
      this.sky.texture = this._skyCache[key];
    }
    this.sky.width = W; this.sky.height = H;

    const st = this.starsG;
    st.clear();
    if (env.stars) {
      for (let i = 0; i < 110; i++) {
        const sx = (Util.hash1(i * 13, 5) * 0.5 + 0.5) * W;
        const sy = (Util.hash1(i * 7, 9) * 0.5 + 0.5) * H * 0.55;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(env.t * (0.4 + (i % 7) * 0.1) + i));
        st.rect(sx, sy, 1.6, 1.6).fill({ color: 0xdce6ff, alpha: tw * 0.8 });
      }
    }
    const sunCol = env.stars ? 0xdce4f0 : 0xffaa5a;
    this.sunG.clear();
    this.sunG.circle(W * env.sunX, H * env.sunY, env.stars ? 26 : 42).fill({ color: sunCol, alpha: 0.95 });
    this.sunGlow.position.set(W * env.sunX, H * env.sunY);
    this.sunGlow.width = this.sunGlow.height = env.stars ? 150 : 340;
    this.sunGlow.tint = sunCol;
    this.sunGlow.alpha = env.stars ? 0.35 : 0.5;

    // --- parallax ridges
    const ridgeCols = env.stars
      ? [0x10141c, 0x0c0f16, 0x080a10]
      : [this._cssToHex(env.ridges[0]), this._cssToHex(env.ridges[1]), this._cssToHex(env.ridges[2])];
    for (let layer = 0; layer < 3; layer++) {
      const par = [0.06, 0.16, 0.34][layer];
      const baseY = H * [0.52, 0.62, 0.70][layer];
      const amp = [70, 55, 40][layer];
      const g = this.ridgesG[layer];
      g.clear();
      const pts = [0, H];
      for (let sx = 0; sx <= W; sx += 10) {
        const nx = (sx + cam.x * par * cam.scale) / 420;
        pts.push(sx, baseY - (Util.fbm(nx, terrain.seed + 31 + layer * 17, 3, 2.0, 0.55) * 0.5 + 0.5) * amp);
      }
      pts.push(W, H);
      g.poly(pts).fill({ color: ridgeCols[layer], alpha: env.stars ? 0.95 : 0.85 });
    }

    // --- ground + rim + decals
    const gg = this.groundG;
    gg.clear();
    const x0 = cam.screenToWorldX(0), x1 = cam.screenToWorldX(W);
    const wStep = (x1 - x0) / Math.ceil(W / 6);
    const gPts = [0, H + 4];
    const rim = [];
    for (let wx = x0; wx <= x1 + wStep; wx += wStep) {
      const p = cam.worldToScreen(wx, terrain.heightAt(wx));
      gPts.push(p.x, p.y);
      rim.push(p.x, p.y);
    }
    gPts.push(W, H + 4);
    gg.poly(gPts).fill(this._cssToHex(env.ground));
    gg.moveTo(rim[0], rim[1]);
    for (let i = 2; i < rim.length; i += 2) gg.lineTo(rim[i], rim[i + 1]);
    gg.stroke({ width: 1.5, color: this._cssToHex(env.groundRim), alpha: this._cssAlpha(env.groundRim) });

    const dg = this.decalsG;
    dg.clear();
    if (cam.scale > 0.08) {
      for (const d of terrain.decals) {
        if (d.x < x0 - 200 || d.x > x1 + 200) continue;
        const p = cam.worldToScreen(d.x, terrain.heightAt(d.x));
        dg.ellipse(p.x, p.y + 1, d.r * cam.scale, d.r * cam.scale * 0.22).fill({ color: 0x080806, alpha: 0.55 });
      }
    }

    // --- FOB, convoys, escort, drones (shared graphics)
    const eg = this.entG;
    eg.clear();
    if (scene.fob) this._drawFob(eg, scene);
    for (const cv of (scene.convoys || [])) this._drawConvoy(eg, cv, scene);
    if (scene.escort && !scene.escort.dead) this._drawEscort(eg, scene.escort, scene);
    for (const d of (scene.drones || [])) this._drawDrone(eg, d, cam);

    // --- sites
    const sites = scene.sites || [];
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      const e = this._siteEntry(i);
      const gy = terrain.heightAt(s.x);
      const p = cam.worldToScreen(s.x, gy);
      const off = p.x < -140 || p.x > W + 140;
      if (off) { e.c.visible = false; continue; }
      e.c.visible = true;
      e.hpG.clear();
      if (cam.scale < 0.10) {
        // tactical icon
        e._key = null;
        e.c.position.set(0, 0);
        e.c.scale.set(1);
        e.g.clear(); e.subG.clear();
        const col = s.dead ? 0x787870 : this.C.red;
        e.g.rect(p.x - 6, p.y - 12, 12, 9)
          .fill({ color: s.dead ? 0x3c3c37 : this.C.red, alpha: s.dead ? 0.4 : 0.25 })
          .stroke({ width: 1.4, color: col, alpha: 0.9 });
      } else {
        e.c.position.set(p.x, p.y);
        e.c.scale.set(cam.scale);
        const stateKey = s.type + (s.dead ? 'd' : 'a') + (s.type === 'RADAR' || s.type === 'JAMMER' ? Math.round(s.anim * 10) : '');
        if (e._key !== stateKey) { e._key = stateKey; this._drawSite(e, s); }
        if (!s.dead && s.hp < s.maxHp) {
          const k = 1 / cam.scale;
          e.hpG.rect(-23 * k, (-14 - 5 * cam.scale) * k, 46 * k, 4 * k).fill({ color: 0x000000, alpha: 0.5 });
          e.hpG.rect(-23 * k, (-14 - 5 * cam.scale) * k, 46 * (s.hp / s.maxHp) * k, 4 * k).fill(this.C.red);
        }
      }
    }
    for (let i = sites.length; i < this._sitePool.length; i++) this._sitePool[i].c.visible = false;

    // --- vehicle
    const veh = scene.vehicle;
    if (veh) {
      const gy = terrain.heightAt(veh.x);
      const p = cam.worldToScreen(veh.x, gy);
      if (cam.scale < 0.10) {
        this.vehC.visible = false;
        eg.poly([p.x, p.y - 9, p.x - 6, p.y, p.x + 6, p.y]).fill(veh.destroyed ? this.C.red : this.C.green);
      } else {
        this.vehC.visible = true;
        this.vehC.position.set(p.x, p.y);
        this.vehC.scale.set(cam.scale);
        const slope = (terrain.heightAt(veh.x + 6) - terrain.heightAt(veh.x - 6)) / 12;
        this.vehC.rotation = -Math.atan(slope);
        this._drawVehicle(veh, scene);
        this.barrelC.position.set(-2.2, -3.4);
        this.barrelC.rotation = -Util.deg2rad(veh.elevDeg);
      }
    } else this.vehC.visible = false;

    // --- shells: additive trails + glow heads
    const tg = this.trailsG;
    tg.clear();
    for (const sh of (scene.shells || [])) {
      if (sh.dead) continue;
      const p = cam.worldToScreen(sh.x, sh.y);
      const col = sh.kind === 'player' ? 0x9affc0 : (sh.kind === 'cb' ? 0xff7864 : 0xffbe78);
      if (p.x < -80 || p.x > W + 80 || p.y < -100) {
        if (p.y < -10 && p.x > 0 && p.x < W) {
          tg.poly([p.x, 8, p.x - 5, 18, p.x + 5, 18]).fill(sh.kind === 'player' ? this.C.green : this.C.red);
        }
        continue;
      }
      if (sh.trail.length > 1) {
        const n = sh.trail.length;
        for (let i = 1; i < n; i++) {
          const a = cam.worldToScreen(sh.trail[i - 1].x, sh.trail[i - 1].y);
          const b = cam.worldToScreen(sh.trail[i].x, sh.trail[i].y);
          tg.moveTo(a.x, a.y).lineTo(b.x, b.y)
            .stroke({ width: Math.max(1.6, 2.2 * Math.min(1, cam.scale * 3)), color: col, alpha: 0.75 * (i / n) });
        }
      }
      this._glow(p.x, p.y, Math.max(9, 3.2 * cam.scale), col, 0.85);
      tg.circle(p.x, p.y, Math.max(1.8, 1.1 * cam.scale)).fill(0xffffff);
    }

    // --- particles
    const pg = this.partG, fg = this.flashG;
    pg.clear(); fg.clear();
    const parts = scene.particles ? scene.particles.list : [];
    for (const p of parts) {
      const f = p.life / p.maxLife;
      const s = cam.worldToScreen(p.x, p.y);
      if (s.x < -140 || s.x > W + 140) continue;
      const r = Math.max(0.6, p.size * cam.scale);
      if (p.type === 'line') {
        const s1 = cam.worldToScreen(p.x1, p.y1);
        fg.moveTo(s.x, s.y).lineTo(s1.x, s1.y)
          .stroke({ width: 1.5, color: this._hex(p.color), alpha: 0.9 * f });
      } else if (p.type === 'shock') {
        fg.circle(s.x, s.y, r).stroke({ width: Math.max(1, 3 * f), color: this._hex(p.color), alpha: 0.75 * f });
        this._glow(s.x, s.y, r * 1.15, this._hex(p.color), 0.22 * f);
      } else if (p.type === 'flash') {
        this._glow(s.x, s.y, r * 2.6, this._hex(p.color), 0.85 * f);
        // big flashes light up the ground around them
        if (p.size > 6) this._glow(s.x, s.y, r * 7, this._hex(p.color), 0.10 * f);
      } else if (p.type === 'debris') {
        pg.rect(s.x, s.y, Math.max(1, 1.6 * cam.scale), Math.max(1, 1.6 * cam.scale))
          .fill({ color: this._hex(p.color), alpha: f });
      } else { // smoke
        pg.circle(s.x, s.y, r).fill({ color: this._hex(p.color), alpha: 0.30 * f });
      }
    }
    // hide unused glow sprites
    for (let i = this._glowIdx; i < this._glowPool.length; i++) this._glowPool[i].visible = false;

    // --- grading: vignette + night tint
    this.vign.width = W * 1.02; this.vign.height = H * 1.02;
    this.vign.position.set(-W * 0.01, -H * 0.01);
    this.vign.alpha = env.stars ? 0.85 : 0.5;
    this.tint.clear();
    if (env.stars) this.tint.rect(0, 0, W, H).fill({ color: 0x2a3650, alpha: 0.12 });
    else if (env.skyTop === '#23284a') this.tint.rect(0, 0, W, H).fill({ color: 0xffb478, alpha: 0.05 });

    this.app.render();
  },

  _drawFob(eg, scene) {
    const cam = scene.camera, terrain = scene.terrain;
    const fx = scene.fob.x;
    const gy = terrain.heightAt(fx);
    const p = cam.worldToScreen(fx, gy);
    if (p.x < -320 || p.x > window.innerWidth + 320) return;
    const s = cam.scale;
    if (s < 0.10) {
      eg.rect(p.x - 7, p.y - 10, 14, 8).stroke({ width: 1.4, color: this.C.cyan });
      return;
    }
    const integ = (scene.baseIntegrity === undefined ? 100 : scene.baseIntegrity) / 100;
    const tcol = integ > 0.4 ? 0x4a523f : 0x3a342c;
    for (const [tx, tw] of [[-26, 7], [-15, 9], [3, 8], [16, 6]]) {
      eg.poly([p.x + tx * s, p.y, p.x + (tx + tw / 2) * s, p.y - 3.2 * s, p.x + (tx + tw) * s, p.y]).fill(tcol);
    }
    eg.moveTo(p.x - 2 * s, p.y).lineTo(p.x - 2 * s, p.y - 9 * s).stroke({ width: 0.3 * s, color: 0x6a705f });
    for (let i = 0; i < 9; i++) eg.rect(p.x + (-32 + i * 7.4) * s, p.y - 1.6 * s, 6.6 * s, 1.6 * s).fill(0x57503e);
  },

  _drawConvoy(eg, cv, scene) {
    const cam = scene.camera, terrain = scene.terrain;
    for (const u of cv.units) {
      if (u.dead) continue;
      const gy = terrain.heightAt(u.x);
      const p = cam.worldToScreen(u.x, gy);
      if (p.x < -70 || p.x > window.innerWidth + 70) continue;
      const s = cam.scale;
      if (s < 0.10) {
        eg.rect(p.x - 4, p.y - 7, 8, 5).fill(this.C.red);
        continue;
      }
      eg.rect(p.x - 2.6 * s, p.y - 2.2 * s, 5.2 * s, 1.5 * s).fill(0x5a4f3c);
      eg.rect(p.x - 2.6 * s, p.y - 3.0 * s, 1.7 * s, 0.8 * s).fill(0x5a4f3c);
      for (const wx of [-1.7, 1.7]) eg.circle(p.x + wx * s, p.y - 0.7 * s, 0.7 * s).fill(this.C.wheel);
    }
  },

  _drawEscort(eg, tr, scene) {
    const cam = scene.camera, terrain = scene.terrain;
    const gy = terrain.heightAt(tr.x);
    const p = cam.worldToScreen(tr.x, gy);
    if (p.x < -80 || p.x > window.innerWidth + 80) return;
    const s = cam.scale;
    if (s < 0.10) {
      eg.rect(p.x - 4, p.y - 7, 8, 5).fill(this.C.cyan);
      return;
    }
    eg.rect(p.x - 3.4 * s, p.y - 2.4 * s, 6.8 * s, 1.7 * s).fill(0x46523f);
    eg.rect(p.x + 1.6 * s, p.y - 3.3 * s, 1.8 * s, 0.9 * s).fill(0x52604a);
    eg.rect(p.x - 3.0 * s, p.y - 3.6 * s, 4.0 * s, 1.2 * s).fill(0x3c4636); // cassette pod
    for (const wx of [-2.4, -0.6, 1.4, 2.8]) eg.circle(p.x + wx * s, p.y - 0.8 * s, 0.8 * s).fill(this.C.wheel);
  },

  _drawDrone(eg, d, cam) {
    if (d.dead) return;
    const p = cam.worldToScreen(d.x, d.y);
    if (p.x < -50 || p.x > window.innerWidth + 50 || p.y < -50) return;
    const s = Math.max(0.4, Math.min(1.6, cam.scale));
    eg.moveTo(p.x - 9 * s, p.y).lineTo(p.x + 9 * s, p.y).stroke({ width: 1.2, color: this.C.red });
    eg.moveTo(p.x, p.y).lineTo(p.x, p.y + 3.5 * s).stroke({ width: 1.2, color: this.C.red });
    eg.moveTo(p.x - 3 * s, p.y + 3.5 * s).lineTo(p.x + 3 * s, p.y + 3.5 * s).stroke({ width: 1.2, color: this.C.red });
    eg.circle(p.x, p.y, 2.2 * s).fill(0x3a3632).stroke({ width: 1.2, color: this.C.red });
  },

  _cssToHex(css) {
    if (css[0] === '#') return parseInt(css.slice(1), 16);
    const m = css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (m) return ((+m[1]) << 16) | ((+m[2]) << 8) | (+m[3]);
    return 0xffffff;
  },
  _cssAlpha(css) {
    const m = css.match(/rgba?\([\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\)/);
    return m ? +m[1] : 1;
  }
};
