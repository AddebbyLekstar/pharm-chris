import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { InputController } from '../../src/ui/arcade/InputController';
import { ArcadePlayer } from '../../src/ui/arcade/ArcadePlayer';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';

describe('Task 2: InputController & ArcadePlayer', () => {
  let input: InputController;
  let player: ArcadePlayer;
  let scene: ArcadeScene;

  beforeEach(() => {
    input = new InputController();
    scene = new ArcadeScene();
    player = new ArcadePlayer({ bounds: scene.getWalkableBounds() });
  });

  it('normalizes keyboard directional inputs', () => {
    // Simulate pressing W and D
    input.setKey('KeyW', true);
    input.setKey('KeyD', true);

    const dir = input.getDirection();
    expect(dir.length()).toBeCloseTo(1.0, 3);
    expect(dir.x).toBeGreaterThan(0);
    expect(dir.y).toBeLessThan(0); // Up in 2D corresponds to negative Z in 3D
  });

  it('handles virtual joystick touch vectors', () => {
    // Simulate touch joystick drag: start at (100, 100), drag to (150, 100)
    input.handleTouchStart(1, 100, 100);
    input.handleTouchMove(1, 150, 100);

    const dir = input.getDirection();
    expect(dir.x).toBeCloseTo(1.0, 2);
    expect(dir.y).toBeCloseTo(0, 2);

    input.handleTouchEnd(1);
    expect(input.getDirection().length()).toBe(0);
  });

  it('handles desktop mouse drag steering', () => {
    input.handleMouseDown(200, 200);
    input.handleMouseMove(250, 200);

    const dir = input.getDirection();
    expect(dir.x).toBeCloseTo(1.0, 2);
    expect(dir.y).toBeCloseTo(0, 2);

    input.handleMouseUp();
    expect(input.getDirection().length()).toBe(0);
  });

  it('updates player position and rotates towards movement direction', () => {
    const initialPos = player.position.clone();
    player.move(new THREE.Vector2(1, 0), 0.1); // Move right for 0.1s

    expect(player.position.x).toBeGreaterThan(initialPos.x);
    expect(player.mesh.rotation.y).toBeDefined();
  });

  it('clamps player within walkable bounds', () => {
    // Move far beyond east boundary
    for (let i = 0; i < 50; i++) {
      player.move(new THREE.Vector2(1, 0), 0.5);
    }
    const bounds = scene.getWalkableBounds();
    expect(player.position.x).toBeLessThanOrEqual(bounds.maxX);

    // Move far beyond north boundary
    for (let i = 0; i < 50; i++) {
      player.move(new THREE.Vector2(0, -1), 0.5);
    }
    expect(player.position.z).toBeGreaterThanOrEqual(bounds.minZ);
  });

  it('exposes stacking socket group attached to player', () => {
    expect(player.stackSocket).toBeDefined();
    expect(player.stackSocket.parent).toBe(player.mesh);
  });
});
