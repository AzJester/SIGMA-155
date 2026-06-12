/* SIGMA 155: FIRE MISSION — DOM screens: title, mission select, briefing, debrief, pause, help */
'use strict';

const Save = {
  KEY: 'sigma155_fire_mission',
  data: null,
  load() {
    try {
      this.data = JSON.parse(localStorage.getItem(this.KEY)) || {};
    } catch (e) { this.data = {}; }
    this.data.unlocked = this.data.unlocked || 1;
    this.data.upgrades = this.data.upgrades || {};
    this.data.bestEndless = this.data.bestEndless || 0;
    this.data.bestWave = this.data.bestWave || 0;
    this.data.settings = Object.assign({ sound: true, shake: true, crt: true }, this.data.settings);
    return this.data;
  },
  store() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
  }
};

const Screens = {
  el: null,
  visible: false,

  init() {
    this.el = document.getElementById('overlay');
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      Sfx.init(); Sfx.resume(); Sfx.click();
      this.onAction(btn.dataset.action, btn.dataset.arg);
    });
  },

  show(html) {
    this.el.innerHTML = html;
    this.el.classList.add('visible');
    this.visible = true;
  },
  hide() {
    this.el.classList.remove('visible');
    this.el.innerHTML = '';
    this.visible = false;
  },

  onAction(action, arg) {
    switch (action) {
      case 'title': App.toTitle(); break;
      case 'select': this.showSelect(); break;
      case 'syscard': this.showSysCard(); break;
      case 'help': this.showHelp(arg === 'pause'); break;
      case 'start': App.startMission(parseInt(arg, 10)); break;
      case 'endless': App.startMission('endless'); break;
      case 'launch': App.launchLoaded(); break;
      case 'resume': App.resume(); break;
      case 'restart': App.restartMission(); break;
      case 'pause-back': this.showPause(); break;
      case 'pick-upgrade': {
        Save.data.upgrades[arg] = true;
        Save.store();
        this.showDebrief(App.game, true);
        break;
      }
      case 'toggle-sound':
        Save.data.settings.sound = !Save.data.settings.sound;
        Save.store(); Sfx.setEnabled(Save.data.settings.sound);
        this.showPause();
        break;
      case 'toggle-shake':
        Save.data.settings.shake = !Save.data.settings.shake;
        Save.store();
        this.showPause();
        break;
      case 'toggle-crt':
        Save.data.settings.crt = !Save.data.settings.crt;
        Save.store(); App.applyCrt();
        this.showPause();
        break;
      case 'reset-save':
        if (confirm('Reset campaign progress, upgrades and high scores?')) {
          Save.data = {}; Save.load(); Save.store(); this.showTitle();
        }
        break;
    }
  },

  frame(title, inner, cls) {
    return '<div class="screen ' + (cls || '') + '">' +
      '<div class="frame">' +
      (title ? '<h1>' + title + '</h1>' : '') +
      inner +
      '</div></div>';
  },

  showTitle() {
    const s = Save.data;
    this.show(this.frame('',
      '<div class="title-block">' +
      '<div class="title-kicker">LAND SYSTEMS // FIRE DIRECTION CENTER</div>' +
      '<div class="title-main">SIGMA 155</div>' +
      '<div class="title-sub">FIRE MISSION</div>' +
      '<div class="title-tag">One gun. A battalion’s worth of fires. Shoot &amp; scoot.</div>' +
      '</div>' +
      '<div class="btn-col">' +
      '<button class="btn primary" data-action="select">DEPLOY</button>' +
      '<button class="btn" data-action="syscard">SYSTEM CARD</button>' +
      '<button class="btn" data-action="help">CONTROLS</button>' +
      '</div>' +
      '<div class="footnote">Best endless: ' + s.bestEndless + ' pts / wave ' + s.bestWave +
      ' &nbsp;·&nbsp; A fictional game inspired by open-source reporting. Desktop + keyboard recommended.</div>',
      'center'));
  },

  showSelect() {
    const s = Save.data;
    let rows = '';
    MISSIONS.forEach((m, i) => {
      const locked = i + 1 > s.unlocked;
      rows += '<button class="mission-row' + (locked ? ' locked' : '') + '" ' +
        (locked ? 'disabled' : 'data-action="start" data-arg="' + i + '"') + '>' +
        '<span class="m-id">' + m.id + '</span>' +
        '<span class="m-name">' + m.name + '</span>' +
        '<span class="m-sub">' + (locked ? 'LOCKED — clear previous mission' : m.sub) + '</span>' +
        '</button>';
    });
    rows += '<button class="mission-row endless" data-action="endless">' +
      '<span class="m-id">∞</span>' +
      '<span class="m-name">' + ENDLESS.name + '</span>' +
      '<span class="m-sub">' + ENDLESS.sub + '</span></button>';

    const owned = Object.keys(s.upgrades).filter(k => s.upgrades[k]);
    const upgList = owned.length
      ? owned.map(k => UPGRADES[k].name).join(' · ')
      : 'none yet — earned after each campaign mission';

    this.show(this.frame('MISSION SELECT',
      rows +
      '<div class="upg-strip"><b>FITTED:</b> ' + upgList + '</div>' +
      '<div class="btn-row">' +
      '<button class="btn" data-action="title">BACK</button>' +
      '<button class="btn danger" data-action="reset-save">RESET PROGRESS</button>' +
      '</div>'));
  },

  showSysCard() {
    const rows = [
      ['Ordnance', SPEC.ORDNANCE],
      ['Magazine', SPEC.MAGAZINE + ' complete rounds, fully automated handling'],
      ['Rate of fire', '>' + SPEC.BURST_RPM + ' rds/min burst, MRSI capable'],
      ['Range', '4–' + SPEC.RANGE_STD_KM + ' km standard / ' + SPEC.RANGE_RAP_KM + '+ km RAP*'],
      ['Crew', SPEC.CREW + ' (commander, gunner, driver), armored NBC cab'],
      ['Turret', 'Unmanned, ' + SPEC.TRAVERSE_DEG + '° traverse, four hydraulic stabilizers'],
      ['Into/out of action', '≈' + SPEC.EMPLACE_S + ' s in, seconds out'],
      ['Resupply', 'Full cassette in ≈' + SPEC.RESUPPLY_MIN + ' min'],
      ['Accuracy', SPEC.DEVIATION_PCT + '% deviation*'],
      ['Chassis', SPEC.CHASSIS]
    ].map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('');
    this.show(this.frame('SIGMA 155 — SYSTEM CARD',
      '<table class="spec">' + rows + '</table>' +
      '<p class="fine">*Manufacturer claims without independent verification. In-game, every one of these' +
      ' figures is a mechanic: the magazine is your ammo counter, emplacement is your firing gate,' +
      ' the 0.7% deviation is your dispersion model, and the counter-battery clock is the reason you move.</p>' +
      '<div class="btn-row"><button class="btn" data-action="title">BACK</button></div>'));
  },

  showBriefing(mission) {
    const body = mission.briefing.map(l => l === '' ? '<br>' : '<div>' + l + '</div>').join('');
    this.show(this.frame(mission.id + ' — ' + mission.name,
      '<div class="brief-sub">' + mission.sub + '</div>' +
      '<div class="brief-body">' + body + '</div>' +
      '<div class="btn-row">' +
      '<button class="btn" data-action="select">BACK</button>' +
      '<button class="btn primary" data-action="launch">START MISSION</button>' +
      '</div>'));
  },

  showPause() {
    const s = Save.data.settings;
    this.show(this.frame('PAUSED',
      '<div class="btn-col">' +
      '<button class="btn primary" data-action="resume">RESUME</button>' +
      '<button class="btn" data-action="restart">RESTART MISSION</button>' +
      '<button class="btn" data-action="help" data-arg="pause">CONTROLS</button>' +
      '<button class="btn" data-action="toggle-sound">SOUND: ' + (s.sound ? 'ON' : 'OFF') + '</button>' +
      '<button class="btn" data-action="toggle-shake">SCREEN SHAKE: ' + (s.shake ? 'ON' : 'OFF') + '</button>' +
      '<button class="btn" data-action="toggle-crt">CRT FILTER: ' + (s.crt ? 'ON' : 'OFF') + '</button>' +
      '<button class="btn danger" data-action="title">ABANDON MISSION</button>' +
      '</div>', 'center'));
  },

  showHelp(fromPause) {
    const rows = [
      ['A / D, ← / →', 'Drive (only with stabilizers up)'],
      ['E', 'Emplace / displace — the gun cannot fire on the move'],
      ['CLICK target', 'Threat board or map strip: FCS computes and lays automatically'],
      ['SPACE / F / CLICK', 'Fire when SOLUTION READY'],
      ['M', 'MRSI: 3 rounds, different trajectories, one simultaneous impact'],
      ['↑ / ↓ (+SHIFT)', 'Manual elevation'],
      ['Q / Z or WHEEL', 'Charge select (CHG 6 RAP after upgrade)'],
      ['R', 'Rearm full cassette (stationary, stabilizers up)'],
      ['TAB', 'Tactical map view'],
      ['C', 'Toggle shell-follow camera'],
      ['P / ESC', 'Pause']
    ].map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('');
    this.show(this.frame('CONTROLS',
      '<table class="spec keys">' + rows + '</table>' +
      '<p class="fine">Doctrine: emplace, fire two or three rounds, displace at least 300 m before the' +
      ' counter-battery salvo lands. The CB LOCK bar at the top is your clock. Drones overhead make it run faster' +
      ' — the RWS engages them automatically when they get close.</p>' +
      '<div class="btn-row"><button class="btn" data-action="' +
      (fromPause ? 'pause-back' : 'title') + '">BACK</button></div>'));
  },

  /* Debrief. pickDone=true after an upgrade has been chosen. */
  showDebrief(game, pickDone) {
    const win = game.result === 'WIN';
    const stats =
      '<table class="spec stats">' +
      '<tr><td>Score</td><td>' + game.score + '</td></tr>' +
      (game.endless ? '<tr><td>Waves held</td><td>' + game.wave + '</td></tr>' : '') +
      '<tr><td>Rounds fired</td><td>' + game.roundsFired + '</td></tr>' +
      '<tr><td>Targets destroyed</td><td>' + game.kills + (game.mrsiKills ? ' (' + game.mrsiKills + ' by MRSI)' : '') + '</td></tr>' +
      '<tr><td>Hit ratio</td><td>' + (game.roundsFired ? Math.round(100 * game.hits / game.roundsFired) : 0) + '%</td></tr>' +
      '<tr><td>FOB integrity</td><td>' + Math.round(game.baseIntegrity) + '%</td></tr>' +
      '<tr><td>Gun status</td><td>' + (game.vehicle.destroyed ? 'DESTROYED' : Math.round(game.vehicle.hp) + '%') + '</td></tr>' +
      '</table>';

    let extra = '', buttons = '';
    const mIdx = MISSIONS.indexOf(game.mission);

    if (game.endless) {
      const s = Save.data;
      let record = '';
      if (game.score > s.bestEndless) {
        s.bestEndless = game.score; s.bestWave = Math.max(s.bestWave, game.wave); Save.store();
        record = '<div class="record">NEW RECORD</div>';
      }
      extra = record;
      buttons = '<button class="btn primary" data-action="endless">GO AGAIN</button>' +
        '<button class="btn" data-action="select">MISSION SELECT</button>';
    } else if (win) {
      if (mIdx >= 0 && mIdx + 2 > Save.data.unlocked) {
        Save.data.unlocked = Math.min(MISSIONS.length + 1, mIdx + 2);
        Save.store();
      }
      // upgrade pick
      if (!pickDone && !game._upgradeOffer) {
        const unowned = Object.keys(UPGRADES).filter(k => !Save.data.upgrades[k]);
        game._upgradeOffer = Util.shuffle(unowned, game.rand).slice(0, 3);
      }
      if (!pickDone && game._upgradeOffer && game._upgradeOffer.length) {
        extra = '<div class="upg-title">PROGRAM OFFICE: SELECT ONE FIT FOR THE NEXT MISSION</div><div class="upg-grid">' +
          game._upgradeOffer.map(k =>
            '<button class="upg-card" data-action="pick-upgrade" data-arg="' + k + '">' +
            '<div class="u-name">' + UPGRADES[k].name + '</div>' +
            '<div class="u-desc">' + UPGRADES[k].desc + '</div>' +
            '<div class="u-flavor">' + UPGRADES[k].flavor + '</div>' +
            '</button>').join('') + '</div>';
        buttons = '<button class="btn" data-action="select">SKIP</button>';
      } else {
        if (mIdx === MISSIONS.length - 1) {
          extra += '<p class="fine">Campaign complete. July 2026: the source-selection board meets with your' +
            ' firing data on the table. The automation story held. The rest is up to the contracting officers' +
            ' — and the GAO protest clock. Take the gun into ENDLESS and see how long the claim survives.</p>';
        }
        buttons = (mIdx >= 0 && mIdx < MISSIONS.length - 1
          ? '<button class="btn primary" data-action="start" data-arg="' + (mIdx + 1) + '">NEXT MISSION</button>'
          : '<button class="btn primary" data-action="endless">ENDLESS MODE</button>') +
          '<button class="btn" data-action="select">MISSION SELECT</button>';
      }
    } else {
      extra = '<div class="lose-reason">' + (game.resultReason || '') + '</div>';
      buttons = '<button class="btn primary" data-action="restart">RETRY</button>' +
        '<button class="btn" data-action="select">MISSION SELECT</button>';
    }

    this.show(this.frame(
      win ? 'MISSION COMPLETE' : (game.endless ? 'GUN SILENCED' : 'MISSION FAILED'),
      stats + extra + '<div class="btn-row">' + buttons + '</div>',
      win ? 'win' : 'lose'));
  }
};
