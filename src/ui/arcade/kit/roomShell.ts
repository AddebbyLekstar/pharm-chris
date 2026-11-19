import * as THREE from 'three';
import { ROOM, SHOP_W, SHOP_D, WALL_T } from '../layout';
import { chamferBox } from './geometry';
import { material, PALETTE } from './materials';

/**
 * The dollhouse shell.
 *
 * Three things make a room read as a place rather than a box, and all three are
 * structural rather than decorative: real wall thickness with a visible cut face,
 * a doorway you can see through to the street, and a floor that is a slab instead
 * of a hairline plane. Sims Mobile gets its scale from exactly this — the wall is
 * as thick as a hand, so everything next to it looks correctly sized.
 */
export const WALL_HEIGHT = 2.8;
export const DOOR_WIDTH = 2.2;
export const DOOR_HEIGHT = 2.2;

export interface RoomShellOptions {
  /** Wall height in metres. Lowered for the close-up camera, if ever needed. */
  height?: number;
}

function wall(
  name: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color?: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(chamferBox(w, h, d, 0.03), material('plaster', color));
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildRoomShell(options: RoomShellOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = 'room-shell';
  const H = options.height ?? WALL_HEIGHT;

  // --- Floor -------------------------------------------------------------
  // Named 'pharm-floor' because the v3 surface pass attaches the terrazzo maps
  // to that name; the shell owns the only floor in the scene.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SHOP_W, SHOP_D), material('tile'));
  floor.name = 'pharm-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  group.add(floor);

  // --- Walls: centred on the outer half of the wall thickness, so the interior
  // face lands exactly on ROOM's bounds.
  const outerZ = ROOM.minZ - WALL_T / 2;
  const outerZFront = ROOM.maxZ + WALL_T / 2;
  const outerX = ROOM.minX - WALL_T / 2;
  const outerXEast = ROOM.maxX + WALL_T / 2;

  group.add(wall('pharm-wall-back', SHOP_W, H, WALL_T, 0, H / 2, outerZ));
  group.add(wall('pharm-wall-west', WALL_T, H, SHOP_D + WALL_T * 2, outerX, H / 2, 0));
  group.add(wall('pharm-wall-east', WALL_T, H, SHOP_D + WALL_T * 2, outerXEast, H / 2, 0));

  // Front wall, split around a 2.2 m doorway that sits dead centre.
  const segmentWidth = (SHOP_W - DOOR_WIDTH) / 2;
  const segmentX = DOOR_WIDTH / 2 + segmentWidth / 2;
  group.add(wall('pharm-wall-front-l', segmentWidth, H, WALL_T, -segmentX, H / 2, outerZFront));
  group.add(wall('pharm-wall-front-r', segmentWidth, H, WALL_T, segmentX, H / 2, outerZFront));
  // Header over the opening: without it the front wall is two pillars and a hole.
  group.add(
    wall('pharm-wall-front-header', DOOR_WIDTH, H - DOOR_HEIGHT, WALL_T, 0, DOOR_HEIGHT + (H - DOOR_HEIGHT) / 2, outerZFront)
  );

  // --- Cut face ----------------------------------------------------------
  // A 12 cm terracotta cap on the top of the three cut walls. This is the single
  // strongest dollhouse cue: you are looking at a section through a building.
  const capY = H + 0.06;
  const capDepth = WALL_T;
  const cap = (name: string, w: number, d: number, x: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(chamferBox(w, 0.12, d, 0.025), material('wood', PALETTE.terracotta));
    mesh.name = name;
    mesh.position.set(x, capY, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  group.add(cap('shell-cut-trim-back', SHOP_W + WALL_T * 2, capDepth, 0, outerZ));
  group.add(cap('shell-cut-trim-west', WALL_T, SHOP_D + WALL_T * 2, outerX, 0));
  group.add(cap('shell-cut-trim-east', WALL_T, SHOP_D + WALL_T * 2, outerXEast, 0));

  // --- Skirting ----------------------------------------------------------
  // 10 cm band inside the walls, the line that stops the floor and the wall
  // meeting in a zero-thickness seam.
  const skirt = (name: string, w: number, d: number, x: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(chamferBox(w, 0.1, d, 0.02), material('wood', PALETTE.terracotta));
    mesh.name = name;
    mesh.position.set(x, 0.05, z);
    mesh.receiveShadow = true;
    return mesh;
  };
  const inset = 0.05;
  group.add(skirt('shell-skirt-back', SHOP_W - inset * 2, 0.08, 0, ROOM.minZ + inset));
  group.add(skirt('shell-skirt-west', 0.08, SHOP_D - inset * 2, ROOM.minX + inset, 0));
  group.add(skirt('shell-skirt-east', 0.08, SHOP_D - inset * 2, ROOM.maxX - inset, 0));

  return group;
}
