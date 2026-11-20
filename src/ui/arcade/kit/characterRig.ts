import * as THREE from 'three';
import type { CharacterLook } from './look';

/**
 * One rig, a cast.
 *
 * The customer rig used to be built inline in `ArcadeCustomer`: a torso box, four
 * limb boxes, a head box, and nothing else. That is cheap, and it is why every
 * non-story customer read as the same pawn in a different shirt — at 46–90 px the
 * only thing that survives is silhouette, and there was exactly one.
 *
 * This module builds the body from a `CharacterLook` so the silhouette, the head,
 * the face and the outfit all come from data. Every part is named, because the
 * tests assert on parts rather than on pixels. Nothing here is skinned: joints stay
 * separate `Group`s so the existing walk cycle keeps working, and `mergeRigVertexColors`
 * collapses them to one draw call per joint afterwards.
 *
 * Part sizes are metres, authored with the feet on y = 0. The look's `build` and
 * `height` are applied as a scale on the returned root, which is why the root must be
 * the thing the caller scales, never the body group.
 */

export interface CharacterRig {
  root: THREE.Group;
  /** Bob/sway pivot. Everything above the hips hangs off this. */
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  /** Names of every authored part, in build order, for tests and art reviews. */
  parts: string[];
}

export type StaffRole = 'stocker' | 'cashier' | 'cleaner';

export interface RigOptions {
  /** Adds the prop that tells you what this person is for. */
  role?: StaffRole;
  /** Skip the face for crowd LOD. Default false: a faceless crowd reads as chess pieces. */
  faces?: boolean;
}

const HIP_Y = 0.75;
const SHOULDER_Y = 1.35;
const NECK_Y = 1.55;

/** One material per colour is fine here: the merge bakes colour into vertices. */
const mat = (color: number, roughness = 0.6): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness });

function part(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  parts: string[],
  rotation?: [number, number, number]
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  parts.push(name);
  return mesh;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Low-poly sphere: an eye costs ~48 triangles, not 288. */
const ball = (r: number) => new THREE.SphereGeometry(r, 8, 5);

export function buildCharacterRig(look: CharacterLook, options: RigOptions = {}): CharacterRig {
  const parts: string[] = [];
  const root = new THREE.Group();
  root.name = 'character-root';
  root.scale.set(look.build, look.height, look.build);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const skin = mat(look.skin, 0.65);
  const top = mat(look.top, 0.5);
  const bottom = mat(look.bottom, 0.6);
  const accent = mat(look.accent, 0.45);
  const shoes = mat(0x1f2421, 0.7);
  const dark = mat(look.hairColor, 0.9);

  buildTorso(look, body, parts, { top, bottom, accent, skin });

  // ---- Head ---------------------------------------------------------------
  const head = new THREE.Group();
  head.name = 'head-socket';
  head.position.set(0, NECK_Y, 0);
  body.add(head);

  part(body, 'neck', box(0.20, 0.10, 0.20), skin, [0, NECK_Y - 0.02, 0], parts);
  part(head, 'head', box(0.46, 0.46, 0.46), skin, [0, 0.23, 0], parts);

  if (options.faces !== false) buildFace(head, parts, { skin, accent });
  buildHair(look, head, parts, { skin, dark, accent });
  if (look.beard && look.hair !== 'helmet') {
    part(head, 'beard', box(0.34, 0.16, 0.10), dark, [0, 0.04, 0.19], parts);
  }
  if (look.glasses) {
    part(head, 'glasses', box(0.40, 0.09, 0.05), accent, [0, 0.285, 0.255], parts);
  }
  if (look.bag) {
    part(body, 'bag-strap', box(0.05, 0.64, 0.05), accent, [0.04, 1.14, 0.24], parts, [0, 0, 0.5]);
    part(body, 'bag', box(0.24, 0.26, 0.12), accent, [0.30, 0.90, 0.18], parts);
  }
  // Authored costume details that a generic look would otherwise drop. Mama's coral
  // beads and Bayo's shoulder towel are the two things that identify them across the
  // room; losing them in the rig refactor would have been a silent regression.
  if (look.headpiece === 'gele') {
    part(head, 'coral-necklace', new THREE.TorusGeometry(0.22, 0.035, 8, 16), mat(0xff5722, 0.3), [0, 0.02, 0.10], parts, [Math.PI / 2, 0, 0]);
  }
  if (look.headpiece === 'newsboy') {
    part(body, 'shoulder-towel', box(0.22, 0.45, 0.24), mat(0xeeeeee, 0.8), [-0.35, 1.25, 0], parts);
  }

  // ---- Arms --------------------------------------------------------------
  const { leftArm, rightArm } = buildArms(look, body, parts, { top, skin });
  // ---- Legs --------------------------------------------------------------
  const { leftLeg, rightLeg } = buildLegs(look, root, parts, { bottom, shoes, skin });

  if (options.role) buildRoleProp(options.role, { body, head, parts, accent, top });

  return { root, body, head, leftArm, rightArm, leftLeg, rightLeg, parts };
}

interface Mats {
  top: THREE.Material;
  bottom: THREE.Material;
  accent: THREE.Material;
  skin: THREE.Material;
}

function buildTorso(look: CharacterLook, body: THREE.Group, parts: string[], m: Mats): void {
  switch (look.outfit) {
    case 'agbada': {
      part(body, 'torso', box(0.80, 0.92, 0.52), m.top, [0, 1.02, 0], parts);
      part(body, 'robe-skirt', box(0.98, 0.80, 0.62), m.top, [0, 0.52, 0], parts);
      part(body, 'agbada-collar', box(0.44, 0.12, 0.06), m.accent, [0, 1.42, 0.25], parts);
      part(body, 'pelvis', box(0.62, 0.22, 0.40), m.bottom, [0, 0.76, 0], parts);
      break;
    }
    case 'wrapper': {
      part(body, 'torso', box(0.66, 0.62, 0.40), m.top, [0, 1.18, 0], parts);
      part(body, 'pelvis', box(0.60, 0.22, 0.38), m.top, [0, 0.90, 0], parts);
      part(body, 'wrapper-skirt', box(0.74, 0.92, 0.50), m.bottom, [0, 0.46, 0], parts);
      part(body, 'wrapper-band', box(0.76, 0.10, 0.52), m.accent, [0, 0.90, 0], parts);
      break;
    }
    case 'kaftan': {
      part(body, 'kaftan-body', box(0.72, 1.42, 0.44), m.top, [0, 0.95, 0], parts);
      part(body, 'kaftan-trim', box(0.50, 0.06, 0.46), m.accent, [0, 1.42, 0], parts);
      part(body, 'pelvis', box(0.60, 0.22, 0.38), m.bottom, [0, 0.76, 0], parts);
      break;
    }
    case 'hoodie': {
      part(body, 'torso', box(0.72, 0.90, 0.46), m.top, [0, 1.06, 0], parts);
      part(body, 'hood-pocket', box(0.34, 0.18, 0.06), m.top, [0, 0.94, 0.25], parts);
      part(body, 'pelvis', box(0.60, 0.22, 0.38), m.bottom, [0, 0.76, 0], parts);
      break;
    }
    case 'tunic': {
      part(body, 'torso', box(0.68, 0.86, 0.44), m.top, [0, 1.05, 0], parts);
      part(body, 'tunic-hem', box(0.72, 0.34, 0.46), m.top, [0, 0.62, 0], parts);
      part(body, 'pelvis', box(0.60, 0.22, 0.38), m.bottom, [0, 0.76, 0], parts);
      break;
    }
    case 'tee':
    default: {
      part(body, 'torso', box(0.68, 0.86, 0.42), m.top, [0, 1.05, 0], parts);
      part(body, 'pelvis', box(0.60, 0.22, 0.38), m.bottom, [0, 0.76, 0], parts);
      break;
    }
  }
}

function buildFace(
  head: THREE.Group,
  parts: string[],
  m: { skin: THREE.Material; accent: THREE.Material }
): void {
  const sclera = mat(0xf7f2e8, 0.4);
  const pupil = mat(0x1a1210, 0.3);
  for (const side of [-1, 1] as const) {
    const label = side === -1 ? 'left' : 'right';
    part(head, `eye-${label}`, ball(0.052), sclera, [side * 0.105, 0.28, 0.225], parts);
    part(head, `pupil-${label}`, ball(0.026), pupil, [side * 0.105, 0.28, 0.262], parts);
    part(
      head,
      `brow-${label}`,
      box(0.11, 0.024, 0.03),
      pupil,
      [side * 0.105, 0.355, 0.242],
      parts,
      [0, 0, side * -0.12]
    );
  }
  part(head, 'nose', box(0.06, 0.08, 0.05), m.skin, [0, 0.20, 0.26], parts);
  part(head, 'mouth', box(0.10, 0.022, 0.02), mat(0x4a2a1e, 0.6), [0, 0.115, 0.245], parts);
}

function buildHair(
  look: CharacterLook,
  head: THREE.Group,
  parts: string[],
  m: { skin: THREE.Material; dark: THREE.Material; accent: THREE.Material }
): void {
  // An authored headpiece replaces the procedural hair entirely; layering a cap on
  // top of cornrows is how rigs start looking like clipping bugs.
  switch (look.headpiece) {
    case 'gele':
      part(head, 'gele', box(0.66, 0.30, 0.64), m.accent, [0, 0.50, -0.04], parts, [-0.14, 0, 0]);
      return;
    case 'helmet':
      part(head, 'helmet', box(0.54, 0.24, 0.54), m.accent, [0, 0.44, 0.02], parts);
      return;
    case 'newsboy':
      part(head, 'newsboy', box(0.52, 0.12, 0.54), m.accent, [0, 0.46, 0.02], parts);
      part(head, 'newsboy-brim', box(0.46, 0.04, 0.16), m.accent, [0, 0.40, 0.30], parts);
      return;
    case 'fula':
      part(head, 'fula-cap', new THREE.CylinderGeometry(0.24, 0.24, 0.20, 12), m.dark, [0, 0.54, 0], parts);
      return;
    case 'hijab':
      part(head, 'hijab', box(0.56, 0.54, 0.56), m.accent, [0, 0.24, -0.01], parts);
      part(head, 'hijab-drape', box(0.48, 0.34, 0.20), m.accent, [0, 0.00, -0.26], parts);
      return;
    default:
      break;
  }

  switch (look.hair) {
    case 'fade':
      part(head, 'hair-fade', box(0.48, 0.13, 0.48), m.dark, [0, 0.47, 0], parts);
      part(head, 'hair-fade-sides', box(0.50, 0.08, 0.50), m.dark, [0, 0.40, -0.01], parts);
      break;
    case 'lowcut':
      part(head, 'hair-lowcut', box(0.47, 0.06, 0.47), m.dark, [0, 0.47, 0], parts);
      break;
    case 'braids':
      part(head, 'hair-crown', box(0.48, 0.09, 0.48), m.dark, [0, 0.47, 0], parts);
      part(head, 'braid-left', box(0.10, 0.36, 0.10), m.dark, [-0.24, 0.18, -0.02], parts);
      part(head, 'braid-right', box(0.10, 0.36, 0.10), m.dark, [0.24, 0.18, -0.02], parts);
      break;
    case 'headwrap':
      part(head, 'headwrap', box(0.62, 0.26, 0.60), m.accent, [0, 0.48, -0.02], parts, [-0.12, 0, 0]);
      break;
    case 'cap':
      part(head, 'cap', box(0.50, 0.16, 0.50), m.accent, [0, 0.46, 0], parts);
      part(head, 'cap-brim', box(0.44, 0.04, 0.20), m.accent, [0, 0.40, 0.30], parts);
      break;
    case 'helmet':
      part(head, 'helmet', box(0.54, 0.24, 0.54), m.accent, [0, 0.44, 0.02], parts);
      break;
    case 'bald':
    default:
      break;
  }
}

function buildArms(
  look: CharacterLook,
  body: THREE.Group,
  parts: string[],
  m: { top: THREE.Material; skin: THREE.Material }
): { leftArm: THREE.Group; rightArm: THREE.Group } {
  const wide = look.outfit === 'agbada';
  const bare = look.outfit === 'tee' || look.outfit === 'wrapper' || look.outfit === 'hoodie';
  const armW = wide ? 0.26 : 0.18;

  const make = (side: -1 | 1, label: string): THREE.Group => {
    const socket = new THREE.Group();
    socket.name = `${label}-arm-socket`;
    socket.position.set(side * (wide ? 0.50 : 0.44), SHOULDER_Y, 0);
    socket.userData.restY = 0;

    if (bare) {
      part(socket, `sleeve-${label}`, box(0.21, 0.24, 0.21), m.top, [0, -0.10, 0], parts);
      part(socket, `arm-${label}`, box(0.16, 0.52, 0.16), m.skin, [0, -0.46, 0], parts);
    } else {
      part(socket, `arm-${label}`, box(armW, 0.70, armW), m.top, [0, -0.32, 0], parts);
      part(socket, `cuff-${label}`, box(0.12, 0.10, 0.12), m.skin, [0, -0.66, 0], parts);
    }
    body.add(socket);
    return socket;
  };

  return { leftArm: make(-1, 'left'), rightArm: make(1, 'right') };
}

function buildLegs(
  look: CharacterLook,
  root: THREE.Group,
  parts: string[],
  m: { bottom: THREE.Material; shoes: THREE.Material; skin: THREE.Material }
): { leftLeg: THREE.Group; rightLeg: THREE.Group } {
  // Long garments hide the legs but must not delete them: the walk cycle drives
  // these sockets and the swing is what sells the movement.
  const covered = look.outfit === 'kaftan' || look.outfit === 'wrapper';
  const legMat = covered ? m.bottom : m.bottom;

  const make = (side: -1 | 1, label: string): THREE.Group => {
    const socket = new THREE.Group();
    socket.name = `${label}-leg-socket`;
    socket.position.set(side * 0.18, HIP_Y, 0);
    part(socket, `leg-${label}`, box(0.22, 0.72, 0.22), legMat, [0, -0.35, 0], parts);
    part(socket, `shoe-${label}`, box(0.24, 0.16, 0.32), m.shoes, [0, -0.66, 0.05], parts);
    root.add(socket);
    return socket;
  };

  return { leftLeg: make(-1, 'left'), rightLeg: make(1, 'right') };
}

function buildRoleProp(
  role: StaffRole,
  ctx: { body: THREE.Group; head: THREE.Group; parts: string[]; accent: THREE.Material; top: THREE.Material }
): void {
  if (role === 'stocker') {
    part(ctx.body, 'crate', box(0.34, 0.26, 0.26), mat(0xb98a4b, 0.8), [0, 1.02, 0.26], ctx.parts);
  } else if (role === 'cashier') {
    part(ctx.head, 'staff-cap', box(0.34, 0.10, 0.34), ctx.accent, [0, 0.50, 0], ctx.parts);
  } else {
    // Broom: handle plus head, held across the body.
    part(ctx.body, 'broom-handle', box(0.04, 1.10, 0.04), mat(0x8a5a3b, 0.7), [0.34, 0.85, 0.18], ctx.parts, [0, 0, -0.22]);
    part(ctx.body, 'broom-head', box(0.30, 0.10, 0.10), mat(0xc9a24a, 0.85), [0.46, 0.30, 0.18], ctx.parts, [0, 0, -0.22]);
  }
}
