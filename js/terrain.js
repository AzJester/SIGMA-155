/* SIGMA 155: FIRE MISSION — procedural terrain heightfield + rendering.
   World x in meters [0, TUNE.WORLD_W], y up in meters. Player zone is flattened. */
'use strict';

class Terrain {
  constructor(seed) {
    this.seed = seed || TUNE.GROUND_SEED;
    this.decals = [];   // scorch marks: {x, r}
  }

  /* Ground height (m) at world x. Smooth near the player zone, rolling further out. */
  heightAt(x) {
    const base = Util.fbm(x / 9000, this.seed, 4, 2.1, 0.5) * 260
      + Util.fbm(x / 1400, this.seed + 7, 3, 2.2, 0.5) * 60;
    // flatten the player operating area and the FOB
    const flat = Util.smoothstep((x - 2600) / 2400);  // 0 inside player zone -> 1 beyond 5 km
    return 40 + base * flat;
  }

  addScorch(x) {
    this.decals.push({ x: x, r: 26 + Math.random() * 22 });
    if (this.decals.length > 220) this.decals.shift();
  }

  /* Draw sky, parallax ridges, and the ground for the current camera. */
  draw(ctx, cam, env) {
    const W = ctx.canvas.width, H = ctx.canvas.height;

    // --- sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, env.skyTop);
    sky.addColorStop(0.62, env.skyMid);
    sky.addColorStop(1, env.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // --- stars at night
    if (env.stars) {
      ctx.fillStyle = 'rgba(220,230,255,0.8)';
      for (let i = 0; i < 90; i++) {
        const sx = (Util.hash1(i * 13, 5) * 0.5 + 0.5) * W;
        const sy = (Util.hash1(i * 7, 9) * 0.5 + 0.5) * H * 0.55;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(env.t * (0.4 + (i % 7) * 0.1) + i));
        ctx.globalAlpha = tw * 0.8;
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }

    // --- sun / moon
    ctx.beginPath();
    ctx.fillStyle = env.sunColor;
    ctx.arc(W * env.sunX, H * env.sunY, env.stars ? 26 : 42, 0, Math.PI * 2);
    ctx.fill();
    if (!env.stars) {
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(W * env.sunX, H * env.sunY, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // --- parallax ridge layers (screen-space noise sampled with partial camera motion)
    for (let layer = 0; layer < 3; layer++) {
      const par = [0.06, 0.16, 0.34][layer];
      const baseY = H * [0.52, 0.62, 0.70][layer];
      const amp = [70, 55, 40][layer];
      ctx.fillStyle = env.ridges[layer];
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += 8) {
        const nx = (sx + cam.x * par * cam.scale) / 420;
        const y = baseY - (Util.fbm(nx, this.seed + 31 + layer * 17, 3, 2.0, 0.55) * 0.5 + 0.5) * amp;
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }

    // --- ground surface
    const step = Math.max(2, 4 / cam.scale < 4 ? 4 : Math.floor(4 / cam.scale) * 2);
    ctx.fillStyle = env.ground;
    ctx.beginPath();
    ctx.moveTo(0, H + 4);
    const x0 = cam.screenToWorldX(0), x1 = cam.screenToWorldX(W);
    const wStep = (x1 - x0) / Math.ceil(W / 6);
    for (let wx = x0; wx <= x1 + wStep; wx += wStep) {
      const p = cam.worldToScreen(wx, this.heightAt(wx));
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(W, H + 4);
    ctx.closePath();
    ctx.fill();

    // ground rim light
    ctx.strokeStyle = env.groundRim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let first = true;
    for (let wx = x0; wx <= x1 + wStep; wx += wStep) {
      const p = cam.worldToScreen(wx, this.heightAt(wx));
      if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    void step;

    // --- scorch decals (only worth drawing when zoomed in enough)
    if (cam.scale > 0.08) {
      ctx.fillStyle = 'rgba(8,8,6,0.55)';
      for (const d of this.decals) {
        if (d.x < x0 - 200 || d.x > x1 + 200) continue;
        const p = cam.worldToScreen(d.x, this.heightAt(d.x));
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 1, d.r * cam.scale, d.r * cam.scale * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
