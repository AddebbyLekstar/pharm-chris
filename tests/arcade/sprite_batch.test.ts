import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ArcadeCustomer } from '../../src/ui/arcade/ArcadeCustomer';
import { ArcadeCustomerQueue } from '../../src/ui/arcade/ArcadeCustomerQueue';
import { PharmacyShelves3D } from '../../src/ui/arcade/PharmacyShelves3D';
import { PharmChrisEngine } from '../../src/sim/engine';
import { customerLook } from '../../src/ui/arcade/kit/look';
import {
  ATLAS_CELL_H,
  ATLAS_CELL_W,
  SPRITE_WORLD_HEIGHT,
  SpriteBatch,
  lookKey,
  parseCustomerArtMode,
} from '../../src/ui/arcade/kit/spriteBatch';

const data = (id: string) =>
  ({
    id,
    name: id,
    title: 'x',
    avatarKey: 'arcade',
    initialQuote: '',
    symptoms: [],
    symptomLabel: '',
    matchedProductIds: ['prd_malaguard_forte'],
    budget: 1000,
    mood: 'Patient',
    patienceMax: 3,
    preferredPayment: 'cash',
    dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] },
  }) as never;

const customersFor = (ids: string[]): ArcadeCustomer[] =>
  ids.map((id, index) => {
    const customer = new ArcadeCustomer(data(id), index);
    customer.mesh.position.set((index % 2) * 0.4, 0, 3 - index * 0.55);
    return customer;
  });

const camera = (): THREE.PerspectiveCamera => {
  const cam = new THREE.PerspectiveCamera(32, 360 / 800, 0.1, 100);
  cam.position.set(8, 12, 13);
  cam.lookAt(0, 1, 1);
  cam.updateMatrixWorld();
  return cam;
};

const useSpriteMode = (): void => {
  (globalThis as Record<string, unknown>).window = { location: { search: '?art=sprites' } };
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('customer art flag', () => {
  it('defaults to the 3D rig and only accepts ?art=sprites', () => {
    expect(parseCustomerArtMode('')).toBe('rig');
    expect(parseCustomerArtMode('?art=v3')).toBe('rig');
    expect(parseCustomerArtMode('?art=sprites')).toBe('sprites');
    expect(parseCustomerArtMode('?art=Sprites')).toBe('sprites');
    expect(parseCustomerArtMode('?quality=low&art=sprites')).toBe('sprites');
    expect(parseCustomerArtMode('?art=sprites-please')).toBe('rig');
  });

  it('leaves the rig attached by default and swaps it for a bubble in sprite mode', () => {
    const rigged = new ArcadeCustomer(data('cust_emeka'), 0);
    expect(rigged.rendersAsSprite).toBe(false);
    expect(rigged.mesh.getObjectByName('character-root')).toBeDefined();
    expect(rigged.mesh.children.some((child) => child.type === 'Mesh')).toBe(true);

    useSpriteMode();
    const sprite = new ArcadeCustomer(data('cust_emeka'), 0);
    expect(sprite.rendersAsSprite).toBe(true);
    expect(sprite.rig.root.parent).toBeNull();
    expect(sprite.mesh.getObjectByName('character-root')).toBeUndefined();
    // Behaviour survives the renderer swap: the symptom marker still exists.
    expect(sprite.mesh.getObjectByName('symptom-bubble')).toBeDefined();
  });
});

describe('sprite atlas', () => {
  it('allocates one cell per distinct look, not per customer', () => {
    const batch = new SpriteBatch(16);
    const ids = ['cust_mama_ngozi', 'cust_emeka', 'cust_bayo_danfo', 'cust_alabi_fintech', 'cust_iya_basira', 'cust_mama_ngozi'];
    const customers = customersFor(ids);
    const distinct = new Set(customers.map((c) => lookKey(customerLook(c.data)))).size;

    batch.sync(customers);
    expect(batch.atlas.cellCount).toBe(distinct);
    expect(batch.quadCount).toBe(6);
  });

  it('keeps every look inside the 0..1 UV square with non-empty cells', () => {
    const batch = new SpriteBatch(16);
    batch.sync(customersFor(['cust_mama_ngozi', 'cust_emeka', 'cust_bayo_danfo', 'cust_alabi_fintech', 'cust_iya_basira']));

    for (const cell of batch.atlas.cells) {
      const { u0, v0, u1, v1 } = batch.atlas.uv(cell);
      for (const value of [u0, v0, u1, v1]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(u1).toBeGreaterThan(u0);
      expect(v1).toBeGreaterThan(v0);
      // A cell is 128 x 256 of the texture, so its UV span is exact.
      expect((u1 - u0) * batch.atlas.columns).toBeCloseTo(1, 5);
      expect((v1 - v0) * batch.atlas.rows).toBeCloseTo(1, 5);
    }
  });

  it('uses the retina cell aspect rather than distorting the 64 x 128 figure', () => {
    expect(ATLAS_CELL_W).toBe(128);
    expect(ATLAS_CELL_H).toBe(256);
  });
});

describe('sprite batch', () => {
  it('draws each customer as exactly one quad and the whole queue as two meshes', () => {
    const batch = new SpriteBatch(16);
    const customers = customersFor(['cust_mama_ngozi', 'cust_emeka', 'cust_bayo_danfo', 'cust_alabi_fintech', 'cust_iya_basira', 'cust_test_6']);
    batch.sync(customers);
    batch.update(camera());

    expect(batch.quadCount).toBe(6);
    expect(batch.meshCount).toBeLessThanOrEqual(2);
    const meshes = batch.group.children.filter((child) => (child as THREE.Mesh).isMesh);
    expect(meshes).toHaveLength(2);
    // 6 quads x 2 triangles x 3 indices.
    expect(batch.mesh.geometry.drawRange.count).toBe(36);
  });

  it('configures the sprite material as alpha-tested opaque geometry', () => {
    const batch = new SpriteBatch(16);
    expect(batch.material.alphaTest).toBe(0.5);
    expect(batch.material.transparent).toBe(false);
    expect(batch.material.depthWrite).toBe(true);
    expect(batch.material.depthTest).toBe(true);
    expect(batch.material.map).toBe(batch.atlas.texture);
    // Nothing is blended, so there is no sort order to get wrong against shelves.
    expect(batch.material.blending).toBe(THREE.NormalBlending);
    expect(batch.shadowMaterial.transparent).toBe(true);
    expect(batch.shadowMaterial.depthWrite).toBe(false);
  });

  it('stands the sprite on the floor at the customer position, at rig height', () => {
    const batch = new SpriteBatch(16);
    const customers = customersFor(['cust_mama_ngozi', 'cust_emeka', 'cust_alabi_fintech']);
    batch.sync(customers);
    batch.update(camera());

    const position = batch.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    customers.forEach((customer, index) => {
      const v = index * 4;
      const bl = new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v));
      const br = new THREE.Vector3(position.getX(v + 1), position.getY(v + 1), position.getZ(v + 1));
      const tl = new THREE.Vector3(position.getX(v + 2), position.getY(v + 2), position.getZ(v + 2));

      // The quad's bottom edge is allowed a few cm below the floor (the sheet's
      // 4 px foot margin), but never above it.
      expect(bl.y).toBeLessThanOrEqual(0.001);
      // Feet line (y = 124/128 of the art) lands exactly on the customer anchor.
      const bottomMid = bl.clone().add(br).multiplyScalar(0.5);
      const upEdge = tl.clone().sub(bl);
      const feet = bottomMid.clone().add(upEdge.clone().multiplyScalar(4 / 128));
      expect(feet.x).toBeCloseTo(customer.position.x, 4);
      expect(feet.y).toBeCloseTo(0, 4);
      expect(feet.z).toBeCloseTo(customer.position.z, 4);

      // Billboard height is the rig height in metres, so perspective does the
      // distance scaling exactly as it would for the 3D figure.
      const height = SPRITE_WORLD_HEIGHT * customer.look.height;
      expect(upEdge.length()).toBeCloseTo(height, 4);
      const shadow = batch.shadowMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      expect(shadow.getY(index * 4)).toBeCloseTo(0.006, 6);
    });
  });

  it('drops customers from the batch when the queue drops them', () => {
    const batch = new SpriteBatch(16);
    const customers = customersFor(['cust_mama_ngozi', 'cust_emeka']);
    batch.sync(customers);
    batch.update(camera());
    expect(batch.quadCount).toBe(2);

    batch.sync([customers[1]]);
    batch.update(camera());
    expect(batch.quadCount).toBe(1);
    expect(batch.mesh.geometry.drawRange.count).toBe(6);
  });

  it('wires ?art=sprites into the queue without touching queue behaviour', () => {
    useSpriteMode();
    const engine = new PharmChrisEngine();
    const shelves = new PharmacyShelves3D(engine.getAllProducts());
    const queue = new ArcadeCustomerQueue({ engine, shelves, maxQueue: 6, initialSpawn: 2, autoSpawn: false });

    expect(queue.sprites).not.toBeNull();
    queue.update(0.1);
    queue.syncSprites(camera());

    expect(queue.queueLength).toBe(2);
    expect(queue.sprites!.quadCount).toBe(2);
    expect(queue.sprites!.meshCount).toBeLessThanOrEqual(2);
    // The rig path is untouched: still six queue slots and normal movement.
    expect(queue.getFrontCustomer()?.state).toBe('walking');
  });
});

describe('sprite atlas geometry', () => {
  it('gives every cell the same UV height, however many looks were painted', async () => {
    // Regression: the atlas used to grow from one row to three, and cells painted
    // before the growth kept a full-height UV — each customer sampled a stretched
    // slice across several cells, which painted a solid colour over the face.
    const { SpriteAtlas, ATLAS_ROWS } = await import('../../src/ui/arcade/kit/spriteBatch');
    const { customerLook } = await import('../../src/ui/arcade/kit/look');
    const atlas = new SpriteAtlas();
    const heights = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const cell = atlas.preload(customerLook({ id: `cust_uv_${i}` } as never));
      const box = atlas.uv(cell);
      heights.add(Math.round((box.v1 - box.v0) * 1e6) / 1e6);
    }
    expect(heights.size).toBe(1);
    expect([...heights][0]).toBeCloseTo(1 / ATLAS_ROWS, 6);
  });
});
