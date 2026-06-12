/* SIGMA 155: FIRE MISSION — in-flight projectiles (player shells, enemy rockets, CB shells).
   Integrated in real units at TUNE.TIME_SCALE x viewer time. */
'use strict';

class Shell {
  /* kind: 'player' | 'rocket' | 'cb'
     opts: { x, y, v0, elevDeg, dir(+1 right/-1 left), k, windX, mrsiGroup, targetRef } */
  constructor(kind, opts) {
    this.kind = kind;
    this.x = opts.x; this.y = opts.y;
    const e = Util.deg2rad(opts.elevDeg);
    this.vx = opts.v0 * Math.cos(e) * opts.dir;
    this.vy = opts.v0 * Math.sin(e);
    this.k = opts.k;
    this.windX = opts.windX || 0;
    this.dir = opts.dir;
    this.dead = false;
    this.age = 0;
    this.timeScale = opts.timeScale || TUNE.TIME_SCALE;
    this.mrsiGroup = opts.mrsiGroup || null;
    this.excalibur = !!opts.excalibur;
    this.targetX = opts.targetX;      // for excalibur terminal correction + HUD
    this.trail = [];                  // recent positions for streak rendering
    this.whistled = false;
  }

  update(dt, game) {
    const sdt = dt * this.timeScale;
    const steps = Math.max(1, Math.ceil(sdt / 0.12));
    const h = sdt / steps;
    for (let i = 0; i < steps; i++) {
      const rvx = this.vx - this.windX;
      const rv = Math.sqrt(rvx * rvx + this.vy * this.vy);
      this.vx += (-this.k * rv * rvx) * h;
      this.vy += (-Ballistics.G - this.k * rv * this.vy) * h;
      // Excalibur: gentle terminal glide toward the aim point on descent
      if (this.excalibur && this.vy < 0 && this.targetX !== undefined) {
        const err = this.targetX - this.x;
        this.vx += Util.clamp(err * 0.004, -30, 30) * h;
      }
      this.x += this.vx * h;
      this.y += this.vy * h;
      const gy = game.terrain.heightAt(this.x);
      if (this.y <= gy && this.vy < 0) {
        this.y = gy;
        this.dead = true;
        game.onShellImpact(this);
        return;
      }
    }
    this.age += dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 12) this.trail.shift();

    // descent whistle when a hostile round nears the player
    if (!this.whistled && this.kind === 'cb' && this.vy < 0 && this.y < 2600) {
      this.whistled = true;
      Sfx.whistle(1.6);
    }
    if (this.x < -2000 || this.x > TUNE.WORLD_W + 4000) this.dead = true;
  }

  draw(ctx, cam) {
    const s = cam.worldToScreen(this.x, this.y);
    if (s.x < -60 || s.x > ctx.canvas.width + 60 || s.y < -80) {
      // off-screen shell marker (chevron at top of screen)
      if (s.y < -10 && s.x > 0 && s.x < ctx.canvas.width) {
        ctx.fillStyle = this.kind === 'player' ? TUNE.COL.GREEN : TUNE.COL.RED;
        ctx.beginPath();
        ctx.moveTo(s.x, 8); ctx.lineTo(s.x - 5, 18); ctx.lineTo(s.x + 5, 18);
        ctx.closePath(); ctx.fill();
      }
      return;
    }
    // streak
    if (this.trail.length > 1) {
      const t0 = cam.worldToScreen(this.trail[0].x, this.trail[0].y);
      const grad = ctx.createLinearGradient(t0.x, t0.y, s.x, s.y);
      const col = this.kind === 'player' ? '180,255,200' : (this.kind === 'cb' ? '255,120,100' : '255,190,120');
      grad.addColorStop(0, 'rgba(' + col + ',0)');
      grad.addColorStop(1, 'rgba(' + col + ',0.85)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(1.8, 2.2 * Math.min(1, cam.scale * 3));
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      for (let i = 1; i < this.trail.length; i++) {
        const p = cam.worldToScreen(this.trail[i].x, this.trail[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    // glow + body, kept visible even when zoomed far out
    const col = this.kind === 'player' ? '180,255,200' : '255,140,110';
    ctx.fillStyle = 'rgba(' + col + ',0.25)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(5, 2.4 * cam.scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.kind === 'player' ? '#e8ffe8' : '#ffd0c0';
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(2, 1.1 * cam.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}

/* Enemy rocket fired from a launch site toward the FOB: solved at launch with
   altitude and wind taken into account (high arc looks right for rockets). */
function launchEnemyRocket(game, fromX, targetX, jitter) {
  const range = Math.abs(fromX - targetX) + (Math.random() - 0.5) * (jitter || 300);
  const v0 = 680, k = 1.4e-5;
  const dir = targetX > fromX ? 1 : -1;
  const y0 = game.terrain.heightAt(fromX) + 4;
  const dh = game.terrain.heightAt(targetX) - y0;
  const sol = Ballistics.bisectElevation(v0, k, range, dh, game.windX * dir, true);
  const sh = new Shell('rocket', {
    x: fromX, y: y0,
    v0: v0, elevDeg: sol.elevDeg, dir: dir, k: k, windX: game.windX
  });
  game.shells.push(sh);
  return sh;
}
