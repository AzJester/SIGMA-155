/* SIGMA 155: FIRE MISSION — camera with gun / shell-follow / tactical modes.
   World: x meters right, y meters up. Screen: y down. */
'use strict';

class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 800; this.y = 60;            // world focus point
    this.scale = TUNE.CAM_GUN_SCALE;      // px per meter
    this.tx = this.x; this.ty = this.y; this.tscale = this.scale;
    this.mode = 'GUN';                    // GUN | FOLLOW | TACTICAL
    this.followShell = null;
    this.shake = 0;
    this._shakeX = 0; this._shakeY = 0;
    this.groundFrac = 0.78;               // where the focus height sits on screen
  }

  worldToScreen(wx, wy) {
    const W = this.canvas.width, H = this.canvas.height;
    return {
      x: (wx - this.x) * this.scale + W / 2 + this._shakeX,
      y: H * this.groundFrac - (wy - this.y) * this.scale + this._shakeY
    };
  }

  screenToWorldX(sx) {
    const W = this.canvas.width;
    return (sx - W / 2 - this._shakeX) / this.scale + this.x;
  }

  addShake(amount) { this.shake = Math.min(28, this.shake + amount); }

  /* Compute targets based on mode, then smooth. */
  update(dt, game) {
    const W = this.canvas.width, H = this.canvas.height;
    const veh = game.vehicle;

    if (this.mode === 'FOLLOW' && (!this.followShell || this.followShell.dead)) {
      this.mode = 'GUN';
      this.followShell = null;
    }

    if (this.mode === 'GUN') {
      this.tscale = TUNE.CAM_GUN_SCALE * (H / 1080);
      // look slightly downrange, keep the ground line near the bottom of the frame
      this.tx = veh.x + (W * 0.18) / this.tscale;
      this.ty = game.terrain.heightAt(veh.x) + (H * 0.04) / this.tscale;
    } else if (this.mode === 'FOLLOW' && this.followShell) {
      const s = this.followShell;
      const gy = game.terrain.heightAt(s.x);
      this.tx = s.x + s.vx * 0.06;
      this.ty = gy + Math.max(30, (s.y - gy) * 0.55);
      // zoom out with altitude so both shell and ground stay in frame
      const span = Math.max(650, (s.y - gy) * 2.3);
      this.tscale = Util.clamp((H * 0.9) / span, TUNE.CAM_MIN_SCALE, 1.6);
    } else if (this.mode === 'TACTICAL') {
      const lo = Math.max(0, veh.x - 1500);
      const hi = Util.clamp(game.tacticalFocusX + 4000, lo + 9000, TUNE.WORLD_W);
      this.tx = (lo + hi) / 2;
      this.tscale = Util.clamp(W / (hi - lo), TUNE.CAM_MIN_SCALE, TUNE.CAM_MAX_SCALE);
      this.ty = 120 + (hi - lo) * 0.02;
    }

    const k = Math.min(1, dt * 3.2);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.scale += (this.tscale - this.scale) * Math.min(1, dt * 2.6);

    // screen shake decay
    if (this.shake > 0.01) {
      this._shakeX = (Math.random() * 2 - 1) * this.shake;
      this._shakeY = (Math.random() * 2 - 1) * this.shake;
      this.shake *= Math.pow(0.0018, dt); // fast decay
    } else {
      this._shakeX = 0; this._shakeY = 0; this.shake = 0;
    }
  }
}
