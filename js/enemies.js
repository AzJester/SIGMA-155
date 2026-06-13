/* SIGMA 155: FIRE MISSION — enemy sites, convoys, spotter drones, counter-battery director, FOB */
'use strict';

const SITE_DEFS = {
  ROCKET: { hp: 60, label: 'ROCKET SITE', desc: 'Launches salvos at the FOB' },
  GUN:    { hp: 80, label: 'ENEMY BATTERY', desc: 'Shoots the counter-battery missions' },
  RADAR:  { hp: 50, label: 'CB RADAR', desc: 'Doubles counter-battery lock rate' },
  JAMMER: { hp: 45, label: 'GPS JAMMER', desc: 'Degrades FCS precision while alive' },
  ATGM:   { hp: 35, label: 'ATGM TEAM', desc: 'High-value position' },
  DUMP:   { hp: 110, label: 'SUPPLY DUMP', desc: 'Soft target, big score' }
};

class Site {
  constructor(type, x, opts) {
    const d = SITE_DEFS[type];
    this.type = type;
    this.x = x;
    this.hp = d.hp; this.maxHp = d.hp;
    this.label = d.label;
    this.primary = !opts || opts.primary !== false;
    this.launchInterval = (opts && opts.interval) || 26;
    this.launchT = this.launchInterval * (0.4 + Math.random() * 0.6);
    this.dead = false;
    this.anim = Math.random() * 10;
  }

  update(dt, game) {
    if (this.dead) return;
    this.anim += dt;
    if (this.type === 'ROCKET') {
      this.launchT -= dt * game.enemyTempo;
      if (this.launchT <= 0) {
        this.launchT = this.launchInterval * (0.8 + Math.random() * 0.4);
        // when a resupply escort is rolling, the rockets go after the truck
        const escort = game.escort && !game.escort.dead && Math.random() < 0.6;
        const tx = escort ? game.escort.x + 60 : TUNE.FOB_X;
        launchEnemyRocket(game, this.x, tx, escort ? 260 : 400);
        game.particles.muzzleFlash(this.x, game.terrain.heightAt(this.x) + 3, -0.5, 0.85);
        game.toast(escort
          ? 'ROCKET LAUNCH — TARGETING RESUPPLY TRUCK'
          : 'ROCKET LAUNCH — ' + Util.fmtKm(this.x - game.vehicle.x, 0), TUNE.COL.AMBER);
      }
    }
  }

  damage(dmg, game, mrsi) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      game.onSiteDestroyed(this, mrsi);
    }
  }

  draw(ctx, cam, game) {
    const gy = game.terrain.heightAt(this.x);
    const p = cam.worldToScreen(this.x, gy);
    if (p.x < -120 || p.x > ctx.canvas.width + 120) return;
    const s = cam.scale;

    if (s < 0.10) {
      // tactical icon
      ctx.strokeStyle = this.dead ? 'rgba(120,120,110,0.7)' : TUNE.COL.RED;
      ctx.fillStyle = this.dead ? 'rgba(60,60,55,0.6)' : 'rgba(255,95,86,0.25)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(p.x - 6, p.y - 12, 12, 9);
      ctx.fill(); ctx.stroke();
      ctx.font = '9px Consolas, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText({ ROCKET: 'RKT', GUN: 'ART', RADAR: 'RDR', JAMMER: 'JAM', ATGM: 'AT', DUMP: 'SUP' }[this.type], p.x, p.y - 15);
      ctx.textAlign = 'left';
      return;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    const alive = !this.dead;
    const c1 = alive ? '#6b5d49' : '#2e2a24';
    const c2 = alive ? '#57503e' : '#262320';

    if (this.type === 'ROCKET') {
      ctx.fillStyle = c1;
      ctx.fillRect(-4, -2.4, 8, 1.6);                       // truck bed
      ctx.fillStyle = '#1d1d1a';
      for (const wx of [-2.8, 0, 2.8]) { ctx.beginPath(); ctx.arc(wx, -0.8, 0.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.save();
      ctx.translate(1.0, -2.4);
      ctx.rotate(Util.deg2rad(-55));                        // rack tilted toward player (left/up)
      ctx.fillStyle = c2;
      ctx.fillRect(-4.4, -1.1, 4.4, 2.2);
      ctx.fillStyle = alive ? '#3c3c33' : '#222';
      for (let i = 0; i < 3; i++) ctx.fillRect(-4.2, -0.95 + i * 0.7, 4.0, 0.5);
      ctx.restore();
    } else if (this.type === 'GUN') {
      ctx.fillStyle = c1;
      ctx.fillRect(-3.6, -2.0, 7.2, 1.4);
      ctx.fillStyle = '#1d1d1a';
      for (const wx of [-2.4, 2.4]) { ctx.beginPath(); ctx.arc(wx, -0.7, 0.9, 0, Math.PI * 2); ctx.fill(); }
      ctx.save();
      ctx.translate(-0.5, -2.2);
      ctx.rotate(Util.deg2rad(-180 + 38));                  // barrel toward player side, elevated
      ctx.fillStyle = c2;
      ctx.fillRect(0, -0.25, 6.0, 0.5);
      ctx.restore();
      ctx.fillStyle = c2;
      ctx.fillRect(-1.6, -3.0, 2.6, 1.2);
    } else if (this.type === 'RADAR') {
      ctx.fillStyle = c2;
      ctx.fillRect(-0.4, -4.6, 0.8, 4.6);                   // mast
      ctx.fillRect(-2.2, -1.4, 4.4, 1.4);                   // shelter
      ctx.save();
      ctx.translate(0, -4.6);
      if (alive) ctx.rotate(Math.sin(this.anim * 1.8) * 0.7);
      ctx.fillStyle = alive ? '#7a8577' : '#33302a';
      ctx.fillRect(-1.7, -1.5, 3.4, 1.5);
      ctx.restore();
    } else if (this.type === 'JAMMER') {
      ctx.fillStyle = c2;
      ctx.fillRect(-0.35, -5.2, 0.7, 5.2);                  // mast
      ctx.fillRect(-1.9, -1.2, 3.8, 1.2);                   // shelter
      ctx.fillStyle = alive ? '#8a7f5d' : '#33302a';
      ctx.beginPath(); ctx.arc(0, -5.4, 0.7, 0, Math.PI * 2); ctx.fill();
      if (alive) {
        const ph = (this.anim % 1.6) / 1.6;
        ctx.strokeStyle = TUNE.COL.AMBER;
        for (let i = 0; i < 2; i++) {
          const pp = (ph + i * 0.5) % 1;
          ctx.globalAlpha = 0.7 * (1 - pp);
          ctx.lineWidth = 0.16;
          ctx.beginPath(); ctx.arc(0, -5.4, 1.2 + pp * 3.4, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    } else if (this.type === 'ATGM') {
      ctx.fillStyle = c2;
      ctx.fillRect(-1.8, -1.0, 3.6, 1.0);                   // berm
      ctx.fillStyle = c1;
      ctx.fillRect(-0.7, -1.9, 1.8, 0.9);                   // launcher box
    } else if (this.type === 'DUMP') {
      ctx.fillStyle = c2;
      for (let i = 0; i < 4; i++) ctx.fillRect(-3.4 + i * 1.8, -1.5, 1.5, 1.5);
      ctx.fillStyle = c1;
      for (let i = 0; i < 3; i++) ctx.fillRect(-2.6 + i * 1.8, -2.6, 1.5, 1.1);
    }
    if (this.dead) {
      ctx.fillStyle = 'rgba(20,18,15,0.55)';
      ctx.fillRect(-4.5, -3.2, 9, 3.2);
    }
    ctx.restore();

    // HP bar when damaged
    if (alive && this.hp < this.maxHp && s > 0.04) {
      const w = 46;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x - w / 2, p.y - 14 - 5 * s, w, 4);
      ctx.fillStyle = TUNE.COL.RED;
      ctx.fillRect(p.x - w / 2, p.y - 14 - 5 * s, w * (this.hp / this.maxHp), 4);
    }
  }
}

class Convoy {
  constructor(x, n, speed) {
    this.units = [];
    for (let i = 0; i < n; i++) this.units.push({ x: x + i * 60, hp: 25, dead: false });
    this.speed = speed || 8;
    this.label = 'CONVOY';
    this.type = 'CONVOY';
    this.primary = true;
    this.dead = false;
  }

  get x() {
    const alive = this.units.filter(u => !u.dead);
    return alive.length ? alive[0].x : 0;
  }
  get hp() { return this.units.reduce((a, u) => a + (u.dead ? 0 : u.hp), 0); }
  get maxHp() { return this.units.length * 25; }

  update(dt, game) {
    if (this.dead) return;
    let any = false;
    for (const u of this.units) {
      if (u.dead) continue;
      any = true;
      u.x -= this.speed * dt * game.enemyTempo;
      if (u.x <= TUNE.PLAYER_MAX_X + 900) {
        u.dead = true;
        game.baseDamage(TUNE.CONVOY_BASE_DMG, 'CONVOY REACHED THE LINE');
        game.particles.explosion(u.x, game.terrain.heightAt(u.x) + 2, 0.8);
      }
    }
    if (!any) this.dead = true;
  }

  damageAt(x, dmg, game, mrsi) {
    let killed = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      const d = Math.abs(u.x - x);
      if (d < TUNE.SHELL_RADIUS) {
        const dd = dmg * (1 - d / TUNE.SHELL_RADIUS);
        u.hp -= dd;
        game.score += Math.round(dd * TUNE.SCORE_PER_HP * 0.5);
        if (u.hp <= 0) {
          u.dead = true; killed++;
          game.particles.explosion(u.x, game.terrain.heightAt(u.x) + 1.5, 0.9);
          game.score += mrsi ? TUNE.SCORE_MRSI_KILL : TUNE.SCORE_KILL;
        }
      }
    }
    if (killed && this.units.every(u => u.dead)) {
      this.dead = true;
      game.onSiteDestroyed(this, mrsi);
    }
    return killed;
  }

  draw(ctx, cam, game) {
    for (const u of this.units) {
      if (u.dead) continue;
      const gy = game.terrain.heightAt(u.x);
      const p = cam.worldToScreen(u.x, gy);
      if (p.x < -60 || p.x > ctx.canvas.width + 60) continue;
      const s = cam.scale;
      if (s < 0.10) {
        ctx.fillStyle = TUNE.COL.RED;
        ctx.fillRect(p.x - 4, p.y - 7, 8, 5);
        ctx.beginPath();
        ctx.moveTo(p.x - 7, p.y - 4); ctx.lineTo(p.x - 4, p.y - 7); // motion chevron
        ctx.strokeStyle = TUNE.COL.RED; ctx.lineWidth = 1; ctx.stroke();
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(s, s);
      ctx.fillStyle = '#5a4f3c';
      ctx.fillRect(-2.6, -2.2, 5.2, 1.5);
      ctx.fillRect(-2.6, -3.0, 1.7, 0.8);
      ctx.fillStyle = '#1d1d1a';
      for (const wx of [-1.7, 1.7]) { ctx.beginPath(); ctx.arc(wx, -0.7, 0.7, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }
}

class Drone {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.dead = false;
    this.anim = Math.random() * 10;
    this.engageT = 0;
  }

  update(dt, game) {
    if (this.dead) return;
    this.anim += dt;
    const veh = game.vehicle;
    // fly toward a loiter point above the vehicle
    const tx = veh.x + Math.sin(this.anim * 0.5) * 350;
    this.x += Util.clamp(tx - this.x, -55 * dt, 55 * dt);
    const ty = game.terrain.heightAt(this.x) + 420 + Math.sin(this.anim * 0.9) * 60;
    this.y += Util.clamp(ty - this.y, -30 * dt, 30 * dt);

    // RWS auto-engagement
    const d = Util.dist(this.x, this.y, veh.x, veh.groundY(game) + 5);
    if (!veh.destroyed && d < game.rwsRange) {
      this.engageT += dt;
      if (Math.random() < dt * 2.5) {
        const m = { x: veh.x + 4, y: veh.groundY(game) + 5 };
        game.particles.tracer(m.x, m.y, this.x + (Math.random() - 0.5) * 40, this.y + (Math.random() - 0.5) * 40);
        if (Math.random() < 0.4) Sfx.rws();
      }
      if (Math.random() < dt * game.rwsKillChance) {
        this.dead = true;
        game.particles.explosion(this.x, this.y, 0.5);
        game.score += 150;
        Sfx.droneDown();
        game.toast('SPOTTER DRONE DOWN — RWS', TUNE.COL.GREEN);
      }
    }
  }

  overhead(game) {
    return !this.dead && Math.abs(this.x - game.vehicle.x) < TUNE.DRONE_SPOT_RANGE;
  }

  draw(ctx, cam) {
    if (this.dead) return;
    const p = cam.worldToScreen(this.x, this.y);
    if (p.x < -40 || p.x > ctx.canvas.width + 40 || p.y < -40) return;
    const s = Math.max(0.4, Math.min(1.6, cam.scale));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = TUNE.COL.RED;
    ctx.fillStyle = '#3a3632';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-9 * s, 0); ctx.lineTo(9 * s, 0);           // wing
    ctx.moveTo(0, 0); ctx.lineTo(0, 3.5 * s);
    ctx.moveTo(-3 * s, 3.5 * s); ctx.lineTo(3 * s, 3.5 * s); // tail
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.2 * s, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

/* Counter-battery director: builds radar lock from player fire, answers with salvos. */
class CBDirector {
  constructor(lockRate) {
    this.lock = 0;
    this.lockRate = lockRate;        // multiplier on TUNE.CB_LOCK_PER_SHOT
    this.recentShots = [];           // x positions of recent firings
    this.incoming = 0;               // viewer-seconds until first impact (display)
    this.salvoActive = false;
  }

  radarAlive(game) { return game.sites.some(s => s.type === 'RADAR' && !s.dead); }
  gunsAlive(game) { return game.sites.filter(s => s.type === 'GUN' && !s.dead); }

  onPlayerShot(game) {
    if (this.lockRate <= 0) return;
    const guns = this.gunsAlive(game);
    if (!guns.length) return;
    let inc = TUNE.CB_LOCK_PER_SHOT * this.lockRate;
    if (this.radarAlive(game)) inc *= 1.6;
    if (game.drones.some(d => d.overhead(game))) inc *= TUNE.DRONE_LOCK_MULT;
    this.lock += inc;
    this.recentShots.push(game.vehicle.x);
    if (this.recentShots.length > 4) this.recentShots.shift();
    if (this.lock >= 1) this.fireSalvo(game);
  }

  onDisplaced(game) {
    // moving far enough from the registered position degrades the track
    if (this.recentShots.length) {
      const avg = this.recentShots.reduce((a, b) => a + b, 0) / this.recentShots.length;
      if (Math.abs(game.vehicle.x - avg) > TUNE.CB_SAFE_DIST) {
        this.lock *= TUNE.CB_RESET_ON_MOVE;
        this.recentShots = [];
      }
    }
  }

  fireSalvo(game) {
    this.lock = 0.15;
    const guns = this.gunsAlive(game);
    if (!guns.length) return;
    const aim = this.recentShots.length
      ? this.recentShots.reduce((a, b) => a + b, 0) / this.recentShots.length
      : game.vehicle.x;
    this.recentShots = [];
    let maxTofViewer = 0;
    for (let i = 0; i < TUNE.CB_SALVO; i++) {
      const gun = guns[i % guns.length];
      const tx = aim + (Math.random() - 0.5) * 2 * TUNE.CB_SPREAD;
      const range = Math.abs(gun.x - tx);
      const y0 = game.terrain.heightAt(gun.x) + 3;
      const dh = game.terrain.heightAt(tx) - y0;
      // deep batteries shoot rocket-assisted; shooter fires toward -x, so its
      // forward-frame wind is the negated world wind
      const ci = range > Ballistics.tables[4].maxRange * 0.92 ? 5 : 4;
      const v0 = Ballistics.CHARGES[ci].v0, k = Ballistics.dragK(ci);
      const sol = Ballistics.bisectElevation(v0, k, range, dh, -game.windX, false);
      if (!sol || sol.range < range * 0.7) continue;
      const sh = new Shell('cb', {
        x: gun.x, y: y0,
        v0: v0,
        elevDeg: sol.elevDeg + (Math.random() - 0.5) * 0.3,
        dir: -1, k: k, windX: game.windX,
        timeScale: TUNE.CB_TIME_SCALE
      });
      game.shells.push(sh);
      game.particles.muzzleFlash(gun.x, game.terrain.heightAt(gun.x) + 3, -0.7, 0.7);
      maxTofViewer = Math.max(maxTofViewer, sol.tof / TUNE.CB_TIME_SCALE);
    }
    this.incoming = maxTofViewer;
    this.salvoActive = true;
    Sfx.alarm();
    game.toast('COUNTER-BATTERY INBOUND — DISPLACE NOW', TUNE.COL.RED, 4);
  }

  update(dt, game) {
    if (this.lockRate <= 0) return;
    this.lock = Math.max(0, this.lock - TUNE.CB_LOCK_DECAY * dt *
      (game.vehicle.state === 'DRIVE' ? 1.6 : 1));
    if (this.salvoActive) {
      this.incoming -= dt;
      if (this.incoming <= 0 || !game.shells.some(s => s.kind === 'cb' && !s.dead)) {
        this.salvoActive = false;
        this.incoming = 0;
      }
    }
  }
}

/* Friendly resupply truck — escort event: it drives in from the rear toward the FOB
   under rocket fire; if it arrives, the gun gets an instant full cassette. */
class EscortTruck {
  constructor(x) {
    this.x = x;
    this.speed = 13;
    this.dead = false;
    this.arrived = false;
    this.label = 'RESUPPLY TRUCK';
  }

  update(dt, game) {
    if (this.dead) return;
    this.x += this.speed * dt;
    if (Math.random() < dt * 3) game.particles.dust(this.x - 4, game.terrain.heightAt(this.x), 1);
    if (this.x >= TUNE.FOB_X) {
      this.dead = true;
      this.arrived = true;
      game.onEscortArrived(this);
    }
  }

  destroy(game) {
    if (this.dead) return;
    this.dead = true;
    game.particles.explosion(this.x, game.terrain.heightAt(this.x) + 2, 1.1);
    Sfx.impact(Math.abs(this.x - game.camera.x));
    game.toast('RESUPPLY TRUCK LOST — NO CASSETTE THIS WAVE', TUNE.COL.RED, 3.5);
  }

  draw(ctx, cam, game) {
    if (this.dead) return;
    const gy = game.terrain.heightAt(this.x);
    const p = cam.worldToScreen(this.x, gy);
    if (p.x < -80 || p.x > ctx.canvas.width + 80) return;
    const s = cam.scale;
    if (s < 0.10) {
      ctx.fillStyle = TUNE.COL.CYAN;
      ctx.fillRect(p.x - 4, p.y - 7, 8, 5);
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.fillStyle = '#46523f';
    ctx.fillRect(-3.4, -2.4, 6.8, 1.7);
    ctx.fillStyle = '#52604a';
    ctx.fillRect(1.6, -3.3, 1.8, 0.9);
    ctx.fillStyle = '#3c4636';
    ctx.fillRect(-3.0, -3.6, 4.0, 1.2);      // cassette pod
    ctx.fillStyle = '#1c1c19';
    for (const wx of [-2.4, -0.6, 1.4, 2.8]) {
      ctx.beginPath(); ctx.arc(wx, -0.8, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

/* Friendly forward operating base — what the rockets and convoys are trying to kill. */
class Fob {
  constructor(x) { this.x = x; }

  draw(ctx, cam, game) {
    const gy = game.terrain.heightAt(this.x);
    const p = cam.worldToScreen(this.x, gy);
    if (p.x < -300 || p.x > ctx.canvas.width + 300) return;
    const s = cam.scale;
    if (s < 0.10) {
      ctx.strokeStyle = TUNE.COL.CYAN;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(p.x - 7, p.y - 10, 14, 8);
      ctx.font = '9px Consolas, Menlo, monospace';
      ctx.fillStyle = TUNE.COL.CYAN;
      ctx.textAlign = 'center';
      ctx.fillText('FOB', p.x, p.y - 13);
      ctx.textAlign = 'left';
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    const integ = game.baseIntegrity / 100;
    ctx.fillStyle = integ > 0.4 ? '#4a523f' : '#3a342c';
    // tents
    for (const [tx, tw] of [[-26, 7], [-15, 9], [3, 8], [16, 6]]) {
      ctx.beginPath();
      ctx.moveTo(tx, 0); ctx.lineTo(tx + tw / 2, -3.2); ctx.lineTo(tx + tw, 0);
      ctx.closePath(); ctx.fill();
    }
    // antenna mast
    ctx.strokeStyle = '#6a705f'; ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-2, -9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -9); ctx.lineTo(0.4, -7.6); ctx.stroke();
    // HESCO line
    ctx.fillStyle = '#57503e';
    for (let i = 0; i < 9; i++) ctx.fillRect(-32 + i * 7.4, -1.6, 6.6, 1.6);
    ctx.restore();
  }
}
