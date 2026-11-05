import * as THREE from 'three';

export interface JoystickState {
  active: boolean;
  identifier: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  vector: THREE.Vector2;
}

export class InputController {
  private keys: Record<string, boolean> = {};
  private joystick: JoystickState = {
    active: false,
    identifier: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    vector: new THREE.Vector2(0, 0),
  };
  private maxRadius = 45;
  private container: HTMLElement | null = null;
  private joystickBaseEl: HTMLElement | null = null;
  private joystickKnobEl: HTMLElement | null = null;
  private isMouseDown: boolean = false;
  private mouseIdentifier: number = -999;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
    }
  }

  public attach(container: HTMLElement): void {
    this.container = container;
    this.container.style.touchAction = 'none';
    this.createJoystickDom();

    if (typeof window !== 'undefined') {
      window.addEventListener('touchstart', this.onTouchStart, { passive: false });
      window.addEventListener('touchmove', this.onTouchMove, { passive: false });
      window.addEventListener('touchend', this.onTouchEnd, { passive: false });
      window.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
      window.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
    }
  }

  private createJoystickDom(): void {
    if (!this.container || typeof document === 'undefined') return;

    const base = document.createElement('div');
    base.className = 'arcade-joystick-base';
    base.style.position = 'absolute';
    base.style.width = '90px';
    base.style.height = '90px';
    base.style.borderRadius = '50%';
    base.style.background = 'rgba(255, 255, 255, 0.2)';
    base.style.border = '2px solid rgba(255, 255, 255, 0.5)';
    base.style.display = 'none';
    base.style.pointerEvents = 'none';
    base.style.transform = 'translate(-50%, -50%)';
    base.style.zIndex = '100';

    const knob = document.createElement('div');
    knob.className = 'arcade-joystick-knob';
    knob.style.position = 'absolute';
    knob.style.width = '40px';
    knob.style.height = '40px';
    knob.style.borderRadius = '50%';
    knob.style.background = '#00E676';
    knob.style.boxShadow = '0 0 10px rgba(0, 230, 118, 0.8)';
    knob.style.left = '50%';
    knob.style.top = '50%';
    knob.style.transform = 'translate(-50%, -50%)';

    base.appendChild(knob);
    this.container.appendChild(base);
    this.joystickBaseEl = base;
    this.joystickKnobEl = knob;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  public setKey(code: string, pressed: boolean): void {
    this.keys[code] = pressed;
  }

  public handleTouchStart(id: number, x: number, y: number): void {
    if (this.joystick.active) return;
    this.joystick.active = true;
    this.joystick.identifier = id;
    this.joystick.startX = x;
    this.joystick.startY = y;
    this.joystick.currentX = x;
    this.joystick.currentY = y;
    this.joystick.vector.set(0, 0);

    if (this.joystickBaseEl) {
      this.joystickBaseEl.style.display = 'block';
      this.joystickBaseEl.style.left = `${x}px`;
      this.joystickBaseEl.style.top = `${y}px`;
      if (this.joystickKnobEl) {
        this.joystickKnobEl.style.transform = 'translate(-50%, -50%)';
      }
    }
  }

  public handleTouchMove(id: number, x: number, y: number): void {
    if (!this.joystick.active || this.joystick.identifier !== id) return;
    this.joystick.currentX = x;
    this.joystick.currentY = y;

    const dx = x - this.joystick.startX;
    const dy = y - this.joystick.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const clampedDist = Math.min(dist, this.maxRadius);
      const norm = clampedDist / this.maxRadius;
      this.joystick.vector.set((dx / dist) * norm, (dy / dist) * norm);

      if (this.joystickKnobEl) {
        const knobX = (dx / dist) * clampedDist;
        const knobY = (dy / dist) * clampedDist;
        this.joystickKnobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
      }
    } else {
      this.joystick.vector.set(0, 0);
    }
  }

  public handleTouchEnd(id: number): void {
    if (this.joystick.active && this.joystick.identifier === id) {
      this.joystick.active = false;
      this.joystick.identifier = null;
      this.joystick.vector.set(0, 0);

      if (this.joystickBaseEl) {
        this.joystickBaseEl.style.display = 'none';
      }
    }
  }

  private isIgnoredTarget(e: Event): boolean {
    const target = e.target as Element | null;
    return !!target?.closest?.('button, .arcade-dialogue-card');
  }

  private onTouchStart = (e: TouchEvent): void => {
    if (this.isIgnoredTarget(e)) return;
    if (e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      this.handleTouchStart(t.identifier, t.clientX, t.clientY);
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (this.isIgnoredTarget(e)) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.joystick.identifier) {
        this.handleTouchMove(t.identifier, t.clientX, t.clientY);
        if (e.cancelable) {
          e.preventDefault();
        }
        break;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.joystick.identifier) {
        this.handleTouchEnd(t.identifier);
        if (e.cancelable) {
          e.preventDefault();
        }
        break;
      }
    }
  };

  public handleMouseDown(x: number, y: number): void {
    this.isMouseDown = true;
    this.handleTouchStart(this.mouseIdentifier, x, y);
  }

  public handleMouseMove(x: number, y: number): void {
    if (!this.isMouseDown) return;
    this.handleTouchMove(this.mouseIdentifier, x, y);
  }

  public handleMouseUp(): void {
    if (this.isMouseDown) {
      this.isMouseDown = false;
      this.handleTouchEnd(this.mouseIdentifier);
    }
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    if (this.isIgnoredTarget(e)) return;
    this.handleMouseDown(e.clientX, e.clientY);
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.handleMouseMove(e.clientX, e.clientY);
  };

  private onMouseUp = (_e: MouseEvent): void => {
    this.handleMouseUp();
  };

  public getDirection(): THREE.Vector2 {
    let x = 0;
    let y = 0;

    // Keyboard
    if (this.keys['KeyW'] || this.keys['ArrowUp']) y -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) y += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;

    const keyboardVec = new THREE.Vector2(x, y);
    if (keyboardVec.lengthSq() > 0) {
      keyboardVec.normalize();
      return keyboardVec;
    }

    if (this.joystick.active && this.joystick.vector.lengthSq() > 0.01) {
      return this.joystick.vector.clone();
    }

    return new THREE.Vector2(0, 0);
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('touchstart', this.onTouchStart);
      window.removeEventListener('touchmove', this.onTouchMove);
      window.removeEventListener('touchend', this.onTouchEnd);
      window.removeEventListener('touchcancel', this.onTouchEnd);
      window.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.onMouseUp);
    }
  }
}
