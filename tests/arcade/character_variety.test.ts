import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArcadeCustomer } from '../../src/ui/arcade/ArcadeCustomer';
import { ArcadeStaff } from '../../src/ui/arcade/ArcadeStaff';
import { buildCharacterRig } from '../../src/ui/arcade/kit/characterRig';
import { customerLook, staffLook } from '../../src/ui/arcade/kit/look';
import { CHARACTER_MATERIAL, rigMeshCount } from '../../src/ui/arcade/kit/rigMerge';

const data = (id: string) =>
  ({
    id,
    name: id,
    title: 'x',
    avatarKey: id,
    initialQuote: '',
    symptoms: [],
    symptomLabel: '',
    matchedProductIds: [],
    budget: 1000,
    mood: 'Patient',
    patienceMax: 3,
    preferredPayment: 'cash',
    dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] },
  }) as never;

const names = (rig: ReturnType<typeof buildCharacterRig>): Set<string> => new Set(rig.parts);

const size = (obj: THREE.Object3D): THREE.Vector3 => {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
};

const triangles = (obj: THREE.Object3D): number => {
  let n = 0;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    n += geo.index ? geo.index.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3;
  });
  return n;
};

describe('character rig', () => {
  it('gives every customer a face', () => {
    const ids = ['cust_a', 'cust_b', 'cust_c', 'cust_mama_ngozi'];
    for (const id of ids) {
      const parts = names(buildCharacterRig(customerLook(data(id))));
      for (const part of ['eye-left', 'eye-right', 'brow-left', 'brow-right', 'mouth']) {
        expect(parts.has(part), `${id} is missing ${part}`).toBe(true);
      }
    }
  });

  it('builds a different silhouette per outfit family', () => {
    const signatures = new Map<string, Set<string>>();
    for (const outfit of ['tunic', 'agbada', 'wrapper', 'tee', 'hoodie', 'kaftan'] as const) {
      const rig = buildCharacterRig({ ...customerLook(data('cust_shape')), outfit });
      signatures.set(outfit, names(rig));
    }
    const markers: Record<string, string> = {
      agbada: 'robe-skirt',
      wrapper: 'wrapper-skirt',
      hoodie: 'hood-pocket',
      tee: 'sleeve-left',
      tunic: 'tunic-hem',
      kaftan: 'kaftan-body',
    };
    for (const [outfit, part] of Object.entries(markers)) {
      expect(signatures.get(outfit)!.has(part), `${outfit} lost its ${part}`).toBe(true);
    }
  });

  it('gives the hoodie a hood, so it is not a tee with a pocket', () => {
    const base = customerLook(data('cust_hood'));
    const tee = size(buildCharacterRig({ ...base, outfit: 'tee' }).root);
    const hoodieRig = buildCharacterRig({ ...base, outfit: 'hoodie' });
    const hoodie = size(hoodieRig.root);
    expect(names(hoodieRig).has('hood')).toBe(true);
    // The hood projects behind the shoulders; the tee has nothing there.
    expect(hoodie.z).toBeGreaterThan(tee.z + 0.1);
  });

  it('puts the stocker crate in their hands, not on their chest', () => {
    const rig = buildCharacterRig(staffLook('stocker'), { role: 'stocker' });
    const crate = rig.parts.includes('crate');
    expect(crate).toBe(true);
    // Arms rotate forward to hold it.
    expect(Math.abs(rig.leftArm.rotation.x)).toBeGreaterThan(1);
    expect(Math.abs(rig.rightArm.rotation.x)).toBeGreaterThan(1);
  });

  it('changes what is on the head, not just the colour', () => {
    const wrap = names(buildCharacterRig({ ...customerLook(data('n1')), hair: 'headwrap', headpiece: null }));
    const braids = names(buildCharacterRig({ ...customerLook(data('n2')), hair: 'braids', headpiece: null }));
    const cap = names(buildCharacterRig({ ...customerLook(data('n3')), hair: 'cap', headpiece: null }));
    expect(wrap.has('headwrap')).toBe(true);
    expect(braids.has('braid-left')).toBe(true);
    expect(cap.has('cap-brim')).toBe(true);
    expect(wrap.has('cap-brim')).toBe(false);
  });

  it('keeps the authored headpieces', () => {
    expect(names(buildCharacterRig({ ...customerLook(data('cust_mama_ngozi')) })).has('gele')).toBe(true);
    expect(names(buildCharacterRig({ ...customerLook(data('cust_emeka')) })).has('helmet')).toBe(true);
    expect(names(buildCharacterRig({ ...customerLook(data('cust_danjuma')) })).has('fula-cap')).toBe(true);
  });

  it('merges to one mesh per joint whatever the outfit', () => {
    for (const id of ['cust_a', 'cust_b', 'cust_mama_ngozi', 'cust_danjuma']) {
      const c = new ArcadeCustomer(data(id), 0);
      expect(rigMeshCount(c.mesh), `${id} blew the draw budget`).toBeLessThanOrEqual(11);
      let vertexColoured = 0;
      c.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material === CHARACTER_MATERIAL) vertexColoured++;
      });
      expect(vertexColoured, `${id} kept per-colour materials`).toBeGreaterThanOrEqual(5);
    }
  });

  it('actually varies the crowd on screen, not only in data', () => {
    const widths = new Set<string>();
    const heights = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const c = new ArcadeCustomer(data(`cust_${i}`), 0);
      const s = size(c.rig.root);
      widths.add(s.x.toFixed(2));
      heights.add(s.y.toFixed(1));
    }
    expect(widths.size).toBeGreaterThanOrEqual(4);
    expect(heights.size).toBeGreaterThanOrEqual(3);
  });

  it('scales height without lifting feet off the floor', () => {
    const base = customerLook(data('cust_tall'));
    const short = buildCharacterRig({ ...base, height: 0.92 });
    const tall = buildCharacterRig({ ...base, height: 1.08 });
    short.root.updateMatrixWorld(true);
    tall.root.updateMatrixWorld(true);
    const shortBox = new THREE.Box3().setFromObject(short.root);
    const tallBox = new THREE.Box3().setFromObject(tall.root);
    expect(shortBox.min.y).toBeCloseTo(0, 2);
    expect(tallBox.min.y).toBeCloseTo(0, 2);
    expect(tallBox.max.y - shortBox.max.y).toBeGreaterThan(0.1);
  });

  it('stays inside the triangle budget for a full queue', () => {
    let total = 0;
    for (let i = 0; i < 8; i++) total += triangles(new ArcadeCustomer(data(`cust_q${i}`), i).mesh);
    // Eight customers, phone tier, against the 45 000 scene budget.
    expect(total).toBeLessThanOrEqual(24000);
  });
});

describe('staff rig', () => {
  it('gives staff arms and a face', () => {
    const rig = buildCharacterRig(staffLook('cashier'));
    const parts = names(rig);
    expect(parts.has('arm-left')).toBe(true);
    expect(parts.has('arm-right')).toBe(true);
    expect(parts.has('eye-left')).toBe(true);
  });

  it('merges every worker so three employees are not fifteen draw calls', () => {
    const staffGroup = new ArcadeStaff();
    staffGroup.sync({
      state: { employees: { stocker: { count: 1 }, cashier: { count: 1 }, cleaner: { count: 1 } } },
    } as never);
    // One flattened body plus a ground shadow per worker: 6 draws for three hires.
    expect(rigMeshCount(staffGroup.group)).toBeLessThanOrEqual(8);
    let shared = 0;
    staffGroup.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === CHARACTER_MATERIAL) shared++;
    });
    expect(shared).toBe(3);
  });

  it('dresses each role differently', () => {
    const tops = new Set(['stocker', 'cashier', 'cleaner'].map((r) => staffLook(r as never).top));
    expect(tops.size).toBe(3);
  });
});
