/* SIGMA 155: FIRE MISSION — ballistics engine and fire-control solvers.
   Self-contained (no DOM, no other modules) so it can be unit-tested under node.
   Units: meters, seconds, radians internally; degrees at the API edge. */
'use strict';

const Ballistics = {
  G: 9.81,
  DT: 0.06,                  // integration step (sim seconds)
  DRAG_K: 2.05e-5,           // quadratic drag coeff (1/m) — tuned so CHG 5 tops out ≈ 40 km
  RAP_DRAG_K: 0.62e-5,       // rocket-assisted: abstracted as a sleeker round
  // Modular charges: muzzle velocity per charge. CHG 6 is the RAP load (upgrade-gated).
  CHARGES: [
    { name: 'CHG 1', v0: 312, rap: false },
    { name: 'CHG 2', v0: 452, rap: false },
    { name: 'CHG 3', v0: 601, rap: false },
    { name: 'CHG 4', v0: 778, rap: false },
    { name: 'CHG 5', v0: 945, rap: false },
    { name: 'CHG 6 RAP', v0: 1010, rap: true }
  ],

  tables: null,              // built by buildTables(): per charge, arrays over elevation

  dragK(chargeIdx) {
    return this.CHARGES[chargeIdx].rap ? this.RAP_DRAG_K : this.DRAG_K;
  },

  /* Integrate a shot fired from (x0, y0) with flat-ground termination at yGround.
     Returns { range, tof, peak, vx, vy } where range is horizontal distance traveled. */
  simulate(v0, elevDeg, k, windX, y0, yGround) {
    const elev = elevDeg * Math.PI / 180;
    let x = 0, y = y0 || 0;
    let vx = v0 * Math.cos(elev), vy = v0 * Math.sin(elev);
    const dt = this.DT, g = this.G;
    const ground = yGround || 0;
    let t = 0, peak = y;
    for (let i = 0; i < 12000; i++) {
      const rvx = vx - (windX || 0);   // velocity relative to air
      const rv = Math.sqrt(rvx * rvx + vy * vy);
      const ax = -k * rv * rvx;
      const ay = -g - k * rv * vy;
      vx += ax * dt; vy += ay * dt;
      x += vx * dt; y += vy * dt;
      t += dt;
      if (y > peak) peak = y;
      if (y <= ground && vy < 0) {
        // linear back-interpolation to the ground crossing
        const f = (ground - y) / (vy * dt);
        x += vx * dt * f; t += dt * f;
        return { range: x, tof: t, peak: peak, vx: vx, vy: vy };
      }
    }
    return { range: x, tof: t, peak: peak, vx: vx, vy: vy };
  },

  /* Build range/TOF lookup tables per charge for elevations 4..86 deg (no wind). */
  buildTables() {
    this.tables = this.CHARGES.map((c) => {
      const rows = [];
      const k = c.rap ? this.RAP_DRAG_K : this.DRAG_K;
      let maxRange = 0, maxElev = 45;
      for (let e = 4; e <= 86; e += 1) {
        const r = this.simulate(c.v0, e, k, 0, 0, 0);
        rows.push({ elev: e, range: r.range, tof: r.tof, peak: r.peak });
        if (r.range > maxRange) { maxRange = r.range; maxElev = e; }
      }
      return { rows: rows, maxRange: maxRange, maxElev: maxElev };
    });
    return this.tables;
  },

  /* Interpolated range/TOF for a charge at an arbitrary elevation (table-based). */
  rangeFor(chargeIdx, elevDeg) {
    const t = this.tables[chargeIdx];
    const e = Math.min(86, Math.max(4, elevDeg));
    const i = Math.min(t.rows.length - 2, Math.max(0, Math.floor(e - 4)));
    const a = t.rows[i], b = t.rows[i + 1];
    const f = (e - a.elev) / (b.elev - a.elev);
    return {
      range: a.range + (b.range - a.range) * f,
      tof: a.tof + (b.tof - a.tof) * f,
      peak: a.peak + (b.peak - a.peak) * f
    };
  },

  /* Solve elevation for a target range on one branch of the trajectory table.
     highArc=false searches the ascending branch (elev <= maxElev),
     highArc=true the descending branch (elev >= maxElev). Returns
     { elevDeg, tof } or null if out of reach on that branch. */
  solveElevation(chargeIdx, targetRange, highArc) {
    const t = this.tables[chargeIdx];
    if (targetRange > t.maxRange) return null;
    const rows = t.rows;
    let lo, hi;
    if (!highArc) { lo = 0; hi = Math.round(t.maxElev) - 4; }
    else { lo = Math.round(t.maxElev) - 4; hi = rows.length - 1; }
    lo = Math.max(0, Math.min(rows.length - 1, lo));
    hi = Math.max(0, Math.min(rows.length - 1, hi));
    // ranges increase up to maxElev then decrease; bisect the monotonic branch
    for (let iter = 0; iter < 40 && hi - lo > 1; iter++) {
      const mid = (lo + hi) >> 1;
      const r = rows[mid].range;
      const ascending = !highArc;
      if ((ascending && r < targetRange) || (!ascending && r > targetRange)) lo = mid;
      else hi = mid;
    }
    const a = rows[lo], b = rows[hi];
    if (a === b) return { elevDeg: a.elev, tof: a.tof };
    const span = b.range - a.range;
    if (Math.abs(span) < 1e-6) return { elevDeg: a.elev, tof: a.tof };
    const f = (targetRange - a.range) / span;
    if (f < -0.25 || f > 1.25) return null;
    const fc = Math.max(0, Math.min(1, f));
    return { elevDeg: a.elev + (b.elev - a.elev) * fc, tof: a.tof + (b.tof - a.tof) * fc };
  },

  /* FCS auto-solution: choose the lowest charge that comfortably reaches the range
     on a low arc. Returns { chargeIdx, elevDeg, tof } or null. */
  autoSolution(targetRange, allowRap) {
    const lastIdx = allowRap ? this.CHARGES.length - 1 : this.CHARGES.length - 2;
    for (let c = 0; c <= lastIdx; c++) {
      if (this.tables[c].maxRange * 0.96 >= targetRange) {
        const s = this.solveElevation(c, targetRange, false);
        if (s) return { chargeIdx: c, elevDeg: s.elevDeg, tof: s.tof };
      }
    }
    // fall back to the biggest charge, high or low arc, if barely in reach
    const c = lastIdx;
    const s = this.solveElevation(c, targetRange, false) || this.solveElevation(c, targetRange, true);
    return s ? { chargeIdx: c, elevDeg: s.elevDeg, tof: s.tof } : null;
  },

  /* Wind + altitude compensation: solve on the flat-ground table, then iterate —
     simulate with the actual wind and target height offset, measure the miss, and
     re-solve against the shifted aim range. Lands within a few tens of meters,
     consistent with the claimed 0.7% deviation.
     dh: target ground height minus gun muzzle height (m, positive = uphill). */
  compensatedSolution(targetRange, windX, allowRap, chargeIdx, highArc, dh) {
    let sol;
    if (chargeIdx === undefined || chargeIdx === null) {
      sol = this.autoSolution(targetRange, allowRap);
      if (!sol) return null;
      highArc = false;
    } else {
      const s = this.solveElevation(chargeIdx, targetRange, !!highArc);
      if (!s) return null;
      sol = { chargeIdx: chargeIdx, elevDeg: s.elevDeg, tof: s.tof };
    }
    const w = windX || 0, h = dh || 0;
    if (!w && !h) return sol;
    const c = this.CHARGES[sol.chargeIdx];
    const k = this.dragK(sol.chargeIdx);
    let aimRange = targetRange;
    for (let i = 0; i < 3; i++) {
      const r = this.simulate(c.v0, sol.elevDeg, k, w, 0, h);
      const drift = r.range - targetRange;
      sol.tof = r.tof;
      if (Math.abs(drift) < 6) break;
      aimRange = Math.max(500, aimRange - drift);
      const s2 = this.solveElevation(sol.chargeIdx, aimRange, !!highArc);
      if (!s2) break;
      sol.elevDeg = s2.elevDeg;
    }
    return sol;
  },

  /* Range sensitivity dR/dElev (m per degree) on the current branch — used to turn a
     desired range error into an elevation jitter. */
  rangeSlope(chargeIdx, elevDeg) {
    const a = this.rangeFor(chargeIdx, elevDeg - 0.5);
    const b = this.rangeFor(chargeIdx, elevDeg + 0.5);
    const s = b.range - a.range;
    return Math.abs(s) < 30 ? (s < 0 ? -30 : 30) : s;
  },

  /* Direct bisection solve for arbitrary v0/k (enemy fires), honoring wind (in the
     shooter's forward frame) and target height offset dh. */
  bisectElevation(v0, k, targetRange, dh, windFwd, highArc) {
    let lo = highArc ? 45 : 3, hi = highArc ? 86 : 45;
    let best = null;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      const r = this.simulate(v0, mid, k, windFwd || 0, 0, dh || 0);
      best = { elevDeg: mid, tof: r.tof, range: r.range };
      const over = r.range > targetRange;
      if (highArc) { if (over) lo = mid; else hi = mid; }
      else { if (over) hi = mid; else lo = mid; }
    }
    return best;
  },

  /* MRSI plan: up to n rounds on distinct trajectories timed for simultaneous impact.
     Candidate solutions are gathered across charges and arcs, sorted by TOF descending;
     greedily keep those whose fire times (tofMax - tof) are separated by at least
     minGapSim seconds. Returns array of { chargeIdx, elevDeg, tof, fireDelay } where
     fireDelay is in sim-seconds after the first shot. */
  mrsiPlan(targetRange, n, allowRap, minGapSim) {
    const gap = minGapSim || 8;
    const lastIdx = allowRap ? this.CHARGES.length - 1 : this.CHARGES.length - 2;
    const cands = [];
    for (let c = 0; c <= lastIdx; c++) {
      if (this.tables[c].maxRange < targetRange) continue;
      for (const arc of [false, true]) {
        const s = this.solveElevation(c, targetRange, arc);
        if (s && s.elevDeg > 6 && s.elevDeg < 85) {
          cands.push({ chargeIdx: c, elevDeg: s.elevDeg, tof: s.tof });
        }
      }
    }
    if (!cands.length) return [];
    cands.sort((a, b) => b.tof - a.tof);
    const plan = [cands[0]];
    for (let i = 1; i < cands.length && plan.length < n; i++) {
      const last = plan[plan.length - 1];
      if (last.tof - cands[i].tof >= gap) plan.push(cands[i]);
    }
    const tofMax = plan[0].tof;
    for (const p of plan) p.fireDelay = tofMax - p.tof;
    return plan;
  },

  /* Refine an MRSI plan for actual wind and target altitude, then re-time the
     fire delays so the impacts stay simultaneous. */
  refineMrsiPlan(plan, targetRange, windX, dh) {
    for (const p of plan) {
      const c = this.CHARGES[p.chargeIdx];
      const k = this.dragK(p.chargeIdx);
      const highArc = p.elevDeg > this.tables[p.chargeIdx].maxElev;
      let aimRange = targetRange;
      for (let i = 0; i < 3; i++) {
        const r = this.simulate(c.v0, p.elevDeg, k, windX || 0, 0, dh || 0);
        const drift = r.range - targetRange;
        p.tof = r.tof;
        if (Math.abs(drift) < 6) break;
        aimRange = Math.max(500, aimRange - drift);
        const s2 = this.solveElevation(p.chargeIdx, aimRange, highArc);
        if (!s2) break;
        p.elevDeg = s2.elevDeg;
      }
    }
    plan.sort((a, b) => b.tof - a.tof);
    const tofMax = plan[0].tof;
    for (const p of plan) p.fireDelay = tofMax - p.tof;
    return plan;
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Ballistics;
