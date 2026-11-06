import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { FirstPersonPlayer } from '../../src/ui/three/FirstPersonPlayer';
import { FirstPersonApp } from '../../src/ui/three/FirstPersonApp';

describe('FirstPerson Mode Mobile Touch Controls', () => {
  let container: HTMLDivElement;
  let camera: THREE.PerspectiveCamera;
  let player: FirstPersonPlayer;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
    player = new FirstPersonPlayer(camera, container);
  });

  afterEach(() => {
    player.dispose();
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

  it('should initialize FirstPersonApp with mobile touch DOM layers', () => {
    const app = new FirstPersonApp(container);
    expect(app).toBeDefined();
    expect(container.querySelector('#fps-mobile-touch-layer')).not.toBeNull();
    expect(container.querySelector('#fps-touch-zone-move')).not.toBeNull();
    expect(container.querySelector('#fps-touch-zone-look')).not.toBeNull();
    expect(container.querySelector('#btn-touch-interact')).not.toBeNull();
    expect(container.querySelector('#btn-touch-inspect')).not.toBeNull();
    expect(container.querySelector('#btn-touch-drop')).not.toBeNull();
    expect(container.querySelector('#btn-touch-ledger')).not.toBeNull();
    expect(container.querySelector('#fps-drawer-quickbar')).not.toBeNull();
    app.dispose();
  });

  it('should handle cash register quickbar denomination clicks for change tender', () => {
    const app = new FirstPersonApp(container);
    app.isMobile = true;
    
    // Open drawer and set change due
    (app as any).changeDue = 800;
    app.store.cashRegister.openDrawer();
    (app as any).updateDrawerQuickbar();

    const quickbar = container.querySelector('#fps-drawer-quickbar') as HTMLElement;
    expect(quickbar.style.display).toBe('flex');

    // Tender ₦500 note
    app.tenderChangeDenom(500);
    expect(app.store.cashRegister.changeGiven).toBe(500);

    // Tender ₦200 note + ₦100 note = ₦800 exact change
    app.tenderChangeDenom(200);
    app.tenderChangeDenom(100);
    expect(app.store.cashRegister.changeGiven).toBe(800);

    app.dispose();
  });
});
