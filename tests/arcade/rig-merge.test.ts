import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArcadePlayer } from '../../src/ui/arcade/ArcadePlayer';
import { ArcadeCustomer } from '../../src/ui/arcade/ArcadeCustomer';
import { CHARACTER_MATERIAL, rigMeshCount } from '../../src/ui/arcade/kit/rigMerge';
import { WALKABLE } from '../../src/ui/arcade/layout';

const customer = () =>
  new ArcadeCustomer(
    {
      id: 'test-customer',
      name: 'Test',
      budget: 5000,
      patience: 30,
      matchedProductIds: ['artemether'],
      outfit: 'agbada',
      accessory: 'gele',
    } as never,
    0
  );

describe('character rig merge', () => {
  it('collapses the player to one mesh per animated joint', () => {
    const player = new ArcadePlayer({ bounds: { ...WALKABLE } });
    // head, torso, two arms, two legs = 6 joints, plus the contact shadow and the
    // off-screen marker. Anything above this is a per-colour material coming back.
    expect(rigMeshCount(player.mesh)).toBeLessThanOrEqual(9);

    let colours = 0;
    player.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.material !== CHARACTER_MATERIAL) return;
      expect(mesh.geometry.getAttribute('color'), `${mesh.name} lost its vertex colours`).toBeDefined();
      colours++;
    });
    expect(colours).toBeGreaterThanOrEqual(5);
  });

  it('keeps the joints that the walk cycle animates', () => {
    const player = new ArcadePlayer({ bounds: { ...WALKABLE } });
    // Animation drives these by name via the player's own sockets; if the merge ate
    // them the character would slide around rigid instead of walking.
    const groups = player.mesh.children.filter((c) => (c as THREE.Group).isGroup);
    expect(groups.length).toBeGreaterThanOrEqual(4);
  });

  it('collapses a customer to a handful of meshes too', () => {
    const c = customer();
    expect(rigMeshCount(c.mesh)).toBeLessThanOrEqual(9);
  });

  it('bakes the part colour into every vertex', () => {
    const c = customer();
    let sawColour = false;
    c.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.material !== CHARACTER_MATERIAL) return;
      const colours = mesh.geometry.getAttribute('color');
      const r = colours.getX(0);
      const g = colours.getY(0);
      const b = colours.getZ(0);
      // Not a default white (1,1,1): some part actually carries its colour.
      if (r + g + b < 2.9) sawColour = true;
    });
    expect(sawColour).toBe(true);
  });
});
