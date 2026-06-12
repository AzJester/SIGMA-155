/* Node sanity tests for the ballistics engine.
   Run: node test/ballistics_test.js */
'use strict';
const B = require('../js/ballistics.js');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  ok  ' + label + (detail ? '  [' + detail + ']' : '')); }
  else { failures++; console.error('FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); }
}

B.buildTables();

console.log('Max range per charge:');
B.tables.forEach((t, i) => {
  console.log('  ' + B.CHARGES[i].name.padEnd(10) + (t.maxRange / 1000).toFixed(1) + ' km @ ' +
    t.maxElev + ' deg');
});

// Documented brackets: 4-40 km standard, 70+ km RAP (claim)
const chg5 = B.tables[4].maxRange / 1000;
const rap = B.tables[5].maxRange / 1000;
const chg1 = B.tables[0];
check('CHG 5 max range in 38-43 km', chg5 >= 38 && chg5 <= 43, chg5.toFixed(1) + ' km');
check('RAP max range in 68-78 km', rap >= 68 && rap <= 78, rap.toFixed(1) + ' km');
check('CHG 1 can shoot short (<= 5 km at low angle)',
  chg1.rows[0].range <= 5000, (chg1.rows[0].range / 1000).toFixed(1) + ' km @ 4 deg');

// Solver round-trips: solve elevation for a range, re-simulate, compare
for (const [c, range] of [[2, 8000], [3, 15000], [4, 25000], [4, 38000], [5, 60000]]) {
  for (const arc of [false, true]) {
    const s = B.solveElevation(c, range, arc);
    if (!s) { check('solve ' + B.CHARGES[c].name + ' @ ' + range + 'm arc=' + arc, range > B.tables[c].maxRange, 'unreachable (ok if past max)'); continue; }
    const r = B.simulate(B.CHARGES[c].v0, s.elevDeg, B.dragK(c), 0, 0, 0);
    const errPct = Math.abs(r.range - range) / range * 100;
    check('solve ' + B.CHARGES[c].name + ' @ ' + (range / 1000) + 'km ' + (arc ? 'high' : 'low') + ' arc, error < 1.5%',
      errPct < 1.5, 'elev ' + s.elevDeg.toFixed(1) + ' deg, err ' + errPct.toFixed(2) + '%');
  }
}

// Auto solution picks a sensible charge and converges
for (const range of [5000, 12000, 22000, 39000]) {
  const s = B.autoSolution(range, false);
  check('autoSolution reaches ' + (range / 1000) + ' km', !!s,
    s ? B.CHARGES[s.chargeIdx].name + ' elev ' + s.elevDeg.toFixed(1) : 'null');
}
check('autoSolution 65 km requires RAP', B.autoSolution(65000, false) === null || B.tables[4].maxRange >= 65000);
check('autoSolution 65 km with RAP works', !!B.autoSolution(65000, true));

// Wind compensation: impact error with 12 m/s headwind should stay small
{
  const range = 30000, wind = -12;
  const s = B.compensatedSolution(range, wind, false);
  const r = B.simulate(B.CHARGES[s.chargeIdx].v0, s.elevDeg, B.dragK(s.chargeIdx), wind, 0, 0);
  const errPct = Math.abs(r.range - range) / range * 100;
  check('wind-compensated 30 km shot lands within 1% in 12 m/s headwind',
    errPct < 1.0, 'err ' + errPct.toFixed(2) + '% (' + Math.round(r.range - range) + ' m)');
}

// Altitude compensation: target 220 m above / below the gun, with crosswind
for (const dh of [220, -220]) {
  const range = 18000, wind = 8;
  const s = B.compensatedSolution(range, wind, false, null, false, dh);
  const r = B.simulate(B.CHARGES[s.chargeIdx].v0, s.elevDeg, B.dragK(s.chargeIdx), wind, 0, dh);
  const err = Math.abs(r.range - range);
  check('altitude-compensated 18 km shot (dh ' + dh + ' m) lands within 60 m',
    err < 60, Math.round(err) + ' m off');
}

// Direct bisection solver (enemy fires) with altitude offset
{
  const sol = B.bisectElevation(680, 1.4e-5, 12000, -150, -5, true);
  const r = B.simulate(680, sol.elevDeg, 1.4e-5, -5, 0, -150);
  const err = Math.abs(r.range - 12000);
  check('bisectElevation high-arc 12 km with dh/wind lands within 80 m', err < 80, Math.round(err) + ' m off');
}

// MRSI: 3 rounds, simultaneous impact within a small window
{
  const range = 20000;
  const plan = B.mrsiPlan(range, 3, false, 8);
  check('MRSI plan has >= 2 rounds at 20 km', plan.length >= 2, plan.length + ' rounds');
  if (plan.length >= 2) {
    const impacts = plan.map(p => p.fireDelay + p.tof);
    const spread = Math.max(...impacts) - Math.min(...impacts);
    check('MRSI impacts simultaneous (spread < 0.5 s sim)', spread < 0.5, spread.toFixed(3) + ' s');
    const fireTimes = plan.map(p => p.fireDelay).sort((a, b) => a - b);
    let minGap = Infinity;
    for (let i = 1; i < fireTimes.length; i++) minGap = Math.min(minGap, fireTimes[i] - fireTimes[i - 1]);
    check('MRSI fire times separated >= 8 s sim', minGap >= 8 - 1e-6, minGap.toFixed(1) + ' s');

    // refined for wind + altitude: every round must still land on target, together
    const refined = B.refineMrsiPlan(plan, range, 9, 160);
    let maxMiss = 0;
    for (const p of refined) {
      const r = B.simulate(B.CHARGES[p.chargeIdx].v0, p.elevDeg, B.dragK(p.chargeIdx), 9, 0, 160);
      maxMiss = Math.max(maxMiss, Math.abs(r.range - range));
      p._tofActual = r.tof;
    }
    check('refined MRSI rounds all land within 60 m', maxMiss < 60, Math.round(maxMiss) + ' m worst');
    const imp = refined.map(p => p.fireDelay + p._tofActual);
    const spread2 = Math.max(...imp) - Math.min(...imp);
    check('refined MRSI impacts simultaneous (spread < 0.8 s sim)', spread2 < 0.8, spread2.toFixed(2) + ' s');
  }
}

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nAll ballistics tests passed.');
process.exit(failures ? 1 : 0);
