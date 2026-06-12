/* SIGMA 155: FIRE MISSION — mission orchestration: state, input handling, combat resolution */
'use strict';

class Game {
  constructor(canvas, mission, opts) {
    this.canvas = canvas;
    this.mission = mission;
    this.endless = !!(opts && opts.endless);
    this.upgrades = (opts && opts.upgrades) || {};
    this.rand = Util.rng((Date.now() & 0xffff) ^ 0xBEEF);

    this.terrain = new Terrain(TUNE.GROUND_SEED + (this.endless ? 17 : MISSIONS.indexOf(mission)));
    this.camera = new Camera(canvas);
    this.particles = new Particles();
    this.vehicle = new Vehicle(900);
    this.fob = new Fob(TUNE.FOB_X);
    this.env = Object.assign({}, ENVS[mission.env]);

    this.sites = [];
    this.convoys = [];
    this.drones = [];
    this.shells = [];
    this.toasts = [];

    this.cb = new CBDirector(mission.cbRate);
    this.windX = (mission.windRange[0] + this.rand() * (mission.windRange[1] - mission.windRange[0])) *
      (this.rand() < 0.5 ? -1 : 1);

    this.score = 0;
    this.baseIntegrity = mission.baseIntegrity || 100;
    this.missionT = 0;
    this.wave = 1;
    this.over = false;
    this.overT = 0;
    this.result = null;            // 'WIN' | 'LOSE'

    // fire control state
    this.selectedTarget = null;
    this.solution = null;
    this.chargeIdx = 2;
    this.manualMode = false;
    this._solveT = 0;

    // MRSI
    this.mrsiActive = false;
    this.mrsiPlan = [];
    this.mrsiIndex = 0;
    this.mrsiT = 0;
    this.mrsiTargetX = 0;
    this._mrsiGroupSeq = 0;

    // stats
    this.roundsFired = 0;
    this.hits = 0;
    this.kills = 0;
    this.mrsiKills = 0;

    this.droneT = mission.droneEvery ? mission.droneEvery * 0.7 : 0;
    this.interceptsLeft = 0;
    this.camAuto = true;
    this.tacticalFocusX = 20000;
    this.tutorialMsg = '';
    this._tutStep = 0;

    this.applyUpgrades();
    if (this.endless) this.spawnWave(endlessWave(1, this.rand));
    else this.spawnWave(mission);
    if (mission.grantRap) this.rap = true;
  }

  applyUpgrades() {
    const u = this.upgrades;
    this.rap = !!u.RAP;
    this.excalibur = !!u.EXCALIBUR;
    this.lattice = !!u.LATTICE;
    this.ironFist = !!u.IRON_FIST;
    this.enemyTempo = this.lattice ? 0.75 : 1;
    this.rwsRange = TUNE.RWS_RANGE;
    this.rwsKillChance = TUNE.RWS_KILL_CHANCE;
    if (u.CREW_DRILL) {
      this.vehicle.emplaceTime = TUNE.EMPLACE_T * 0.65;
      this.vehicle.displaceTime = TUNE.DISPLACE_T * 0.65;
    }
    if (u.CASSETTE) this.vehicle.resupplyTime = TUNE.RESUPPLY_T * 0.5;
  }

  spawnWave(def) {
    for (const s of (def.sites || [])) this.sites.push(new Site(s[0], s[1], s[2]));
    for (const c of (def.convoys || [])) this.convoys.push(new Convoy(c.x, c.n, c.speed));
  }

  targetList() {
    return this.sites.concat(this.convoys);
  }

  toast(msg, color, dur) {
    this.toasts.push({ msg: msg, color: color || TUNE.COL.WHITE, life: dur || 2.6 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  selectTarget(t) {
    if (t.dead) return;
    this.selectedTarget = t;
    this.manualMode = false;
    this._solveT = 0;
    this.computeSolution();
    Sfx.click();
    if (this.solution) Sfx.lay();
  }

  dispersionAt(range) {
    let sigma = range * (SPEC.DEVIATION_PCT / 100);
    if (this.excalibur) sigma *= 0.2;
    return Math.max(12, sigma);
  }

  /* Height of the target's ground above the gun muzzle — the FCS corrects for it. */
  heightOffsetTo(x) {
    const m = this.vehicle.muzzle(this);
    return this.terrain.heightAt(x) - m.y;
  }

  computeSolution() {
    const t = this.selectedTarget;
    if (!t || t.dead) { this.solution = null; return; }
    const range = Math.abs(t.x - this.vehicle.x);
    this.solution = Ballistics.compensatedSolution(range, this.windX, this.rap,
      null, false, this.heightOffsetTo(t.x));
    if (this.solution) {
      this.chargeIdx = this.solution.chargeIdx;
      this.vehicle.targetElev = this.solution.elevDeg;
    }
  }

  /* ---------------- input ---------------- */

  handleInput(dt) {
    const veh = this.vehicle;
    if (veh.destroyed) return;

    if (Input.hit('KeyE')) veh.toggleEmplace();
    if (Input.hit('KeyR')) {
      if (!veh.startRearm()) {
        if (veh.mag === SPEC.MAGAZINE) this.toast('MAGAZINE ALREADY FULL', TUNE.COL.WHITE);
        else { this.toast('REARM REQUIRES STATIONARY, STABILIZERS UP', TUNE.COL.AMBER); Sfx.deny(); }
      }
    }
    if (Input.hit('Tab')) {
      if (this.camera.mode !== 'TACTICAL') {
        this.tacticalFocusX = this.selectedTarget ? this.selectedTarget.x :
          (this.furthestAlive() || 24000);
        this.camera.mode = 'TACTICAL';
      } else this.camera.mode = 'GUN';
    }
    if (Input.hit('KeyC')) {
      this.camAuto = !this.camAuto;
      this.toast('SHELL CAMERA ' + (this.camAuto ? 'ON' : 'OFF'), TUNE.COL.WHITE, 1.4);
    }

    // manual lay
    const elevStep = (Input.held('ShiftLeft') || Input.held('ShiftRight')) ? 14 : 5;
    if (Input.held('ArrowUp') || Input.held('KeyW')) this.manualAdjust(elevStep * dt, 0);
    if (Input.held('ArrowDown') || Input.held('KeyS')) this.manualAdjust(-elevStep * dt, 0);
    if (Input.hit('KeyQ')) this.manualAdjust(0, 1);
    if (Input.hit('KeyZ')) this.manualAdjust(0, -1);
    if (Input.mouse.wheel) this.manualAdjust(-Input.mouse.wheel * 1.2, 0);

    // MRSI
    if (Input.hit('KeyM')) this.tryMrsi();

    // fire
    if (Input.hit('Space') || Input.hit('KeyF')) this.tryFire();

    // click: HUD first, then world (selects nothing — world clicks fire if ready)
    if (Input.mouse.clicked) {
      if (!HUD.handleClick(Input.mouse.x, Input.mouse.y, this)) this.tryFire();
    }
  }

  manualAdjust(dElev, dCharge) {
    if (this.mrsiActive) return;
    const veh = this.vehicle;
    if (dCharge) {
      const maxIdx = this.rap ? Ballistics.CHARGES.length - 1 : Ballistics.CHARGES.length - 2;
      const ni = Util.clamp(this.chargeIdx + dCharge, 0, maxIdx);
      if (ni !== this.chargeIdx) { this.chargeIdx = ni; Sfx.click(); }
      this.manualMode = true;
      this.selectedTarget = null;
      this.solution = null;
    }
    if (dElev) {
      veh.targetElev = Util.clamp(veh.targetElev + dElev, 2, 85);
      this.manualMode = true;
      this.selectedTarget = null;
      this.solution = null;
    }
  }

  furthestAlive() {
    let mx = 0;
    for (const t of this.targetList()) if (!t.dead && t.x > mx) mx = t.x;
    return mx;
  }

  tryFire() {
    const veh = this.vehicle;
    if (this.mrsiActive) return;
    if (!veh.canFire()) {
      if (veh.state === 'EMPLACED' && veh.mag <= 0) { Sfx.deny(); }
      return;
    }
    this.fireOne(null);
  }

  /* Fire a single round. mrsiShot: null for normal fire, or plan entry. */
  fireOne(mrsiShot) {
    const veh = this.vehicle;
    if (!veh.fireRound(this)) return;
    this.roundsFired++;

    const chargeIdx = mrsiShot ? mrsiShot.chargeIdx : this.chargeIdx;
    const c = Ballistics.CHARGES[chargeIdx];
    let elev = veh.elevDeg;
    let aimX, errX = 0;

    if ((this.selectedTarget || mrsiShot) && (this.solution || mrsiShot) && !this.manualMode) {
      aimX = this.mrsiActive ? this.mrsiTargetX : this.selectedTarget.x;
      const range = Math.abs(aimX - veh.x);
      errX = Util.gauss(this.rand) * this.dispersionAt(range) * 0.5;
      if (!mrsiShot) {
        // convert the range error into an elevation jitter on the corrected lay,
        // so the altitude/wind compensation in the solution is preserved
        elev = this.solution.elevDeg + errX / Ballistics.rangeSlope(chargeIdx, this.solution.elevDeg);
      } else {
        elev = mrsiShot.elevDeg + Util.gauss(this.rand) * 0.05;
      }
    } else {
      // manual lay: small angular jitter
      elev = veh.elevDeg + Util.gauss(this.rand) * 0.18;
      aimX = undefined;
    }

    const m = veh.muzzle(this);
    const sh = new Shell('player', {
      x: m.x, y: m.y, v0: c.v0, elevDeg: elev, dir: 1,
      k: Ballistics.dragK(chargeIdx), windX: this.windX,
      mrsiGroup: mrsiShot ? this._mrsiGroupSeq : null,
      excalibur: this.excalibur && aimX !== undefined,
      targetX: aimX
    });
    this.shells.push(sh);
    this.cb.onPlayerShot(this);

    // camera
    if (this.mrsiActive) {
      this.tacticalFocusX = this.mrsiTargetX;
      this.camera.mode = 'TACTICAL';
      this._mrsiCamHold = true;
    } else if (this.camAuto) {
      this.camera.mode = 'FOLLOW';
      this.camera.followShell = sh;
    }
  }

  tryMrsi() {
    const veh = this.vehicle;
    if (this.mrsiActive) { this.toast('MRSI SEQUENCE RUNNING', TUNE.COL.AMBER); return; }
    if (!this.selectedTarget || this.selectedTarget.dead || !this.solution) {
      this.toast('MRSI: SELECT A TARGET FIRST', TUNE.COL.AMBER); Sfx.deny(); return;
    }
    if (veh.state !== 'EMPLACED') { this.toast('MRSI: EMPLACE FIRST [E]', TUNE.COL.AMBER); Sfx.deny(); return; }
    const range = Math.abs(this.selectedTarget.x - veh.x);
    let plan = Ballistics.mrsiPlan(range, TUNE.MRSI_ROUNDS, this.rap, TUNE.MRSI_GAP * TUNE.TIME_SCALE * 1.3);
    if (plan.length < 2) { this.toast('MRSI: NO MULTI-TRAJECTORY SOLUTION AT THIS RANGE', TUNE.COL.AMBER); Sfx.deny(); return; }
    plan = Ballistics.refineMrsiPlan(plan, range, this.windX, this.heightOffsetTo(this.selectedTarget.x));
    if (veh.mag < plan.length) { this.toast('MRSI: NEED ' + plan.length + ' ROUNDS', TUNE.COL.AMBER); Sfx.deny(); return; }

    this._mrsiGroupSeq++;
    this.mrsiActive = true;
    this.mrsiPlan = plan;
    this.mrsiIndex = 0;
    this.mrsiT = 0;
    this.mrsiTargetX = this.selectedTarget.x;
    veh.targetElev = plan[0].elevDeg;
    this.toast('MRSI: ' + plan.length + ' ROUNDS — SIMULTANEOUS IMPACT', TUNE.COL.CYAN, 3);
    Sfx.confirm();
  }

  updateMrsi(dt) {
    if (!this.mrsiActive) return;
    const veh = this.vehicle;
    if (veh.destroyed || veh.state !== 'EMPLACED' || veh.mag <= 0) {
      this.mrsiActive = false; return;
    }
    const shot = this.mrsiPlan[this.mrsiIndex];
    veh.targetElev = shot.elevDeg;
    // the sequence clock starts at the first shot, so the initial lay time
    // does not skew the simultaneous-impact schedule
    if (this.mrsiIndex > 0) this.mrsiT += dt;
    const fireAt = this.mrsiIndex === 0 ? 0 : shot.fireDelay / TUNE.TIME_SCALE;
    if (this.mrsiT >= fireAt && veh.laid() && veh.cooldown <= 0) {
      this.fireOne(shot);
      this.mrsiIndex++;
      if (this.mrsiIndex >= this.mrsiPlan.length) {
        this.mrsiActive = false;
        // restore lay for the selected target
        if (this.selectedTarget && !this.selectedTarget.dead) this.computeSolution();
      }
    }
  }

  /* ---------------- combat resolution ---------------- */

  onShellImpact(shell) {
    const gx = shell.x;
    const gy = this.terrain.heightAt(gx);
    const distToPlayer = Math.abs(gx - this.vehicle.x);
    const scale = shell.kind === 'player' ? 1.1 : 0.95;
    this.particles.explosion(gx, gy + 1, scale);
    this.terrain.addScorch(gx);
    Sfx.impact(Math.abs(gx - this.camera.x));
    if (distToPlayer < 900) this.camera.addShake(Util.remap(distToPlayer, 0, 900, 14, 1));

    if (shell.kind === 'player') {
      const mrsi = !!shell.mrsiGroup;
      const mult = mrsi ? TUNE.MRSI_BONUS : 1;
      let hitSomething = false;
      for (const s of this.sites) {
        if (s.dead) continue;
        const d = Math.abs(s.x - gx);
        if (d < TUNE.SHELL_RADIUS) {
          const dmg = TUNE.SHELL_DMG * (1 - d / TUNE.SHELL_RADIUS) * mult;
          s.damage(dmg, this, mrsi);
          this.score += Math.round(dmg * TUNE.SCORE_PER_HP * 0.5);
          hitSomething = true;
        }
      }
      for (const cv of this.convoys) {
        if (!cv.dead && cv.damageAt(gx, TUNE.SHELL_DMG * mult, this, mrsi) >= 0) {
          if (Math.abs(cv.x - gx) < TUNE.SHELL_RADIUS) hitSomething = true;
        }
      }
      if (hitSomething) this.hits++;
    } else if (shell.kind === 'rocket') {
      if (Math.abs(gx - TUNE.FOB_X) < 500) {
        this.baseDamage(TUNE.ROCKET_BASE_DMG, 'ROCKET IMPACT AT FOB');
      }
      // a stray can still hurt the gun
      if (distToPlayer < 60) this.vehicle.takeDamage(12, this);
    } else if (shell.kind === 'cb') {
      if (distToPlayer < 30) this.vehicle.takeDamage(42, this);
      else if (distToPlayer < 80) this.vehicle.takeDamage(22, this);
      else if (distToPlayer < 150) this.vehicle.takeDamage(9, this);
    }
  }

  onSiteDestroyed(site, mrsi) {
    this.kills++;
    if (mrsi) this.mrsiKills++;
    this.score += mrsi ? TUNE.SCORE_MRSI_KILL : TUNE.SCORE_KILL;
    const gy = this.terrain.heightAt(site.x);
    this.particles.explosion(site.x, gy + 2, 1.5);
    this.toast((site.label || 'TARGET') + ' DESTROYED' + (mrsi ? ' — MRSI ×' + TUNE.MRSI_BONUS : ''),
      mrsi ? TUNE.COL.CYAN : TUNE.COL.GREEN);
    if (site.type === 'RADAR') this.toast('ENEMY CB RADAR OFFLINE — LOCK RATE REDUCED', TUNE.COL.GREEN, 3);
    if (site.type === 'GUN' && !this.cb.gunsAlive(this).length) {
      this.toast('ENEMY BATTERY SILENCED — NO CB THREAT', TUNE.COL.GREEN, 3.5);
    }
  }

  baseDamage(amount, reason) {
    if (this.over) return;
    this.baseIntegrity = Math.max(0, this.baseIntegrity - amount);
    this.toast(reason + ' — FOB ' + Math.round(this.baseIntegrity) + '%', TUNE.COL.RED);
    this.camera.addShake(3);
    if (this.baseIntegrity <= 0) this.endMission(false, 'FOB OVERRUN');
  }

  onDisplaced() {
    this.cb.onDisplaced(this);
  }

  onVehicleDestroyed() {
    this.endMission(false, 'GUN DESTROYED');
  }

  /* ---------------- mission flow ---------------- */

  endMission(win, reason) {
    if (this.over) return;
    this.over = true;
    this.overT = 0;
    this.result = win ? 'WIN' : 'LOSE';
    this.resultReason = reason || '';
    if (win) {
      this.score += Math.round(this.baseIntegrity * TUNE.SCORE_BASE_BONUS);
      this.score += this.vehicle.mag * TUNE.SCORE_AMMO_BONUS;
      Sfx.win();
    } else {
      Sfx.lose();
    }
  }

  nextEndlessWave() {
    this.wave++;
    this.score += 400 + this.wave * 100;
    this.baseIntegrity = Math.min(100, this.baseIntegrity + 8);
    const w = endlessWave(this.wave, this.rand);
    for (const s of w.sites) this.sites.push(new Site(s[0], s[1], s[2]));
    for (const c of w.convoys) this.convoys.push(new Convoy(c.x, c.n, c.speed));
    this.toast('WAVE ' + this.wave + ' — NEW TRACKS ON THE BOARD', TUNE.COL.AMBER, 3.2);
    Sfx.alarm();
  }

  updateTutorial() {
    if (!this.mission.tutorial) return;
    const veh = this.vehicle;
    switch (this._tutStep) {
      case 0:
        this.tutorialMsg = 'STEP 1 — PRESS [E] TO EMPLACE (THE GUN CANNOT FIRE ON THE MOVE)';
        if (veh.state === 'EMPLACED') this._tutStep = 1;
        break;
      case 1:
        this.tutorialMsg = 'STEP 2 — CLICK A TARGET ON THE THREAT BOARD (RIGHT) OR THE MAP STRIP (BOTTOM)';
        if (this.selectedTarget) this._tutStep = 2;
        break;
      case 2:
        this.tutorialMsg = 'STEP 3 — WAIT FOR "SOLUTION READY", THEN FIRE [SPACE]';
        if (this.roundsFired > 0) this._tutStep = 3;
        break;
      case 3:
        this.tutorialMsg = 'GOOD EFFECT. DESTROY THE TARGET, THEN TRY MRSI [M] ON THE NEXT ONE';
        if (this.mrsiKills > 0 || this.kills >= 2) this._tutStep = 4;
        break;
      case 4:
        this.tutorialMsg = 'FINISH THE FIRING TABLE — DESTROY ALL QUALIFICATION TARGETS';
        break;
    }
    if (this.kills >= 3) this.tutorialMsg = '';
  }

  update(dt) {
    this.missionT += dt;
    this.env.t = this.missionT;

    if (!this.over) this.handleInput(dt);

    this.vehicle.update(dt, this);
    this.updateMrsi(dt);

    // re-solve FCS on a cadence (wind + own position can change)
    this._solveT -= dt;
    if (this._solveT <= 0) {
      this._solveT = 0.4;
      if (this.selectedTarget && !this.manualMode && !this.mrsiActive) {
        if (this.selectedTarget.dead) { this.selectedTarget = null; this.solution = null; }
        else this.computeSolution();
      }
    }

    for (const s of this.sites) s.update(dt, this);
    for (const c of this.convoys) c.update(dt, this);
    for (const d of this.drones) d.update(dt, this);
    this.drones = this.drones.filter(d => !d.dead || Math.random() > 0.1);

    // drone spawner
    if (this.mission.droneEvery && !this.over) {
      this.droneT -= dt * this.enemyTempo;
      if (this.droneT <= 0) {
        this.droneT = this.mission.droneEvery * (0.8 + this.rand() * 0.5);
        this.drones.push(new Drone(this.vehicle.x + 6000 + this.rand() * 4000, 900));
        this.toast('SPOTTER DRONE INBOUND — CB LOCK ACCELERATED OVERHEAD', TUNE.COL.AMBER, 3);
      }
    }

    // shells + Iron Fist intercepts
    for (const sh of this.shells) {
      if (sh.dead) continue;
      sh.update(dt, this);
      if (!sh.dead && sh.kind === 'cb' && this.ironFist && this.interceptsLeft > 0 &&
        sh.vy < 0 && Math.abs(sh.x - this.vehicle.x) < 260 &&
        sh.y < this.terrain.heightAt(this.vehicle.x) + 300) {
        sh.dead = true;
        this.interceptsLeft--;
        this.particles.intercept(sh.x, sh.y);
        Sfx.intercept();
        this.toast('IRON FIST INTERCEPT (' + this.interceptsLeft + ' LEFT THIS SALVO)', TUNE.COL.CYAN);
      }
    }
    this.shells = this.shells.filter(s => !s.dead);

    const cbWasActive = this.cb.salvoActive;
    this.cb.update(dt, this);
    if (this.cb.salvoActive && !cbWasActive) this.interceptsLeft = this.ironFist ? 2 : 0;

    // after an MRSI sequence the camera holds tactical until the rounds land
    if (this._mrsiCamHold && !this.mrsiActive &&
      !this.shells.some(s => s.kind === 'player' && !s.dead)) {
      this._mrsiCamHold = false;
      if (this.camera.mode === 'TACTICAL') this.camera.mode = 'GUN';
    }

    this.particles.update(dt);
    this.camera.update(dt, this);

    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter(t => t.life > 0);

    this.updateTutorial();

    // win / wave logic
    if (!this.over) {
      const primLeft = this.targetList().some(t => t.primary && !t.dead);
      if (!primLeft) {
        if (this.endless) this.nextEndlessWave();
        else this.endMission(true);
      }
    } else {
      this.overT += dt;
      if (this.overT > 2.2 && !this._debriefed) {
        this._debriefed = true;
        Screens.showDebrief(this);
      }
    }
  }

  render(ctx) {
    const cam = this.camera;
    this.terrain.draw(ctx, cam, this.env);
    this.fob.draw(ctx, cam, this);
    for (const s of this.sites) s.draw(ctx, cam, this);
    for (const c of this.convoys) c.draw(ctx, cam, this);
    this.vehicle.draw(ctx, cam, this);
    for (const d of this.drones) d.draw(ctx, cam);
    for (const sh of this.shells) sh.draw(ctx, cam);
    this.particles.draw(ctx, cam);
    HUD.drawWorldOverlays(ctx, this);
    HUD.draw(ctx, this);
  }
}
