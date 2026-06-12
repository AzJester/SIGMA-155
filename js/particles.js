/* SIGMA 155: FIRE MISSION — particle effects: smoke, flash, dust, shockwaves, tracers, debris */
'use strict';

class Particles {
  constructor() {
    this.list = [];   // {x,y,vx,vy,life,maxLife,size,grow,type,color,grav}
    this.MAX = 900;
  }

  spawn(p) {
    if (this.list.length >= this.MAX) this.list.shift();
    p.life = p.maxLife;
    this.list.push(p);
  }

  muzzleFlash(x, y, dirX, dirY) {
    for (let i = 0; i < 10; i++) {
      const sp = 60 + Math.random() * 160;
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.5;
      this.spawn({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        maxLife: 0.12 + Math.random() * 0.1, size: 4 + Math.random() * 7, grow: 40,
        type: 'flash', color: '255,220,140', grav: 0
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 1.6;
      const sp = 12 + Math.random() * 45;
      this.spawn({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 8,
        maxLife: 1.6 + Math.random() * 1.8, size: 3 + Math.random() * 6, grow: 7,
        type: 'smoke', color: '160,158,148', grav: -3
      });
    }
  }

  explosion(x, y, scale) {
    const s = scale || 1;
    this.spawn({
      x: x, y: y, vx: 0, vy: 0, maxLife: 0.5 * s, size: 6, grow: 220 * s,
      type: 'shock', color: '255,240,200', grav: 0
    });
    for (let i = 0; i < 14 * s; i++) {
      const a = Math.random() * Math.PI - Math.PI * 0.06;
      const sp = (40 + Math.random() * 140) * s;
      this.spawn({
        x: x, y: y, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: Math.abs(Math.sin(a)) * sp,
        maxLife: 0.25 + Math.random() * 0.3, size: 4 + Math.random() * 8 * s, grow: 26,
        type: 'flash', color: '255,170,70', grav: 0
      });
    }
    for (let i = 0; i < 22 * s; i++) {
      const sp = (18 + Math.random() * 60) * s;
      const a = Math.random() * Math.PI;
      this.spawn({
        x: x, y: y, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * sp * 0.9,
        maxLife: 1.8 + Math.random() * 2.4, size: (5 + Math.random() * 9) * s, grow: 9,
        type: 'smoke', color: '70,66,58', grav: -4
      });
    }
    for (let i = 0; i < 10 * s; i++) {
      const a = Math.PI * (0.2 + Math.random() * 0.6);
      const sp = (80 + Math.random() * 160) * s;
      this.spawn({
        x: x, y: y, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * sp,
        maxLife: 0.8 + Math.random() * 0.8, size: 1.6, grow: 0,
        type: 'debris', color: '230,200,150', grav: -260
      });
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < (n || 10); i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 10, y: y + 1, vx: (Math.random() - 0.5) * 26, vy: 4 + Math.random() * 14,
        maxLife: 1.2 + Math.random() * 1.2, size: 3 + Math.random() * 5, grow: 8,
        type: 'smoke', color: '150,138,112', grav: -6
      });
    }
  }

  tracer(x0, y0, x1, y1) {
    this.spawn({
      x: x0, y: y0, vx: 0, vy: 0, maxLife: 0.09, size: 0,
      type: 'line', x1: x1, y1: y1, color: '255,210,120', grav: 0, grow: 0
    });
  }

  intercept(x, y) {
    this.spawn({
      x: x, y: y, vx: 0, vy: 0, maxLife: 0.35, size: 4, grow: 130,
      type: 'shock', color: '140,220,255', grav: 0
    });
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 90;
      this.spawn({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        maxLife: 0.4, size: 2.5, grow: 0, type: 'flash', color: '170,230,255', grav: -40
      });
    }
  }

  update(dt) {
    const out = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.grav || 0) * dt;
      if (p.grow) p.size += p.grow * dt;
      out.push(p);
    }
    this.list = out;
  }

  draw(ctx, cam) {
    for (const p of this.list) {
      const f = p.life / p.maxLife;
      const s = cam.worldToScreen(p.x, p.y);
      if (s.x < -120 || s.x > ctx.canvas.width + 120) continue;
      if (p.type === 'line') {
        const s1 = cam.worldToScreen(p.x1, p.y1);
        ctx.strokeStyle = 'rgba(' + p.color + ',' + (0.85 * f) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
        continue;
      }
      const r = Math.max(0.6, p.size * cam.scale);
      if (p.type === 'shock') {
        ctx.strokeStyle = 'rgba(' + p.color + ',' + (0.7 * f) + ')';
        ctx.lineWidth = Math.max(1, 3 * f);
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
      } else if (p.type === 'flash') {
        ctx.fillStyle = 'rgba(' + p.color + ',' + (0.9 * f) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'debris') {
        ctx.fillStyle = 'rgba(' + p.color + ',' + f + ')';
        ctx.fillRect(s.x, s.y, Math.max(1, 1.6 * cam.scale), Math.max(1, 1.6 * cam.scale));
      } else { // smoke
        ctx.fillStyle = 'rgba(' + p.color + ',' + (0.34 * f) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}
