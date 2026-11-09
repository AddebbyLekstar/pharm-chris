import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { FirstPersonPlayer } from '../../src/ui/three/FirstPersonPlayer';
import { CashRegister3D } from '../../src/ui/three/CashRegister3D';

function setupMockDom() {
  const mockDoc: any = {
    createElement: (tag: string) => {
      const el: any = {
        tagName: tag.toUpperCase(),
        style: {},
        classList: { add: () => {}, remove: () => {} },
        children: [],
        appendChild: (child: any) => { el.children.push(child); child.parentNode = el; return child; },
        removeChild: (child: any) => { child.parentNode = null; return child; },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        ownerDocument: null,
        requestPointerLock: () => {},
        getContext: () => ({
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          fillRect: () => {},
          strokeRect: () => {},
          font: '',
          fillText: () => {},
          measureText: () => ({ width: 50 }),
        }),
      };
      el.ownerDocument = mockDoc;
      return el;
    },
    body: null as any,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  mockDoc.body = mockDoc.createElement('body');
  (globalThis as any).document = mockDoc;
  (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {}, innerWidth: 1280, innerHeight: 720, document: mockDoc };
}

describe('FirstPerson Mode Mobile Touch Controls', () => {
  let container: any;
  let player: FirstPersonPlayer;

  beforeEach(() => {
    setupMockDom();
    container = document.createElement('div');
    document.body.appendChild(container);
    player = new FirstPersonPlayer(container);
  });

  afterEach(() => {
    player.controls.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should initialize with touch mode enabled when set', () => {
    player.isTouchMode = true;
    expect(player.isTouchMode).toBe(true);
    expect(player.touchMoveVector.x).toBe(0);
    expect(player.touchMoveVector.y).toBe(0);
  });

  it('should translate virtual touch vector to player movement without desktop pointer lock', () => {
    player.isTouchMode = true;
    player.isLocked = false;
    const initialZ = player.camera.position.z;

    // Move forward with touch joystick (push stick up / negative Y)
    player.setTouchMove(0, -1);
    player.update(0.1, []);

    // Verify player moved forward along negative Z in room
    expect(player.camera.position.z).toBeLessThan(initialZ);
  });

  it('should rotate view pitch and yaw with touch drag', () => {
    const initialQuat = player.camera.quaternion.clone();

    // Rotate right by 50px delta
    player.rotateView(50, 0);
    expect(player.camera.quaternion.equals(initialQuat)).toBe(false);

    // Rotate pitch down by 30px delta
    const rotatedQuat = player.camera.quaternion.clone();
    player.rotateView(0, 30);
    expect(player.camera.quaternion.equals(rotatedQuat)).toBe(false);
  });

  it('should handle cash register quick tender for cash change transactions', () => {
    const register = new CashRegister3D();
    expect(register).toBeDefined();
    
    register.openDrawer();
    register.setChangeRequired(800);
    expect(register.isDrawerOpen).toBe(true);
    expect(register.tenderedChange).toBe(0);

    register.addChange(500);
    expect(register.tenderedChange).toBe(500);

    register.addChange(200);
    register.addChange(100);
    expect(register.tenderedChange).toBe(800);

    register.resetChange();
    expect(register.tenderedChange).toBe(0);
  });
});
