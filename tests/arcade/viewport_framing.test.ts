import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ArcadeViewport } from '../../src/ui/arcade/ArcadeViewport';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';

/** Every place the player must be able to see: the six trigger zones. */
const ZONES: Array<[string, number, number]> = [
  ['dock', 0, -6.5],
  ['shelf_antimalarial', -4.5, -4.5],
  ['shelf_analgesic', -4.5, 0.5],
  ['shelf_antibiotic', 4.5, -4.5],
  ['shelf_cold_chain', 4.5, 0.5],
  ['counter_cashier', 0, 0.2],
];

const PHONES: Array<[number, number]> = [
  [320, 640],
  [360, 800],
  [390, 844],
  [414, 896],
];

function settle(viewport: ArcadeViewport, x: number, z: number): void {
  const p = new THREE.Vector3(x, 0, z);
  for (let i = 0; i < 80; i++) viewport.updateCameraFollow(p, 0.1);
  viewport.camera.updateMatrixWorld(true);
}

function screenPoint(viewport: ArcadeViewport, x: number, z: number): { x: number; y: number } {
  const p = new THREE.Vector3(x, 0, z).project(viewport.camera);
  return { x: ((p.x + 1) / 2) * viewport.viewportWidth, y: ((1 - p.y) / 2) * viewport.viewportHeight };
}

function playerPixels(viewport: ArcadeViewport, x: number, z: number): number {
  const feet = new THREE.Vector3(x, 0, z).project(viewport.camera);
  const head = new THREE.Vector3(x, 1.75, z).project(viewport.camera);
  return Math.abs(((head.y - feet.y) / 2) * viewport.viewportHeight);
}

describe('ArcadeViewport framing', () => {
  let viewport: ArcadeViewport;
  let scene: ArcadeScene;

  beforeEach(() => {
    scene = new ArcadeScene();
    viewport = new ArcadeViewport({ scene: scene.group });
    viewport.setRoomBounds(scene.getRoomBounds());
    viewport.setPlayableBounds(scene.getWalkableBounds());
  });

  // The old camera centred on the player with a fixed zoom, which pushed the
  // antibiotic shelf 37px past the right edge of a 360px screen.
  for (const [w, h] of PHONES) {
    it(`keeps every zone visible at ${w}x${h} while the player stands in it`, () => {
      viewport.resize(w, h);
      expect(viewport.contained).toBe(false);
      for (const [id, x, z] of ZONES) {
        settle(viewport, x, z);
        const p = screenPoint(viewport, x, z);
        expect(p.x, `${id} x at ${w}x${h}`).toBeGreaterThanOrEqual(0);
        expect(p.x, `${id} x at ${w}x${h}`).toBeLessThanOrEqual(w);
        expect(p.y, `${id} y at ${w}x${h}`).toBeGreaterThanOrEqual(0);
        expect(p.y, `${id} y at ${w}x${h}`).toBeLessThanOrEqual(h);
      }
    });

    it(`keeps the player big enough to control at ${w}x${h}`, () => {
      viewport.resize(w, h);
      settle(viewport, 0, 0.2);
      expect(playerPixels(viewport, 0, 0.2)).toBeGreaterThanOrEqual(38);
    });
  }

  it('frames the whole room and trails the player on a desktop viewport', () => {
    viewport.resize(1920, 1080);
    expect(viewport.contained).toBe(true);
    expect(viewport.panLimit.x).toBeGreaterThan(1);
    expect(viewport.panLimit.y).toBeGreaterThan(1);
  });

  it('never pulls the camera closer than the base offset', () => {
    viewport.resize(2560, 1080);
    expect(viewport.targetOffset.length()).toBeGreaterThanOrEqual(23);
  });

  it('re-solves the framing when the viewport changes', () => {
    viewport.resize(1920, 1080);
    expect(viewport.contained).toBe(true);
    viewport.resize(360, 800);
    expect(viewport.contained).toBe(false);
  });
});
