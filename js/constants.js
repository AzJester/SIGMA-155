/* SIGMA 155: FIRE MISSION — real-world figures (SPEC) and gameplay tuning (TUNE) */
'use strict';

/* Figures quoted from the June 2026 single-system assessment. Items marked
   "claim" are manufacturer claims without independent verification. */
const SPEC = {
  NAME: 'SIGMA 155',
  ORDNANCE: '155mm/52-cal, 23L JBMOU chamber',
  MAGAZINE: 40,                 // complete rounds, automated handling
  BURST_RPM: 8,                 // >8 rds/min burst (Elbit claim)
  RANGE_STD_KM: 40,             // standard / base bleed
  RANGE_RAP_KM: 70,             // 70+ km claim with rocket-assisted projectiles
  CREW: 3,                      // commander, gunner, driver
  TRAVERSE_DEG: 360,
  EMPLACE_S: 60,                // about 45-60 s into action
  DISPLACE_S: 5,                // "seconds out"
  RESUPPLY_MIN: 15,             // full cassette resupply
  DEVIATION_PCT: 0.7,           // accuracy claim: 0.7% deviation
  CB_RESPONSE_S: 90,            // "90-second counterbattery response" era
  CHASSIS: 'Oshkosh 10x10 Mobile Artillery Platform'
};

const TUNE = {
  // World
  WORLD_W: 76000,               // meters of battlefield
  PLAYER_MIN_X: 250,
  PLAYER_MAX_X: 3200,
  FOB_X: 1500,                  // friendly forward operating base (rocket target)
  GROUND_SEED: 1337,

  // Time compression: shell flight & enemy fires integrate at this multiple
  TIME_SCALE: 11,

  // Vehicle
  DRIVE_SPEED: 22,              // m/s (~80 km/h class)
  DRIVE_ACCEL: 26,
  EMPLACE_T: 4.0,               // viewer-seconds (compressed from ~60 s)
  DISPLACE_T: 2.0,
  SHOT_COOLDOWN: 2.2,           // viewer-seconds between rounds
  MRSI_GAP: 0.85,               // min viewer-seconds between MRSI shots
  MRSI_ROUNDS: 3,
  LAY_RATE_DEG: 26,             // barrel lay speed deg/s (viewer)
  RESUPPLY_T: 12.0,             // viewer-seconds (compressed from ~15 min)
  VEHICLE_HP: 100,

  // Counter-battery
  CB_TIME_SCALE: 6,             // incoming CB rounds fly at a gentler compression so
                                // a fast reactive scoot is lossy but survivable
  CB_LOCK_PER_SHOT: 0.085,
  CB_LOCK_DECAY: 0.022,         // per second
  CB_WARNING_T: 7.0,            // viewer-seconds from launch warning to impact
  CB_SALVO: 5,
  CB_SPREAD: 150,               // m around aim point
  CB_SAFE_DIST: 300,            // displace at least this far to be safe
  CB_RESET_ON_MOVE: 0.3,        // lock multiplier after displacing safely

  // Drones
  DRONE_SPOT_RANGE: 1500,
  DRONE_LOCK_MULT: 2.2,
  RWS_RANGE: 800,
  RWS_KILL_CHANCE: 0.55,        // per second within range

  // Damage
  SHELL_DMG: 38,                // at center of burst
  SHELL_RADIUS: 95,             // damage falls to 0 at this distance
  MRSI_BONUS: 1.5,              // damage multiplier on simultaneous impacts
  ROCKET_BASE_DMG: 8,           // FOB integrity per leaker
  CONVOY_BASE_DMG: 14,          // per vehicle reaching the line

  // Scoring
  SCORE_PER_HP: 10,
  SCORE_KILL: 250,
  SCORE_MRSI_KILL: 500,
  SCORE_BASE_BONUS: 12,         // x integrity % at mission end
  SCORE_AMMO_BONUS: 15,         // x rounds remaining at mission end

  // Camera
  CAM_GUN_SCALE: 13,            // px per meter near the gun (vehicle ≈ 165 px long)
  CAM_MIN_SCALE: 0.011,
  CAM_MAX_SCALE: 3.4,

  // Colors (military terminal palette)
  COL: {
    GREEN: '#7dff9a',
    GREEN_DIM: '#3f8f56',
    AMBER: '#ffb454',
    RED: '#ff5f56',
    CYAN: '#6fd7ff',
    WHITE: '#e8f0e8',
    GRID: 'rgba(125,255,154,0.08)',
    PANEL: 'rgba(6,12,8,0.78)'
  }
};

/* Difficulty tiers: multipliers on CB lock rate, enemy tempo, damage taken, score */
const DIFFICULTY = {
  EASY:     { name: 'EASY',     cb: 0.6, tempo: 0.8,  dmg: 0.6, score: 0.75 },
  STANDARD: { name: 'STANDARD', cb: 1.0, tempo: 1.0,  dmg: 1.0, score: 1.0 },
  VETERAN:  { name: 'VETERAN',  cb: 1.4, tempo: 1.25, dmg: 1.3, score: 1.25 }
};

/* Upgrade pool — each entry maps to a fact in the assessment */
const UPGRADES = {
  IRON_FIST: {
    name: 'IRON FIST APS',
    desc: 'Active protection system intercepts up to 2 incoming counter-battery shells per salvo.',
    flavor: 'Self-defense fits to customer order; Elbit’s own Iron Fist is the obvious candidate.'
  },
  RAP: {
    name: 'XM1113 RAP',
    desc: 'Rocket-assisted projectiles unlock CHG 6 — reach past 70 km.',
    flavor: 'Extended-range claims run past 70 km. Manufacturer claim, tied to specific munitions.'
  },
  EXCALIBUR: {
    name: 'M982 EXCALIBUR',
    desc: 'Precision guidance kits cut dispersion by 80%.',
    flavor: 'JBMOU chamber fires the full US/NATO catalog, including Excalibur-class rounds.'
  },
  LATTICE: {
    name: 'LATTICE UPLINK',
    desc: 'Sensor-to-shooter cueing: full threat intel, enemy launch timers slowed 25%.',
    flavor: 'Anduril brings Lattice for C2 plus edge compute — a battery synchronized to the intelligence picture.'
  },
  CREW_DRILL: {
    name: 'CREW DRILL',
    desc: 'Emplace and displace 35% faster.',
    flavor: 'Emplacement runs 45–60 seconds in, displacement a few seconds more.'
  },
  CASSETTE: {
    name: 'CASSETTE PRE-STAGE',
    desc: 'Full magazine rearm twice as fast.',
    flavor: 'A full magazine reloads by cassette in about 15 minutes.'
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { SPEC, TUNE, UPGRADES };
