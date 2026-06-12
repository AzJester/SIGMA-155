/* SIGMA 155: FIRE MISSION — campaign missions, environments, endless wave generator */
'use strict';

const ENVS = {
  dusk: {
    skyTop: '#1a1430', skyMid: '#6b3a3a', skyLow: '#c97b4a',
    ridges: ['rgba(70,52,66,0.85)', 'rgba(52,40,50,0.92)', 'rgba(38,30,38,1)'],
    ground: '#2e2a22', groundRim: 'rgba(220,160,110,0.35)',
    sunX: 0.78, sunY: 0.30, sunColor: 'rgba(255,170,90,0.9)', stars: false, t: 0
  },
  day: {
    skyTop: '#5d86a8', skyMid: '#9db4bd', skyLow: '#cfd3c0',
    ridges: ['rgba(120,130,125,0.6)', 'rgba(95,105,95,0.75)', 'rgba(70,80,68,0.95)'],
    ground: '#4a4a38', groundRim: 'rgba(230,230,200,0.4)',
    sunX: 0.6, sunY: 0.16, sunColor: 'rgba(255,245,220,0.95)', stars: false, t: 0
  },
  night: {
    skyTop: '#05070f', skyMid: '#0a0f1c', skyLow: '#141a24',
    ridges: ['rgba(16,20,28,0.9)', 'rgba(12,15,22,0.95)', 'rgba(8,10,16,1)'],
    ground: '#10130f', groundRim: 'rgba(110,160,140,0.25)',
    sunX: 0.2, sunY: 0.2, sunColor: 'rgba(220,228,240,0.9)', stars: true, t: 0
  },
  dawn: {
    skyTop: '#23284a', skyMid: '#7a5a62', skyLow: '#d9a05e',
    ridges: ['rgba(60,58,80,0.8)', 'rgba(46,44,62,0.9)', 'rgba(32,32,44,1)'],
    ground: '#33301f', groundRim: 'rgba(255,200,130,0.35)',
    sunX: 0.86, sunY: 0.42, sunColor: 'rgba(255,150,80,0.95)', stars: false, t: 0
  }
};

const MISSIONS = [
  {
    id: 'M1',
    name: 'PROVING GROUND',
    sub: 'Qualification shoot — Yuma test range',
    env: 'dusk',
    tutorial: true,
    windRange: [0, 3],
    cbRate: 0,
    droneEvery: 0,
    briefing: [
      'Six years of development come down to this firing table.',
      'Three qualification targets are staked out between 6 and 24 km. The fire',
      'control computer will lay the gun — your job is the gun drill:',
      '',
      '  1. EMPLACE [E] — the gun cannot fire on the move.',
      '  2. Select a target — click it on the THREAT BOARD or the map strip.',
      '  3. FIRE [SPACE] when the FCS shows SOLUTION READY.',
      '  4. Try MRSI [M] on the 15 km target: three rounds, one impact.',
      '',
      'No threat reaction expected. Make the data look good — the program needs it.'
    ],
    sites: [
      ['DUMP', 6200], ['DUMP', 15200], ['DUMP', 23800]
    ],
    convoys: [],
    baseIntegrity: 100
  },
  {
    id: 'M2',
    name: "RO'EM DEBUT",
    sub: 'First combat employment — northern sector',
    env: 'day',
    windRange: [2, 7],
    cbRate: 0.55,
    droneEvery: 55,
    briefing: [
      'Rocket and anti-tank positions are firing on the forward line. Brigade',
      'needs them gone, and the order of magnitude matters: one gun is being',
      'asked to deliver what used to take a battalion.',
      '',
      'PRIORITIES: rocket sites lob salvos at the FOB on a timer — kill them',
      'before base integrity bleeds out. The ATGM team and the dump are cleanup.',
      '',
      'Enemy guns are active in this sector. Every round you fire builds their',
      'radar track on your position. Watch the CB LOCK bar — shoot, then move.'
    ],
    sites: [
      ['ROCKET', 9500, { interval: 30 }],
      ['ROCKET', 17500, { interval: 34 }],
      ['ATGM', 13000],
      ['ROCKET', 26000, { interval: 40 }],
      ['GUN', 30500, { primary: false }],
      ['DUMP', 21500, { primary: false }]
    ],
    convoys: [],
    baseIntegrity: 100
  },
  {
    id: 'M3',
    name: 'COUNTERFIRE',
    sub: 'Night duel — enemy battery group',
    env: 'night',
    windRange: [4, 10],
    cbRate: 1.0,
    droneEvery: 38,
    briefing: [
      'An enemy battery group with its own counter-battery radar is working',
      'this sector at night. They answer in about 90 seconds. You emplace in 60.',
      'That margin is the whole fight.',
      '',
      'PRIORITIES: their radar at 28 km feeds the battery — killing it slows',
      'their lock. The two gun positions are the mission. A mechanized convoy',
      'is also pushing toward the line.',
      '',
      'Fire two, three rounds, then DISPLACE at least 300 m. Stay disciplined',
      'and their salvos land on empty grid squares.'
    ],
    sites: [
      ['RADAR', 28000],
      ['GUN', 31500],
      ['GUN', 35500],
      ['ROCKET', 14500, { interval: 26 }],
      ['ROCKET', 22000, { interval: 30 }],
      ['DUMP', 33500, { primary: false }]
    ],
    convoys: [{ x: 26000, n: 4, speed: 9 }],
    baseIntegrity: 100
  },
  {
    id: 'M4',
    name: 'DEEP STRIKE',
    sub: 'Extended range interdiction at dawn',
    env: 'dawn',
    windRange: [8, 14],
    cbRate: 0.8,
    droneEvery: 42,
    grantRap: true,
    briefing: [
      'Intelligence has fixed the enemy operating base: a radar, gun positions',
      'and supply dumps between 45 and 70 km — far past standard range.',
      'XM1113 rocket-assisted projectiles are released for this mission: CHG 6.',
      '',
      'The 70 km figure is a manufacturer claim. You are about to verify it.',
      '',
      'Wind is strong at altitude; the FCS compensates, but dispersion grows',
      'with range. MRSI from CHG 6 is your deepest hammer. Rocket sites closer',
      'in will keep pressure on the FOB — manage both.'
    ],
    sites: [
      ['RADAR', 47500],
      ['GUN', 52500],
      ['DUMP', 58500],
      ['GUN', 64000],
      ['DUMP', 69000],
      ['ROCKET', 12500, { interval: 30 }],
      ['ROCKET', 20500, { interval: 36 }]
    ],
    convoys: [{ x: 30000, n: 3, speed: 10 }],
    baseIntegrity: 100
  }
];

const ENDLESS = {
  id: 'E1',
  name: "BATTALION'S WORTH",
  sub: 'Endless — one battery, the volume of a battalion',
  env: 'night',
  windRange: [3, 12],
  cbRate: 0.7,
  droneEvery: 45,
  briefing: [
    '"One battery now delivers the fire volume that previously took a',
    'battalion." Tonight the claim gets stress-tested.',
    '',
    'Waves of rocket sites, batteries, radars and convoys will keep coming,',
    'each wave deeper and faster than the last. Hold base integrity, keep the',
    'gun alive, and run the magazine like the automation was built to do.',
    '',
    'There is no end state. There is only the score.'
  ]
};

/* Generate one endless wave. Difficulty scales with wave number. */
function endlessWave(waveNum, rand) {
  const sites = [];
  const n = Math.min(7, 2 + Math.floor(waveNum * 0.8));
  for (let i = 0; i < n; i++) {
    const roll = rand();
    const minR = 8000 + waveNum * 800;
    const maxR = Math.min(72000, 20000 + waveNum * 5200);
    const x = minR + rand() * (maxR - minR);
    if (roll < 0.42) sites.push(['ROCKET', x, { interval: Math.max(16, 30 - waveNum * 1.5) }]);
    else if (roll < 0.62) sites.push(['GUN', x]);
    else if (roll < 0.76) sites.push(['RADAR', x]);
    else if (roll < 0.88) sites.push(['ATGM', x]);
    else sites.push(['DUMP', x]);
  }
  const convoys = [];
  if (waveNum >= 2 && rand() < 0.65) {
    convoys.push({ x: 20000 + rand() * 18000, n: 3 + Math.min(3, Math.floor(waveNum / 2)), speed: 8 + waveNum * 0.7 });
  }
  return { sites: sites, convoys: convoys };
}
