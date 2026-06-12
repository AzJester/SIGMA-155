/* SIGMA 155: FIRE MISSION — canvas HUD: gun panel, threat board, minimap, warnings */
'use strict';

const HUD = {
  regions: [],          // clickable rects rebuilt each frame: {x,y,w,h,action,data}
  MAP_H: 78,

  font(ctx, px, bold) {
    ctx.font = (bold ? 'bold ' : '') + px + 'px Consolas, Menlo, "DejaVu Sans Mono", monospace';
  },

  panel(ctx, x, y, w, h) {
    ctx.fillStyle = TUNE.COL.PANEL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(125,255,154,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  },

  bar(ctx, x, y, w, h, f, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Util.clamp(f, 0, 1), h);
    ctx.strokeStyle = 'rgba(232,240,232,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  },

  draw(ctx, game) {
    this.regions = [];
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const C = TUNE.COL;

    this.drawStatus(ctx, game, W);
    this.drawGunPanel(ctx, game, H);
    this.drawThreatBoard(ctx, game, W, H);
    this.drawMinimap(ctx, game, W, H);
    this.drawWarnings(ctx, game, W, H);
    this.drawToasts(ctx, game, W);

    // key hints footer
    this.font(ctx, 11);
    ctx.fillStyle = 'rgba(232,240,232,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('[A/D] DRIVE  [E] EMPLACE  [CLICK] TARGET  [SPACE] FIRE  [M] MRSI  [Q/Z] CHARGE  [↑/↓] ELEV  [R] REARM  [TAB] MAP  [C] CAM  [P] PAUSE  [H] HELP',
      12, H - this.MAP_H - 8);
    void C;
  },

  drawStatus(ctx, game, W) {
    const C = TUNE.COL;
    this.panel(ctx, 10, 10, 300, 86);
    this.font(ctx, 13, true);
    ctx.fillStyle = C.GREEN;
    ctx.textAlign = 'left';
    ctx.fillText(game.mission.name, 20, 30);
    this.font(ctx, 11);
    ctx.fillStyle = C.WHITE;
    if (game.endless) ctx.fillText('WAVE ' + game.wave, 220, 30);
    ctx.fillText('SCORE ' + Util.pad(game.score, 7), 20, 48);
    ctx.fillText('TIME ' + Util.fmtTime(game.missionT), 170, 48);

    ctx.fillStyle = C.WHITE;
    ctx.fillText('FOB', 20, 66);
    this.bar(ctx, 55, 58, 160, 9, game.baseIntegrity / 100,
      game.baseIntegrity > 50 ? C.GREEN : (game.baseIntegrity > 25 ? C.AMBER : C.RED));
    ctx.fillText(Math.round(game.baseIntegrity) + '%', 222, 66);

    ctx.fillText('GUN', 20, 84);
    this.bar(ctx, 55, 76, 160, 9, game.vehicle.hp / TUNE.VEHICLE_HP,
      game.vehicle.hp > 50 ? C.GREEN : (game.vehicle.hp > 25 ? C.AMBER : C.RED));
    ctx.fillText(Math.round(game.vehicle.hp) + '%', 222, 84);

    // objectives remaining
    const prim = game.targetList().filter(t => t.primary && !t.dead).length;
    this.font(ctx, 11);
    ctx.fillStyle = prim ? C.AMBER : C.GREEN;
    ctx.fillText('PRIMARY TARGETS: ' + prim, 20, 108);

    // CB lock meter
    if (game.cb.lockRate > 0) {
      const f = Util.clamp(game.cb.lock, 0, 1);
      ctx.fillStyle = f > 0.7 ? C.RED : (f > 0.4 ? C.AMBER : C.WHITE);
      ctx.fillText('CB LOCK', W / 2 - 130, 26);
      this.bar(ctx, W / 2 - 60, 18, 190, 10, f, f > 0.7 ? C.RED : (f > 0.4 ? C.AMBER : C.GREEN_DIM));
    }
  },

  drawGunPanel(ctx, game, H) {
    const C = TUNE.COL;
    const veh = game.vehicle;
    const x = 10, y = H - this.MAP_H - 188, w = 268, h = 168;
    this.panel(ctx, x, y, w, h);
    this.font(ctx, 12, true);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.GREEN;
    ctx.fillText('SIGMA 155 — FIRE CONTROL', x + 10, y + 19);

    this.font(ctx, 11);
    const stateCol = { DRIVE: C.WHITE, EMPLACING: C.CYAN, EMPLACED: C.GREEN, DISPLACING: C.CYAN, REARM: C.AMBER }[veh.state];
    ctx.fillStyle = stateCol;
    ctx.fillText('STATUS: ' + (veh.destroyed ? 'DESTROYED' : veh.state), x + 10, y + 38);

    // magazine pips: 40 rounds in two rows of 20
    ctx.fillStyle = C.WHITE;
    ctx.fillText('MAG ' + Util.pad(veh.mag, 2) + '/' + SPEC.MAGAZINE, x + 10, y + 56);
    for (let i = 0; i < SPEC.MAGAZINE; i++) {
      const row = Math.floor(i / 20), col = i % 20;
      ctx.fillStyle = i < veh.mag ? (veh.mag <= 8 ? C.AMBER : C.GREEN) : 'rgba(120,130,120,0.25)';
      ctx.fillRect(x + 88 + col * 8, y + 48 + row * 6, 6, 4);
    }

    ctx.fillStyle = C.WHITE;
    const chg = Ballistics.CHARGES[game.chargeIdx];
    ctx.fillText('CHARGE: ' + chg.name + '  MV ' + chg.v0 + ' m/s', x + 10, y + 76);
    ctx.fillText('ELEV: ' + veh.elevDeg.toFixed(1) + '°' +
      (veh.laid() ? '' : ' → ' + veh.targetElev.toFixed(1) + '°'), x + 10, y + 92);
    ctx.fillText('WIND: ' + (game.windX >= 0 ? '→ ' : '← ') + Math.abs(game.windX).toFixed(0) + ' m/s', x + 150, y + 92);

    // predicted range for current lay (table lookup)
    const pred = Ballistics.rangeFor(game.chargeIdx, veh.targetElev);
    ctx.fillText('PREDICT: ' + Util.fmtKm(pred.range) + '  TOF ' + pred.tof.toFixed(0) + ' s', x + 10, y + 108);

    // solution status line
    this.font(ctx, 12, true);
    if (veh.destroyed) {
      ctx.fillStyle = C.RED; ctx.fillText('GUN DESTROYED', x + 10, y + 130);
    } else if (game.mrsiActive) {
      ctx.fillStyle = C.CYAN;
      ctx.fillText('MRSI SEQUENCE: ROUND ' + (game.mrsiIndex + 1) + '/' + game.mrsiPlan.length, x + 10, y + 130);
    } else if (veh.state !== 'EMPLACED') {
      ctx.fillStyle = C.AMBER;
      ctx.fillText(veh.state === 'REARM' ? 'REARMING — STAND BY' : 'EMPLACE [E] TO FIRE', x + 10, y + 130);
    } else if (game.selectedTarget && !game.solution) {
      ctx.fillStyle = C.RED; ctx.fillText('TARGET OUT OF REACH', x + 10, y + 130);
    } else if (!veh.laid()) {
      ctx.fillStyle = C.CYAN; ctx.fillText('LAYING…', x + 10, y + 130);
    } else if (veh.cooldown > 0) {
      ctx.fillStyle = C.AMBER; ctx.fillText('LOADING…', x + 10, y + 130);
      this.bar(ctx, x + 110, y + 121, 100, 9, 1 - veh.cooldown / TUNE.SHOT_COOLDOWN, C.AMBER);
    } else if (veh.mag <= 0) {
      ctx.fillStyle = C.RED; ctx.fillText('MAGAZINE EMPTY — REARM [R]', x + 10, y + 130);
    } else {
      ctx.fillStyle = C.GREEN; ctx.fillText('SOLUTION READY — FIRE [SPACE]', x + 10, y + 130);
    }

    // selected target line
    this.font(ctx, 11);
    if (game.selectedTarget && !game.selectedTarget.dead) {
      const t = game.selectedTarget;
      ctx.fillStyle = C.AMBER;
      ctx.fillText('TGT: ' + t.label + ' @ ' + Util.fmtKm(Math.abs(t.x - veh.x)), x + 10, y + 150);
      if (game.solution) {
        ctx.fillStyle = C.WHITE;
        ctx.fillText('FCS: ' + Ballistics.CHARGES[game.solution.chargeIdx].name +
          ' EL ' + game.solution.elevDeg.toFixed(1) + '° TOF ' + game.solution.tof.toFixed(0) + 's', x + 10, y + 164);
      }
    } else {
      ctx.fillStyle = 'rgba(232,240,232,0.55)';
      ctx.fillText('NO TARGET — CLICK THREAT BOARD / MAP', x + 10, y + 150);
      ctx.fillText('OR LAY MANUALLY [↑/↓] [Q/Z]', x + 10, y + 164);
    }
  },

  drawThreatBoard(ctx, game, W, H) {
    const C = TUNE.COL;
    const list = game.targetList().filter(t => !t.dead)
      .sort((a, b) => (b.primary - a.primary) || (a.x - b.x))
      .slice(0, 9);
    const w = 252, rowH = 30;
    const h = 30 + Math.max(1, list.length) * rowH;
    const x = W - w - 10, y = 10;
    this.panel(ctx, x, y, w, h);
    this.font(ctx, 12, true);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.GREEN;
    ctx.fillText(game.lattice ? 'THREAT BOARD — LATTICE' : 'THREAT BOARD', x + 10, y + 19);

    this.font(ctx, 11);
    if (!list.length) {
      ctx.fillStyle = 'rgba(232,240,232,0.5)';
      ctx.fillText('NO ACTIVE TRACKS', x + 10, y + 44);
    }
    list.forEach((t, i) => {
      const ry = y + 26 + i * rowH;
      const sel = game.selectedTarget === t;
      if (sel) {
        ctx.fillStyle = 'rgba(255,180,84,0.16)';
        ctx.fillRect(x + 4, ry, w - 8, rowH - 3);
      }
      ctx.fillStyle = sel ? C.AMBER : (t.primary ? C.WHITE : 'rgba(232,240,232,0.6)');
      ctx.fillText((t.primary ? '▸ ' : '  ') + t.label, x + 10, ry + 12);
      ctx.fillText(Util.fmtKm(Math.abs(t.x - game.vehicle.x)), x + 178, ry + 12);
      // HP bar + (with Lattice) rocket launch countdown
      this.bar(ctx, x + 12, ry + 17, 120, 5, t.hp / t.maxHp, C.RED);
      if (game.lattice && t.type === 'ROCKET') {
        ctx.fillStyle = C.CYAN;
        ctx.fillText('LCH ' + Math.max(0, t.launchT).toFixed(0) + 's', x + 140, ry + 23);
      }
      if (t.type === 'CONVOY') {
        ctx.fillStyle = C.RED;
        ctx.fillText('MOVING', x + 178, ry + 23);
      }
      this.regions.push({ x: x + 4, y: ry, w: w - 8, h: rowH - 3, action: 'select', data: t });
    });
  },

  mapX(wx, W) { return 14 + (wx / TUNE.WORLD_W) * (W - 28); },

  drawMinimap(ctx, game, W, H) {
    const C = TUNE.COL;
    const y0 = H - this.MAP_H;
    ctx.fillStyle = 'rgba(4,8,5,0.92)';
    ctx.fillRect(0, y0, W, this.MAP_H);
    ctx.strokeStyle = 'rgba(125,255,154,0.4)';
    ctx.beginPath(); ctx.moveTo(0, y0 + 0.5); ctx.lineTo(W, y0 + 0.5); ctx.stroke();

    const baseY = y0 + 52;
    // terrain skyline
    ctx.strokeStyle = 'rgba(125,255,154,0.3)';
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const wx = (i / 240) * TUNE.WORLD_W;
      const hgt = game.terrain.heightAt(wx);
      const sx = this.mapX(wx, W);
      const sy = baseY - Util.clamp(hgt / 380, 0, 1) * 26;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // range ticks every 10 km
    this.font(ctx, 9);
    ctx.fillStyle = 'rgba(232,240,232,0.45)';
    ctx.textAlign = 'center';
    for (let km = 0; km <= 70; km += 10) {
      const sx = this.mapX(km * 1000, W);
      ctx.fillRect(sx, baseY + 6, 1, 5);
      ctx.fillText(km + '', sx, baseY + 22);
    }
    ctx.fillText('km', this.mapX(73500, W), baseY + 22);

    // FOB
    ctx.fillStyle = C.CYAN;
    const fx = this.mapX(TUNE.FOB_X, W);
    ctx.fillRect(fx - 3, baseY - 8, 6, 6);

    // vehicle
    const vx = this.mapX(game.vehicle.x, W);
    ctx.fillStyle = game.vehicle.destroyed ? C.RED : C.GREEN;
    ctx.beginPath();
    ctx.moveTo(vx, baseY - 11); ctx.lineTo(vx - 5, baseY - 2); ctx.lineTo(vx + 5, baseY - 2);
    ctx.closePath(); ctx.fill();

    // sites + convoys
    for (const t of game.targetList()) {
      if (t.dead) continue;
      if (t.type === 'CONVOY') {
        ctx.fillStyle = C.RED;
        for (const u of t.units) {
          if (!u.dead) ctx.fillRect(this.mapX(u.x, W) - 1.5, baseY - 5, 3, 3);
        }
      } else {
        const sx = this.mapX(t.x, W);
        ctx.fillStyle = t.primary ? C.RED : 'rgba(255,95,86,0.55)';
        ctx.fillRect(sx - 2.5, baseY - 7, 5, 5);
      }
      const sx = this.mapX(t.x, W);
      this.regions.push({ x: sx - 9, y: baseY - 16, w: 18, h: 24, action: 'select', data: t });
      if (game.selectedTarget === t) {
        ctx.strokeStyle = C.AMBER;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sx - 6, baseY - 11, 12, 13);
      }
    }

    // shells in flight
    for (const s of game.shells) {
      if (s.dead) continue;
      ctx.fillStyle = s.kind === 'player' ? C.WHITE : C.RED;
      const sx = this.mapX(s.x, W);
      const sy = baseY - 10 - Util.clamp(s.y / 14000, 0, 1) * 26;
      ctx.fillRect(sx - 1, sy, 2, 2);
    }

    // drones
    ctx.fillStyle = C.RED;
    for (const d of game.drones) {
      if (d.dead) continue;
      const sx = this.mapX(d.x, W);
      ctx.beginPath();
      ctx.moveTo(sx, baseY - 22); ctx.lineTo(sx - 3, baseY - 18); ctx.lineTo(sx + 3, baseY - 18);
      ctx.closePath(); ctx.fill();
    }

    // camera view extent
    const camL = this.mapX(Math.max(0, game.camera.screenToWorldX(0)), W);
    const camR = this.mapX(Math.min(TUNE.WORLD_W, game.camera.screenToWorldX(W)), W);
    ctx.strokeStyle = 'rgba(232,240,232,0.4)';
    ctx.strokeRect(camL, y0 + 4, Math.max(3, camR - camL), 4);
    ctx.textAlign = 'left';
  },

  drawWarnings(ctx, game, W, H) {
    const C = TUNE.COL;
    this.font(ctx, 17, true);
    ctx.textAlign = 'center';
    const blink = Math.sin(game.missionT * 9) > -0.2;
    if (game.cb.salvoActive && blink) {
      ctx.fillStyle = C.RED;
      ctx.fillText('⚠ COUNTER-BATTERY INBOUND — T-' + Math.max(0, game.cb.incoming).toFixed(1) +
        ' — DISPLACE ⚠', W / 2, 64);
    } else if (game.cb.lock > 0.72 && game.cb.lockRate > 0 && blink) {
      ctx.fillStyle = C.AMBER;
      ctx.fillText('CB RADAR TRACKING — MOVE AFTER NEXT ROUNDS', W / 2, 64);
    }
    if (game.tutorialMsg) {
      this.font(ctx, 14, true);
      ctx.fillStyle = C.CYAN;
      ctx.fillText(game.tutorialMsg, W / 2, H - this.MAP_H - 56);
    }
    ctx.textAlign = 'left';
  },

  drawToasts(ctx, game, W) {
    ctx.textAlign = 'center';
    let y = 96;
    for (const t of game.toasts) {
      const a = Util.clamp(t.life / 0.8, 0, 1);
      this.font(ctx, 13, true);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.4 * a) + ')';
      const w = ctx.measureText(t.msg).width + 22;
      ctx.fillRect(W / 2 - w / 2, y - 14, w, 20);
      ctx.fillStyle = t.color;
      ctx.globalAlpha = a;
      ctx.fillText(t.msg, W / 2, y);
      ctx.globalAlpha = 1;
      y += 24;
    }
    ctx.textAlign = 'left';
  },

  /* World-space overlays: selected target reticle + predicted impact bracket. */
  drawWorldOverlays(ctx, game) {
    const C = TUNE.COL;
    const cam = game.camera;
    const t = game.selectedTarget;
    if (t && !t.dead) {
      const gy = game.terrain.heightAt(t.x);
      const p = cam.worldToScreen(t.x, gy);
      if (p.x > -40 && p.x < ctx.canvas.width + 40) {
        const r = 14 + Math.sin(game.missionT * 5) * 2;
        ctx.strokeStyle = C.AMBER;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y - 6); ctx.lineTo(p.x - r + 6, p.y - 6);
        ctx.moveTo(p.x + r, p.y - 6); ctx.lineTo(p.x + r - 6, p.y - 6);
        ctx.moveTo(p.x, p.y - 6 - r * 0.6); ctx.lineTo(p.x, p.y - 6 - r * 0.6 + 5);
        ctx.stroke();
      }
    }
    // predicted impact bracket (dispersion window) for current solution
    if (game.solution && game.vehicle.state === 'EMPLACED' && t && !t.dead) {
      const disp = game.dispersionAt(Math.abs(t.x - game.vehicle.x));
      const gy = game.terrain.heightAt(t.x);
      const pl = cam.worldToScreen(t.x - disp, gy);
      const pr = cam.worldToScreen(t.x + disp, gy);
      if (pr.x > 0 && pl.x < ctx.canvas.width && pr.x - pl.x > 4) {
        ctx.strokeStyle = 'rgba(111,215,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pl.x, pl.y + 8); ctx.lineTo(pl.x, pl.y + 13); ctx.lineTo(pr.x, pr.y + 13); ctx.lineTo(pr.x, pr.y + 8);
        ctx.stroke();
      }
    }
  },

  /* Returns true if a click at canvas coords was consumed by a HUD element. */
  handleClick(mx, my, game) {
    for (const r of this.regions) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        if (r.action === 'select') {
          game.selectTarget(r.data);
          return true;
        }
      }
    }
    return false;
  }
};
