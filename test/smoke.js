/* Headless-browser smoke test: boots the game, plays through the core loop,
   captures screenshots, and fails on any JS error.
   Run: PLAYWRIGHT_BROWSERS_PATH=<browsers> NODE_PATH=<global node_modules> node test/smoke.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const shots = path.join(root, 'test', 'shots');
  fs.mkdirSync(shots, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const shot = (name) => page.screenshot({ path: path.join(shots, name) });
  let failures = 0;
  const check = (label, cond, detail) => {
    if (cond) console.log('  ok  ' + label + (detail ? '  [' + detail + ']' : ''));
    else { failures++; console.error('FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); }
  };

  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForTimeout(1600);
  await shot('01-title.png');
  check('title screen shows', await page.isVisible('text=DEPLOY'));

  await page.click('text=DEPLOY');
  await page.waitForTimeout(300);
  await shot('02-select.png');
  check('mission select shows M1', await page.isVisible('text=PROVING GROUND'));

  await page.click('.mission-row >> nth=0');
  await page.waitForTimeout(300);
  await shot('03-briefing.png');
  check('briefing shows', await page.isVisible('text=START MISSION'));

  await page.click('text=START MISSION');
  await page.waitForTimeout(900);
  await shot('04-ingame.png');
  const booted = await page.evaluate(() =>
    typeof App !== 'undefined' && !!App.game && App.state === 'PLAY');
  check('game launched into PLAY state', booted);

  // emplace
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(4600);
  const st1 = await page.evaluate(() => App.game.vehicle.state);
  check('vehicle emplaced after [E]', st1 === 'EMPLACED', st1);

  // select the first target by clicking its real threat-board region
  const region = await page.evaluate(() => {
    const r = HUD.regions.find((x) => x.action === 'select');
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  });
  check('threat board has clickable region', !!region);
  if (region) await page.mouse.click(region.x, region.y);
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => ({
    target: !!App.game.selectedTarget,
    solution: !!App.game.solution,
    elev: App.game.vehicle.targetElev
  }));
  check('target selected and FCS solution computed', sel.target && sel.solution,
    'targetElev ' + (sel.elev && sel.elev.toFixed ? sel.elev.toFixed(1) : sel.elev));

  // wait for lay, then fire
  await page.waitForTimeout(3200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  await shot('05-shell-flight.png');
  const fired = await page.evaluate(() => ({
    rounds: App.game.roundsFired, mag: App.game.vehicle.mag,
    shells: App.game.shells.filter((s) => s.kind === 'player').length
  }));
  check('round fired (mag 40->39)', fired.rounds === 1 && fired.mag === 39,
    'rounds=' + fired.rounds + ' mag=' + fired.mag);

  // let it fly and land (6 km @ TIME_SCALE 11 is a few seconds)
  await page.waitForTimeout(7000);
  await shot('06-impact.png');
  const after = await page.evaluate(() => {
    const g = App.game;
    const d = g.terrain.decals[g.terrain.decals.length - 1];
    return {
      score: g.score, hits: g.hits, inFlight: g.shells.length,
      missBy: d ? Math.round(Math.abs(d.x - g.sites[0].x)) : -1
    };
  });
  check('shell landed', after.inFlight === 0 && after.missBy >= 0);
  check('FCS accuracy: impact within 300 m of target', after.missBy >= 0 && after.missBy < 300,
    after.missBy + ' m off, hits=' + after.hits + ' score=' + after.score);

  // MRSI on a fresh target
  await page.evaluate(() => {
    const g = App.game;
    const t = g.sites.find((s) => !s.dead && s.x > 10000);
    if (t) g.selectTarget(t);
  });
  await page.waitForTimeout(2600);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(500);
  const mrsi = await page.evaluate(() => ({
    active: App.game.mrsiActive, planned: App.game.mrsiPlan.length,
    targetX: App.game.mrsiTargetX
  }));
  check('MRSI sequence started', mrsi.active && mrsi.planned >= 2, 'rounds=' + mrsi.planned);
  // wait out the full sequence + flight (~12 s viewer at 15 km), then check grouping
  await page.waitForTimeout(15000);
  await shot('07-mrsi.png');
  const group = await page.evaluate((tx) => {
    const g = App.game;
    const last = g.terrain.decals.slice(-3).map((d) => d.x);
    if (last.length < 3) return null;
    return {
      maxOff: Math.round(Math.max(...last.map((x) => Math.abs(x - tx)))),
      fired: g.roundsFired
    };
  }, mrsi.targetX);
  check('MRSI rounds all impacted near the target (< 700 m)',
    !!group && group.maxOff < 700, group ? group.maxOff + ' m worst, fired=' + group.fired : 'missing impacts');

  // tactical map + pause/resume
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1200);
  await shot('08-tactical.png');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);
  check('pause menu shows', await page.isVisible('text=RESUME'));
  await shot('09-pause.png');
  await page.click('text=RESUME');
  await page.waitForTimeout(300);
  check('resumed to PLAY', await page.evaluate(() => App.state === 'PLAY'));

  // mission 2: verify CB pressure machinery exists (endless quick check instead would
  // need menu nav; just sanity-check the director on M1 = inert)
  const cbInert = await page.evaluate(() => App.game.cb.lockRate === 0);
  check('M1 has no CB threat (tutorial)', cbInert);

  // --- combat systems pass on mission 2: counter-battery, displacement, rearm
  await page.evaluate(() => { App.startMission(1); App.launchLoaded(); });
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(4600);
  const salvo = await page.evaluate(() => {
    const g = App.game;
    g.selectTarget(g.sites.find((s) => !s.dead));
    return g.cb.gunsAlive(g).length;
  });
  check('M2 has live enemy battery', salvo > 0, salvo + ' guns');
  await page.waitForTimeout(2600);
  // force the next shot to trigger the counter-battery answer (lock decays over time,
  // so set it immediately before firing)
  await page.evaluate(() => { App.game.cb.lock = 0.99; });
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  const cbState = await page.evaluate(() => ({
    active: App.game.cb.salvoActive,
    inbound: App.game.shells.filter((s) => s.kind === 'cb').length
  }));
  check('CB salvo launched after lock', cbState.active && cbState.inbound > 0,
    cbState.inbound + ' shells inbound');
  await shot('10-cb-inbound.png');

  // displace, then simulate a completed scoot well past CB_SAFE_DIST: the salvo is
  // registered on the firing position, so it must land there — and miss the gun
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2300);
  const moved = await page.evaluate(() => {
    const st = App.game.vehicle.state;
    App.game.vehicle.x = 2400;              // ~1.5 km from the registered position
    return st;
  });
  check('vehicle displaced after firing', moved === 'DRIVE', moved);
  await page.waitForTimeout(11000);         // let the salvo land
  await shot('11-cb-landed.png');
  const survived = await page.evaluate(() => {
    const g = App.game;
    const impacts = g.terrain.decals.slice(-5).map((d) => d.x);
    const aimSpread = impacts.length
      ? Math.max(...impacts.map((x) => Math.abs(x - 900))) : 1e9;
    return {
      landed: g.shells.filter((s) => s.kind === 'cb').length === 0,
      alive: !g.vehicle.destroyed, hp: g.vehicle.hp, aimSpread: Math.round(aimSpread)
    };
  });
  check('CB salvo landed on the OLD firing position', survived.landed && survived.aimSpread < 500,
    'spread ' + survived.aimSpread + ' m around old position');
  check('gun survived the scoot untouched', survived.alive && survived.hp === 100,
    'hp=' + survived.hp);

  // rearm cycle
  const rearm1 = await page.evaluate(() => {
    const g = App.game;
    g.vehicle.mag = 5; g.vehicle.v = 0;
    return g.vehicle.startRearm();
  });
  check('rearm starts while stationary with stabilizers up', rearm1 === true);
  await page.evaluate(() => { App.game.vehicle.rearmT = App.game.vehicle.resupplyTime - 0.05; });
  await page.waitForTimeout(400);
  const rearmed = await page.evaluate(() => App.game.vehicle.mag);
  check('rearm refills the 40-round cassette', rearmed === 40, 'mag=' + rearmed);

  check('no JS errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nSmoke test passed.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
