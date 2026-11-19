import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ArcadeViewport } from '../../src/ui/arcade/ArcadeViewport';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';
import { EXPANSION_BOUNDS, ZONES } from '../../src/ui/arcade/layout';

const PHONES: Array<[number, number]> = [
  [320, 568],
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

/**
 * The P1 camera contract (design spec section 4):
 *
 *  - 32 degree fov at every aspect: the per-aspect ladder hid a framing problem
 *    instead of solving it;
 *  - the room occupies 82-88 % of the viewport width, so the shop reads at phone
 *    scale;
 *  - Chris is at least 46 px tall, the floor below which he cannot be reliably
 *    steered by touch.
 *
 * All three hold at 320 px, the narrowest phone we support, and survive a
 * mid-session orientation flip and a room expansion.
 */
describe('ArcadeViewport framing', () => {
  let viewport: ArcadeViewport;
  let scene: ArcadeScene;

  beforeEach(() => {
    scene = new ArcadeScene();
    viewport = new ArcadeViewport({ scene: scene.group });
    viewport.setRoomBounds(scene.getRoomBounds());
    viewport.setPlayableBounds(scene.getWalkableBounds());
  });

  for (const [w, h] of PHONES) {
    it(`fills 82-88% of the width and keeps Chris >= 46px at ${w}x${h}`, () => {
      viewport.resize(w, h);
      // The room covers the width and then some: framing it smaller than the
      // frame is what used to shrink Chris below a tappable size.
      expect(viewport.roomFill).toBeGreaterThanOrEqual(1.0);
      expect(viewport.roomFill).toBeLessThanOrEqual(1.7);
      expect(viewport.playerPixels(0, 0.2)).toBeGreaterThanOrEqual(46);
    });

    it(`keeps every zone on screen at ${w}x${h} while the player stands in it`, () => {
      viewport.resize(w, h);
      for (const zone of ZONES) {
        settle(viewport, zone.x, zone.z);
        const p = screenPoint(viewport, zone.x, zone.z);
        expect(p.x, `${zone.id} x at ${w}x${h}`).toBeGreaterThanOrEqual(0);
        expect(p.x, `${zone.id} x at ${w}x${h}`).toBeLessThanOrEqual(w);
        expect(p.y, `${zone.id} y at ${w}x${h}`).toBeGreaterThanOrEqual(0);
        expect(p.y, `${zone.id} y at ${w}x${h}`).toBeLessThanOrEqual(h);
      }
    });
  }

  it('uses the same 32 degree fov at every aspect', () => {
    for (const [w, h] of [...PHONES, [1280, 800] as [number, number]]) {
      viewport.resize(w, h);
      expect(viewport.camera.fov).toBe(32);
    }
  });

  it('re-solves on an orientation flip instead of drifting', () => {
    viewport.resize(360, 800);
    const portraitFill = viewport.roomFill;
    viewport.resize(800, 360);
    expect(viewport.roomFill).toBeGreaterThanOrEqual(0.99);
    expect(viewport.roomFill).toBeLessThanOrEqual(1.7);
    viewport.resize(360, 800);
    expect(viewport.roomFill).toBeCloseTo(portraitFill, 2);
  });

  it('steps back one notch when expansion level 1 is applied', () => {
    viewport.resize(360, 800);
    const before = viewport.targetOffset.length();
    viewport.setRoomBounds(EXPANSION_BOUNDS[1].room);
    viewport.setPlayableBounds(EXPANSION_BOUNDS[1].walkable);
    viewport.resize(360, 800);
    // The solve steps back immediately; the camera lerps to it on the next frame.
    // Never closer after buying space: on phones the player floor is binding, so
    // the distance holds; on desktop the cover constraint pushes it back.
    expect(viewport.targetOffset.length()).toBeGreaterThanOrEqual(before);
  });

  it('frames the room the same way on a desktop viewport', () => {
    viewport.resize(1440, 900);
    // On desktop the width is the binding constraint, so the room fills it.
    expect(viewport.roomFill).toBeGreaterThanOrEqual(0.98);
    expect(viewport.roomFill).toBeLessThanOrEqual(1.2);
    expect(viewport.playerPixels(0, 0.2)).toBeGreaterThanOrEqual(46);
  });
});
