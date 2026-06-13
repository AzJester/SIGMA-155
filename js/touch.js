/* SIGMA 155: FIRE MISSION — on-screen touch controls.
   Buttons inject the same key codes the keyboard uses, so the game logic is unchanged. */
'use strict';

const Touch = {
  active: false,

  init() {
    this.active = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!this.active) return;
    const ui = document.getElementById('touch-ui');
    if (!ui) return;
    ui.classList.add('on');

    const bind = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => {
        e.preventDefault();
        Sfx.init(); Sfx.resume();
        Input.keys[code] = true;
        Input.pressed[code] = true;
        el.classList.add('held');
      };
      const up = (e) => {
        e.preventDefault();
        Input.keys[code] = false;
        el.classList.remove('held');
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    bind('tb-left', 'KeyA');
    bind('tb-right', 'KeyD');
    bind('tb-emplace', 'KeyE');
    bind('tb-fire', 'Space');
    bind('tb-mrsi', 'KeyM');
    bind('tb-rearm', 'KeyR');
    bind('tb-map', 'Tab');
    bind('tb-cam', 'KeyC');
    bind('tb-pause', 'KeyP');
  }
};
