import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DOCK_MARKINGS } from '../layout';
import { material, PALETTE } from './materials';
import { textures } from '../textures';

/**
 * Painted delivery-dock floor signage.
 *
 * The dock trigger already had a pulsing ring, but a ring is a "something is
 * here" cue, not an instruction: new players walked past it because nothing
 * connected the back wall to "pick up a crate". This paints the instruction on
 * the floor the way a real loading bay does — a dashed approach lane with
 * chevrons driving north into the dock, a bracket-cornered drop pad around the
 * trigger, and a stencilled CRATE inside it.
 *
 * Budget discipline:
 *   - All paint is one merged geometry on the shared paper family, so the whole
 *     lane, pad and corner ticks cost one draw call, not ~30 quads.
 *   - The word is a separate 512 x 160 alpha sheet (0.44 MB with mips) on its
 *     own material: two meshes total. The large 512 px signage atlas is not
 *     touched, and no per-letter meshes exist.
 *   - Paint sits 4 mm above the floor and the stencil 7 mm, so neither can
 *     z-fight the terrazzo or each other.
 */

const PAINT_Y = 0.004;
const STENCIL_Y = 0.007;

/**
 * One flat paint stroke in the XZ plane. Building quads by hand (rather than
 * rotating PlaneGeometries one by one) keeps the winding uniform and the merged
 * geometry free of stray transforms.
 */
function stroke(ax: number, az: number, bx: number, bz: number, width: number, y: number): THREE.BufferGeometry {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * (width / 2);
  const nz = (dx / len) * (width / 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [ax + nx, y, az + nz, ax - nx, y, az - nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz],
      3
    )
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0], 2));
  // Counter-clockwise seen from +Y, so FrontSide faces the camera above.
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  return geometry;
}

function paintGeometry(): THREE.BufferGeometry {
  const m = DOCK_MARKINGS;
  const parts: THREE.BufferGeometry[] = [];
  const line = (ax: number, az: number, bx: number, bz: number, width: number): void => {
    parts.push(stroke(ax, az, bx, bz, width, PAINT_Y));
  };

  // --- Approach lane: two dashed rails running from open floor to the pad ----
  const step = m.laneDash + m.laneGap;
  for (const x of [-m.laneHalfWidth, m.laneHalfWidth]) {
    for (let z = m.laneStartZ; z > m.laneEndZ; z -= step) {
      const z2 = Math.max(z - m.laneDash, m.laneEndZ);
      if (z - z2 < 0.05) break;
      line(x, z, x, z2, m.laneLineWidth);
    }
  }

  // --- Three chevrons pointing north (-Z), into the dock ---------------------
  for (const apexZ of m.chevronZs) {
    for (const side of [-1, 1]) {
      // Arm runs from the outer trailing corner forward to the apex.
      line(side * m.chevronHalfWidth, apexZ + m.chevronDepth, 0, apexZ, m.chevronStroke);
    }
    // Butt joins leave a notch at the point; a short bar closes it.
    line(-m.chevronStroke * 0.45, apexZ + 0.03, m.chevronStroke * 0.45, apexZ + 0.03, m.chevronStroke);
  }

  // --- Drop-pad outline ------------------------------------------------------
  const pad = m.pad;
  line(pad.minX, pad.minZ, pad.maxX, pad.minZ, m.outline);
  line(pad.minX, pad.maxZ, pad.maxX, pad.maxZ, m.outline);
  line(pad.minX, pad.minZ, pad.minX, pad.maxZ, m.outline);
  line(pad.maxX, pad.minZ, pad.maxX, pad.maxZ, m.outline);

  // Corner brackets: a heavier L at each corner reads as a laid-out bay even
  // when the thin outline is 2 px on a phone.
  for (const x of [pad.minX, pad.maxX]) {
    for (const z of [pad.minZ, pad.maxZ]) {
      const sx = x === pad.minX ? 1 : -1;
      const sz = z === pad.minZ ? 1 : -1;
      line(x, z, x + sx * m.cornerTick, z, m.cornerTickWidth);
      line(x, z, x, z + sz * m.cornerTick, m.cornerTickWidth);
    }
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('dock markings failed to merge');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function buildDockMarkings(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'dock-markings';

  // Paint is a matte paper-family surface, the same grammar as the posters and
  // price cards: screen-printed flat colour, not glossy vinyl. Ink navy, not the
  // brand green: on the pale terrazzo the near-black reads at 60 px where green
  // dissolved into the tile.
  const paint = new THREE.Mesh(paintGeometry(), material('paper', PALETTE.inkNavy));
  paint.name = 'dock-markings-paint';
  paint.receiveShadow = true;
  group.add(paint);

  const stencilMap = textures()?.dockStencil ?? null;
  const stencil = new THREE.Mesh(
    (() => {
      const geometry = new THREE.PlaneGeometry(DOCK_MARKINGS.stencil.width, DOCK_MARKINGS.stencil.height);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, STENCIL_Y, DOCK_MARKINGS.stencil.z);
      return geometry;
    })(),
    new THREE.MeshStandardMaterial({
      map: stencilMap,
      // The sheet is a white alpha mask, so the material colour is the paint.
      // Without a DOM (vitest) the sheet does not exist; the same solid ink keeps
      // the footprint measurable instead of silently dropping the word.
      color: PALETTE.inkNavy,
      transparent: stencilMap !== null,
      alphaTest: stencilMap ? 0.35 : 0,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0,
    })
  );
  stencil.name = 'dock-markings-stencil';
  stencil.material.name = 'dock-stencil-paper';
  stencil.receiveShadow = true;
  stencil.renderOrder = 1;
  group.add(stencil);

  return group;
}

/** Mesh count, matching the draw-call convention used by dressingDrawCalls(). */
export function dockMarkingDrawCalls(group: THREE.Group): number {
  let count = 0;
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count++;
  });
  return count;
}
