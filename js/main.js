/* SIGMA 155: FIRE MISSION — bootstrap, app state machine, main loop */
'use strict';

const App = {
  canvas: null,
  ctx: null,
  game: null,
  pending: null,            // { mission, endless } waiting on the briefing screen
  state: 'MENU',            // MENU | PLAY | PAUSE
  attract: null,
  _last: 0,
  _attractFireT: 3,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    Save.load();
    Input.init(this.canvas);
    Screens.init();
    Sfx.enabled = Save.data.settings.sound;
    this.applyCrt();

    Ballistics.buildTables();

    // attract-mode scene behind the menus
    const terrain = new Terrain(TUNE.GROUND_SEED);
    const attract = {
      terrain: terrain,
      particles: new Particles(),
      camera: new Camera(this.canvas),
      vehicle: new Vehicle(940),
      env: Object.assign({}, ENVS.dusk),
      toast() {}
    };
    attract.vehicle.state = 'EMPLACED';
    attract.vehicle.elevDeg = attract.vehicle.targetElev = 33;
    this.attract = attract;

    Screens.showTitle();
    requestAnimationFrame((ts) => this.loop(ts));
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  applyCrt() {
    document.body.classList.toggle('crt', !!Save.data.settings.crt);
  },

  toTitle() {
    this.state = 'MENU';
    this.game = null;
    Screens.showTitle();
  },

  startMission(arg) {
    if (arg === 'endless') {
      this.pending = { mission: ENDLESS, endless: true };
    } else {
      const m = MISSIONS[arg];
      if (!m) return;
      this.pending = { mission: m, endless: false };
    }
    this.state = 'MENU';
    this.game = null;
    Screens.showBriefing(this.pending.mission);
  },

  launchLoaded() {
    if (!this.pending) return;
    this._newGame();
  },

  restartMission() {
    if (!this.pending && this.game) {
      this.pending = { mission: this.game.mission, endless: this.game.endless };
    }
    if (this.pending) this._newGame();
  },

  _newGame() {
    this.game = new Game(this.canvas, this.pending.mission, {
      endless: this.pending.endless,
      upgrades: Save.data.upgrades
    });
    if (!Save.data.settings.shake) this.game.camera.addShake = function () {};
    Screens.hide();
    this.state = 'PLAY';
  },

  pause() {
    if (this.state !== 'PLAY' || !this.game) return;
    this.state = 'PAUSE';
    Screens.showPause();
  },

  resume() {
    if (!this.game) { this.toTitle(); return; }
    Screens.hide();
    this.state = 'PLAY';
  },

  loop(ts) {
    const dt = Math.min(0.05, Math.max(0.001, (ts - this._last) / 1000 || 0.016));
    this._last = ts;
    const ctx = this.ctx;

    if (this.state === 'PLAY' && this.game) {
      if (Input.hit('KeyP') || Input.hit('Escape')) {
        this.pause();
      } else if (Input.hit('KeyH')) {
        this.state = 'PAUSE';
        Screens.showHelp(true);
      } else {
        this.game.update(dt);
      }
    } else if (this.state === 'PAUSE') {
      if (Input.hit('Escape') || Input.hit('KeyP')) this.resume();
    }

    if (this.game) {
      this.game.render(ctx);
    } else {
      this.renderAttract(ctx, dt);
    }

    Input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  },

  renderAttract(ctx, dt) {
    const a = this.attract;
    const H = this.canvas.height;
    a.env.t = (a.env.t || 0) + dt;
    a.camera.scale = 7.5 * (H / 1080);
    a.camera.x = 965 + Math.sin(a.env.t * 0.07) * 14;
    a.camera.y = a.terrain.heightAt(940) + (H * 0.05) / a.camera.scale;
    a.camera._shakeX = (Math.random() - 0.5) * a.camera.shake;
    a.camera._shakeY = (Math.random() - 0.5) * a.camera.shake;
    a.camera.shake = Math.max(0, a.camera.shake - 26 * dt);

    // periodic demonstration shot
    this._attractFireT -= dt;
    if (this._attractFireT <= 0) {
      this._attractFireT = 5.5 + Math.random() * 3;
      const m = a.vehicle.muzzle(a);
      const e = Util.deg2rad(a.vehicle.elevDeg);
      a.particles.muzzleFlash(m.x, m.y, Math.cos(e), Math.sin(e));
      a.camera.shake = 7;
      a.vehicle.targetElev = 24 + Math.random() * 22;
    }
    // the attract vehicle skips the full update; just lay the barrel
    const d = a.vehicle.targetElev - a.vehicle.elevDeg;
    a.vehicle.elevDeg += Util.clamp(d, -TUNE.LAY_RATE_DEG * dt, TUNE.LAY_RATE_DEG * dt);

    a.terrain.draw(ctx, a.camera, a.env);
    a.vehicle.draw(ctx, a.camera, a);
    a.particles.update(dt);
    a.particles.draw(ctx, a.camera);
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
