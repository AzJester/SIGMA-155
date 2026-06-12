# SIGMA 155: FIRE MISSION — Game Design & Technical Plan

A modern, browser-playable arcade artillery game built around the real discriminators of the
Elbit SIGMA 155 / Ro'em self-propelled howitzer, as described in the June 2026 single-system
assessment. Every core mechanic maps to a documented characteristic of the system.

> This is a work of fiction inspired by open-source reporting. Specifications used in-game are
> drawn from manufacturer claims and trade press and are compressed/scaled for gameplay.

---

## 1. Concept

**Genre:** Side-view tactical artillery / shoot-and-scoot survival (single player)
**Pitch:** You command a single SIGMA 155 on a 75 km battlefield. One gun is supposed to deliver
a battalion's worth of fires — prove it. Emplace, let the fire control computer lay the gun,
empty the magazine into targets up to 70 km out, and displace before the counter-battery
response arrives.

**Why this genre:** The assessment identifies the system's actual gameplay-shaped tensions:

| Real characteristic (from the assessment)            | Game mechanic                                          |
|-------------------------------------------------------|--------------------------------------------------------|
| Must stop and emplace to shoot (vs RCH 155)            | Fire only while EMPLACED; emplace/displace timers       |
| ~45–60 s into action, seconds out                      | Emplacement timer; fast displacement                    |
| 40-round automated magazine                            | 40-round counter; no reload mid-engagement              |
| >8 rds/min burst, MRSI capable                         | Short fire cooldown; MRSI multi-round simultaneous impact|
| 4–40 km standard, 70+ km with RAP (claim)              | Charge selection 1–5; RAP unlock extends range          |
| 0.7% deviation accuracy (claim)                        | Dispersion = 0.7% of range; Excalibur upgrade tightens  |
| 90-second counterbattery era / survivability argument  | CB radar lock meter; salvo lands on your last position  |
| Full cassette resupply ≈ 15 minutes                    | Rearm timer while displaced                             |
| 3-person crew under armor, RWS / counter-drone fit     | Vehicle HP; auto RWS engages spotter drones             |
| Iron Fist APS candidate                                | Upgrade: intercepts incoming CB shells                  |
| Anduril Lattice sensor-to-shooter                      | Upgrade: full threat intel, slower enemy timers         |
| Software-defined FCS computes solutions                | Click target → auto-lay (charge + elevation + TOF)      |

**Time compression:** Shell flight, rate of fire, and enemy response are compressed ~11:1 so a
40 km shot takes seconds of viewer time instead of ~80. The HUD shows "real" FCS numbers
(TOF, elevation, charge) for flavor.

## 2. Core loop

1. **Receive missions** — targets appear on the threat board and minimap (rocket sites, ATGM
   teams, radars, enemy gun positions, supply dumps, advancing convoys).
2. **Emplace** (E) — stabilizers down, ~4 s game time. You cannot fire on the move.
3. **Engage** — click a target (threat board or minimap) → FCS computes and lays the gun.
   Fire (SPACE). Or aim manually (↑/↓ elevation, Q/A charge). MRSI (M) fires 3 rounds on
   different trajectories that land simultaneously for a damage bonus.
4. **Watch the CB meter** — every round fired builds counter-battery radar lock. Spotter drones
   accelerate it. At full lock, a 5-round enemy salvo lands on your firing position ~7 s later.
5. **Scoot** (E, then A/D) — displace ≥ 300 m to survive the salvo. Lock partially resets.
6. **Sustain** — magazine empty? Displace and rearm (R, ~12 s). Protect the FOB: rockets and
   convoys grind down Base Integrity; you lose at 0%, or if the vehicle is destroyed.

## 3. Structure

- **Campaign (4 missions)** following the real program record:
  1. **PROVING GROUND** — Yuma-style qualification. Tutorial, static targets, no threats.
  2. **RO'EM DEBUT** — April 2026 southern Lebanon debut: rocket and ATGM positions to 40 km.
  3. **COUNTERFIRE** — night duel vs enemy battery + radar; heavy CB pressure.
  4. **DEEP STRIKE** — RAP rounds issued; targets at 45–70 km in strong wind.
- **ENDLESS: "BATTALION'S WORTH"** — escalating waves, high score in localStorage.
- **Upgrades** after each campaign mission (pick 1 of 3): Iron Fist APS, XM1113 RAP,
  Excalibur kits, Lattice uplink, Crew drill (faster emplacement), Cassette pre-stage
  (faster rearm). Owned upgrades carry into Endless.

## 4. Presentation

- **Look:** procedural vector art on HTML5 Canvas — no image assets. Parallax ridgelines,
  per-mission time of day, particle smoke/flash/dust/shockwaves, tracer fire, screen shake,
  shell-follow camera that tracks rounds downrange, tactical zoom for long shots.
- **UI:** military fire-direction-terminal aesthetic — monospace, phosphor green/amber on
  near-black, scanline overlay. HUD: gun status panel, threat board, CB lock meter, full-width
  minimap (0–75 km), objective tracker, warnings ("COUNTERBATTERY INBOUND — DISPLACE").
- **Audio:** fully synthesized with Web Audio API (no audio files): muzzle blast with distance
  delay, descent whistle, impacts, CB alarm, UI ticks, engine.

## 5. Technical architecture

**Zero dependencies, zero build step.** Plain HTML/CSS/JS as classic scripts (works from
`file://` or any static server; GitHub Pages-ready).

```
index.html            entry point, script order
styles.css            UI/overlay styling
js/util.js            math, seeded RNG, value noise, easing, formatting
js/constants.js       SPEC (real figures from the assessment) + TUNE (game scaling)
js/ballistics.js      shell integrator (gravity + quadratic drag + wind), range tables,
                      FCS solvers (auto-lay, wind compensation, MRSI planner) — node-testable
js/audio.js           Web Audio synth engine
js/input.js           keyboard/mouse state
js/terrain.js         procedural heightfield (value noise), rendering, scorch decals
js/camera.js          gun / shell-follow / tactical camera modes with smoothing
js/particles.js       particles + screen shake
js/projectile.js      player shells, enemy rockets, CB shells
js/vehicle.js         SIGMA 155: states (drive/emplace/displace), turret lay, RWS, rendering
js/enemies.js         target sites, convoys, spotter drones, CB director
js/missions.js        campaign definitions, briefings, endless wave generator
js/hud.js             canvas HUD, threat board, minimap with click-to-select
js/screens.js         DOM screens: title, briefing, debrief, upgrades, pause, help
js/game.js            game state machine, scoring, win/lose, upgrade application
js/main.js            boot, resize, RAF loop
test/ballistics_test.js   node test: range table sanity (charge 5 ≈ 40 km, RAP ≈ 70 km),
                          solver convergence, MRSI simultaneity
```

**Physics:** projectiles integrate `a = g + drag(v) + wind` in real units (m, m/s) at 11×
time scale. Range/TOF lookup tables are built at boot per charge (elevation 5°–85°); the FCS
solves low/high arc by interpolation, then applies a wind-correction iteration. MRSI picks
solutions with distinct TOFs and schedules fire times so impacts coincide.

**Verification:** `node --check` on every file; `node test/ballistics_test.js` asserts the
tuned drag model hits the documented range brackets; manual browser smoke test.

## 6. Out of scope (deliberately)

- Multiplayer, server backend, accounts — pure static client.
- 3D/WebGL — 2D vector look is the aesthetic, keeps it dependency-free and fast everywhere.
- Mobile touch layout — playable desktop-first (keyboard+mouse); stretch goal later.

## 7. Milestones

1. Plan committed (this document).
2. Engine core: loop, terrain, camera, vehicle, ballistics + tests.
3. Combat: shells, targets, CB system, drones, rockets, particles, audio.
4. Game shell: HUD, screens, missions, upgrades, scoring, persistence.
5. Polish pass + README + verification; push branch and open draft PR.
