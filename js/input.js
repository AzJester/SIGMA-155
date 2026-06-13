/* SIGMA 155: FIRE MISSION — keyboard and mouse state */
'use strict';

const Input = {
  keys: {},            // currently held, by KeyboardEvent.code
  pressed: {},         // went down this frame
  mouse: { x: 0, y: 0, down: false, clicked: false, wheel: 0 },
  _handlers: [],       // optional per-frame consumers

  init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
      Sfx.init(); Sfx.resume();
      // keep the page from scrolling on game keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    // pointer events cover mouse, touch and pen
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
      if (e.button === 0 || e.pointerType === 'touch') { this.mouse.down = true; this.mouse.clicked = true; }
      Sfx.init(); Sfx.resume();
    });
    window.addEventListener('pointerup', () => { this.mouse.down = false; });
    canvas.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // call at the end of each frame
  endFrame() {
    this.pressed = {};
    this.mouse.clicked = false;
    this.mouse.wheel = 0;
  },

  hit(code) { return !!this.pressed[code]; },
  held(code) { return !!this.keys[code]; }
};
