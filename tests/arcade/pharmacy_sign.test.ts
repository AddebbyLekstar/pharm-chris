import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';
import { WALL_HEIGHT } from '../../src/ui/arcade/kit/roomShell';
import { ROOM } from '../../src/ui/arcade/layout';

/**
 * The pharmacy sign is the only object in the room that tells a first-time viewer
 * what the shop sells. These tests pin the three ways it previously failed:
 * mounted above the wall top, green-on-green with nothing to separate it from the
 * wall behind, and orphaned from the wall when an expansion moved that wall.
 */
describe('pharmacy sign', () => {
  const scene = new ArcadeScene();
  const cross = scene.group.getObjectByName('pharm-cross') as THREE.Mesh | undefined;
  const plate = scene.group.getObjectByName('pharm-cross-plate') as THREE.Mesh | undefined;

  it('exists as a cross on a backing plate', () => {
    expect(cross).toBeInstanceOf(THREE.Mesh);
    expect(plate).toBeInstanceOf(THREE.Mesh);
  });

  it('sits entirely on the wall face, not poking over the top of it', () => {
    expect(cross).toBeDefined();
    cross!.updateWorldMatrix(true, false);
    const crossBox = new THREE.Box3().setFromObject(cross!);
    expect(crossBox.max.y).toBeLessThanOrEqual(WALL_HEIGHT - 0.02);
    expect(crossBox.min.y).toBeGreaterThan(1.2);
    // The plate is the taller object, so it is the one that decides whether the sign
    // clips the trim above it — the first version of this fix checked only the cross
    // and shipped a plate 1 cm over the wall top.
    plate!.updateWorldMatrix(true, false);
    const plateBox = new THREE.Box3().setFromObject(plate!);
    expect(plateBox.max.y).toBeLessThanOrEqual(WALL_HEIGHT - 0.04);
  });

  it('is mounted on the back wall, proud of it, with the cross in front of the plate', () => {
    expect(cross!.position.z).toBeGreaterThan(ROOM.minZ);
    expect(cross!.position.z - ROOM.minZ).toBeLessThan(0.2);
    expect(cross!.position.z).toBeGreaterThan(plate!.position.z);
  });

  it('backlights both faces so the sign separates from a dark green wall', () => {
    const crossMat = cross!.material as THREE.MeshStandardMaterial;
    const plateMat = plate!.material as THREE.MeshStandardMaterial;
    expect(crossMat.emissiveIntensity).toBeGreaterThanOrEqual(0.4);
    expect(plateMat.emissiveIntensity).toBeGreaterThanOrEqual(0.2);
    // The plate must be light: the whole point is contrast against the wall.
    const plateLum = plateMat.color.r * 0.2126 + plateMat.color.g * 0.7152 + plateMat.color.b * 0.0722;
    expect(plateLum).toBeGreaterThan(0.7);
  });
});
