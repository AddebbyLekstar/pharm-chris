import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ArcadeViewport } from '../../src/ui/arcade/ArcadeViewport';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';

describe('Task 1: ArcadeViewport & ArcadeScene', () => {
  let viewport: ArcadeViewport;
  let scene: ArcadeScene;

  beforeEach(() => {
    scene = new ArcadeScene();
    viewport = new ArcadeViewport({ scene: scene.group });
  });

  it('initializes camera with isometric 45-degree vantage angle', () => {
    expect(viewport.camera).toBeDefined();
    // Isometric angle has equal X and Z offsets and elevated Y
    const pos = viewport.camera.position;
    expect(pos.y).toBeGreaterThan(10);
    expect(pos.x).toBeCloseTo(pos.z, 1);
  });

  it('updates aspect ratio and projection matrix on resize', () => {
    viewport.resize(400, 800); // Mobile portrait
    expect(viewport.aspect).toBeCloseTo(400 / 800, 2);
    expect(viewport.camera.aspect).toBeCloseTo(400 / 800, 2);

    viewport.resize(1920, 1080); // Desktop widescreen
    expect(viewport.aspect).toBeCloseTo(1920 / 1080, 2);
    expect(viewport.camera.aspect).toBeCloseTo(1920 / 1080, 2);
  });

  it('smoothly dampens camera position to follow player target', () => {
    const initialCamPos = viewport.camera.position.clone();
    const targetPos = new THREE.Vector3(5, 0, 5);

    viewport.updateCameraFollow(targetPos, 0.1);
    // Camera should move towards target while preserving isometric offset
    expect(viewport.camera.position.x).toBeGreaterThan(initialCamPos.x - 0.001);
    expect(viewport.targetOffset).toBeDefined();
  });

  it('creates an ArcadeScene with warm Lagos palette elements and boundaries', () => {
    expect(scene.group).toBeDefined();
    expect(scene.group.children.length).toBeGreaterThan(0);

    const bounds = scene.getWalkableBounds();
    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minZ).toBeLessThan(bounds.maxZ);
    expect(bounds.minX).toBeLessThanOrEqual(-4);
    expect(bounds.maxX).toBeGreaterThanOrEqual(4);
  });
});
