/* SIGMA 155: FIRE MISSION — the player's gun: movement, emplacement, laying, rendering.
   Side view, facing right (cab forward/right, unmanned turret aft). */
'use strict';

class Vehicle {
  constructor(x) {
    this.x = x;
    this.v = 0;                       // current speed m/s
    this.hp = TUNE.VEHICLE_HP;
    this.state = 'DRIVE';             // DRIVE | EMPLACING | EMPLACED | DISPLACING | REARM
    this.stateT = 0;
    this.elevDeg = 12;                // current barrel elevation
    this.targetElev = 12;
    this.mag = SPEC.MAGAZINE;
    this.cooldown = 0;
    this.rearmT = 0;
    this.wheelPhase = 0;
    this.destroyed = false;
    this.emplaceTime = TUNE.EMPLACE_T;
    this.displaceTime = TUNE.DISPLACE_T;
    this.resupplyTime = TUNE.RESUPPLY_T;
  }

  groundY(game) { return game.terrain.heightAt(this.x); }

  /* Barrel pivot and muzzle in world coordinates. */
  pivot(game) {
    return { x: this.x - 2.2, y: this.groundY(game) + 3.4 };
  }
  muzzle(game) {
    const p = this.pivot(game);
    const e = Util.deg2rad(this.elevDeg);
    return { x: p.x + Math.cos(e) * 8.0, y: p.y + Math.sin(e) * 8.0 };
  }

  canFire() {
    return this.state === 'EMPLACED' && this.cooldown <= 0 && this.mag > 0 &&
      Math.abs(this.elevDeg - this.targetElev) < 0.45 && !this.destroyed;
  }

  laid() { return Math.abs(this.elevDeg - this.targetElev) < 0.45; }

  toggleEmplace() {
    if (this.destroyed) return;
    if (this.state === 'DRIVE') {
      this.state = 'EMPLACING'; this.stateT = 0; this.v = 0;
      Sfx.emplace();
    } else if (this.state === 'EMPLACED') {
      this.state = 'DISPLACING'; this.stateT = 0;
      Sfx.emplace();
    } else if (this.state === 'REARM') {
      this.state = 'DRIVE'; this.rearmT = 0; // abort rearm
    }
  }

  startRearm() {
    if (!this.destroyed && this.state === 'DRIVE' && Math.abs(this.v) < 0.5 && this.mag < SPEC.MAGAZINE) {
      this.state = 'REARM'; this.rearmT = 0;
      Sfx.rearm();
      return true;
    }
    return false;
  }

  update(dt, game) {
    if (this.destroyed) return;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // barrel laying — the automated handling re-lays much faster mid-MRSI sequence
    const layRate = TUNE.LAY_RATE_DEG * (game.mrsiActive ? 4 : 1);
    const d = this.targetElev - this.elevDeg;
    if (Math.abs(d) > 0.05) {
      const step = Util.clamp(d, -layRate * dt, layRate * dt);
      this.elevDeg += step;
    }

    switch (this.state) {
      case 'DRIVE': {
        let ax = 0;
        if (Input.held('KeyA') || Input.held('ArrowLeft')) ax -= 1;
        if (Input.held('KeyD') || Input.held('ArrowRight')) ax += 1;
        if (ax !== 0) {
          this.v += ax * TUNE.DRIVE_ACCEL * dt;
        } else {
          this.v *= Math.pow(0.02, dt);
          if (Math.abs(this.v) < 0.3) this.v = 0;
        }
        this.v = Util.clamp(this.v, -TUNE.DRIVE_SPEED, TUNE.DRIVE_SPEED);
        this.x += this.v * dt;
        this.x = Util.clamp(this.x, TUNE.PLAYER_MIN_X, TUNE.PLAYER_MAX_X);
        this.wheelPhase += this.v * dt / 0.8;
        if (Math.abs(this.v) > 4 && Math.random() < dt * 9) {
          game.particles.dust(this.x - 6 * Math.sign(this.v), this.groundY(game), 2);
        }
        break;
      }
      case 'EMPLACING':
        this.stateT += dt;
        if (this.stateT === dt) game.particles.dust(this.x, this.groundY(game), 6);
        if (this.stateT >= this.emplaceTime) {
          this.state = 'EMPLACED'; this.stateT = 0;
          game.particles.dust(this.x, this.groundY(game), 10);
          Sfx.confirm();
        }
        break;
      case 'DISPLACING':
        this.stateT += dt;
        if (this.stateT >= this.displaceTime) {
          this.state = 'DRIVE'; this.stateT = 0;
          game.onDisplaced();
        }
        break;
      case 'REARM':
        this.rearmT += dt;
        if (this.rearmT >= this.resupplyTime) {
          this.mag = SPEC.MAGAZINE;
          this.state = 'DRIVE'; this.rearmT = 0;
          Sfx.confirm();
          game.toast('MAGAZINE FULL — 40 ROUNDS', TUNE.COL.GREEN);
        }
        break;
      case 'EMPLACED':
        break;
    }
  }

  fireRound(game) {
    if (this.mag <= 0) return false;
    this.mag--;
    this.cooldown = game.mrsiActive ? TUNE.MRSI_GAP : TUNE.SHOT_COOLDOWN;
    const m = this.muzzle(game);
    const e = Util.deg2rad(this.elevDeg);
    game.particles.muzzleFlash(m.x, m.y, Math.cos(e), Math.sin(e));
    game.camera.addShake(10);
    Sfx.fire();
    return true;
  }

  takeDamage(dmg, game) {
    if (this.destroyed) return;
    this.hp -= dmg;
    game.camera.addShake(Math.min(18, dmg * 0.6));
    if (this.hp <= 0) {
      this.hp = 0;
      this.destroyed = true;
      const gy = this.groundY(game);
      game.particles.explosion(this.x, gy + 2, 1.6);
      game.particles.explosion(this.x + 3, gy + 3, 1.2);
      Sfx.impact(0);
      game.onVehicleDestroyed();
    }
  }

  /* Emplacement fraction for stabilizer animation: 0 up, 1 down. */
  stabFrac() {
    if (this.state === 'EMPLACED') return 1;
    if (this.state === 'EMPLACING') return Util.easeOutCubic(this.stateT / this.emplaceTime);
    if (this.state === 'DISPLACING') return 1 - Util.easeOutCubic(this.stateT / this.displaceTime);
    return 0;
  }

  draw(ctx, cam, game) {
    const gy = this.groundY(game);
    const p = cam.worldToScreen(this.x, gy);
    const s = cam.scale;

    // tactical-zoom icon
    if (s < 0.10) {
      ctx.fillStyle = this.destroyed ? TUNE.COL.RED : TUNE.COL.GREEN;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 9); ctx.lineTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y);
      ctx.closePath(); ctx.fill();
      return;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    // terrain tilt
    const slope = (game.terrain.heightAt(this.x + 6) - game.terrain.heightAt(this.x - 6)) / 12;
    ctx.rotate(-Math.atan(slope));

    const dark = this.destroyed;
    const body = dark ? '#33302a' : '#4f5a40';
    const body2 = dark ? '#262420' : '#5e6a4b';
    const steel = dark ? '#222' : '#394130';

    // local coords in meters, +x right, y drawn negative (up). Origin at ground under center.
    // stabilizers (two visible per side pair)
    const sf = this.stabFrac();
    if (sf > 0.02) {
      ctx.strokeStyle = steel; ctx.lineWidth = 0.35;
      for (const sx of [-5.6, 1.6]) {
        ctx.beginPath();
        ctx.moveTo(sx, -1.5);
        ctx.lineTo(sx - 0.5, -1.5 + sf * 1.5);
        ctx.stroke();
        ctx.fillStyle = steel;
        ctx.fillRect(sx - 1.0, -0.25 + (sf - 1) * 1.4, 1.0, 0.3);
      }
    }

    // wheels: 5 axles
    const axles = [-5.2, -3.4, -1.6, 1.8, 3.6];
    for (const wx of axles) {
      ctx.fillStyle = '#1c1c19';
      ctx.beginPath(); ctx.arc(wx, -0.85, 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark ? '#2a2a26' : '#3a3a33';
      ctx.beginPath(); ctx.arc(wx, -0.85, 0.45, 0, Math.PI * 2); ctx.fill();
      // hub spoke to show wheel spin
      ctx.strokeStyle = '#181815'; ctx.lineWidth = 0.16;
      ctx.beginPath();
      ctx.moveTo(wx, -0.85);
      ctx.lineTo(wx + Math.cos(this.wheelPhase) * 0.42, -0.85 + Math.sin(this.wheelPhase) * 0.42);
      ctx.stroke();
    }

    // chassis deck
    ctx.fillStyle = body;
    ctx.fillRect(-6.4, -2.2, 12.6, 0.85);

    // armored cab (front right)
    ctx.fillStyle = body2;
    ctx.beginPath();
    ctx.moveTo(3.0, -2.2);
    ctx.lineTo(3.0, -4.6);
    ctx.lineTo(4.6, -4.6);
    ctx.lineTo(6.2, -3.4);
    ctx.lineTo(6.2, -2.2);
    ctx.closePath();
    ctx.fill();
    // windows
    ctx.fillStyle = dark ? '#1a1a18' : 'rgba(120,180,200,0.85)';
    ctx.beginPath();
    ctx.moveTo(4.55, -4.35);
    ctx.lineTo(5.85, -3.4);
    ctx.lineTo(4.55, -3.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(3.35, -4.3, 0.95, 0.95);
    // RWS on cab roof
    ctx.fillStyle = steel;
    ctx.fillRect(3.7, -5.05, 0.7, 0.5);
    ctx.fillRect(4.35, -4.95, 0.9, 0.18);

    // unmanned turret (aft)
    ctx.fillStyle = body2;
    ctx.beginPath();
    ctx.moveTo(-6.2, -2.2);
    ctx.lineTo(-6.0, -4.4);
    ctx.lineTo(0.6, -4.7);
    ctx.lineTo(2.4, -2.9);
    ctx.lineTo(2.4, -2.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = body;
    ctx.fillRect(-5.4, -4.95, 3.3, 0.6);

    // barrel from pivot (-2.2, 3.4 above ground)
    const e = Util.deg2rad(this.elevDeg);
    ctx.save();
    ctx.translate(-2.2, -3.4);
    ctx.rotate(-e);
    ctx.fillStyle = steel;
    ctx.fillRect(0, -0.22, 6.6, 0.44);
    ctx.fillRect(6.6, -0.28, 1.05, 0.56);     // muzzle brake
    ctx.fillRect(2.9, -0.3, 0.8, 0.6);        // fume extractor
    ctx.fillStyle = body2;
    ctx.fillRect(-0.7, -0.62, 1.7, 1.24);     // cradle
    ctx.restore();

    // destroyed smoke
    if (dark && Math.random() < 0.3) {
      game.particles.dust(this.x + (Math.random() - 0.5) * 6, gy + 3, 1);
    }
    ctx.restore();

    this.drawStateBar(ctx, cam, game);
  }

  /* Emplace/displace/rearm progress readout — drawn on the HUD canvas so it works
     with both the WebGL and the fallback renderer. */
  drawStateBar(ctx, cam, game) {
    const p = cam.worldToScreen(this.x, this.groundY(game));
    const s = cam.scale;
    if (this.state === 'REARM') {
      const f = this.rearmT / this.resupplyTime;
      this._bar(ctx, p.x, p.y - 110 * Math.min(1, s), 'REARMING CASSETTE', f, TUNE.COL.AMBER);
    } else if (this.state === 'EMPLACING') {
      this._bar(ctx, p.x, p.y - 110 * Math.min(1, s), 'EMPLACING', this.stateT / this.emplaceTime, TUNE.COL.CYAN);
    } else if (this.state === 'DISPLACING') {
      this._bar(ctx, p.x, p.y - 110 * Math.min(1, s), 'DISPLACING', this.stateT / this.displaceTime, TUNE.COL.CYAN);
    }
  }

  _bar(ctx, x, y, label, f, color) {
    ctx.font = '11px Consolas, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(label, x, y - 6);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 40, y, 80, 7);
    ctx.fillRect(x - 40, y, 80 * Util.clamp(f, 0, 1), 7);
    ctx.textAlign = 'left';
  }
}
