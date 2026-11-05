import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { MedicineStack } from '../../src/ui/arcade/MedicineStack';
import { BoxMeshPool } from '../../src/ui/arcade/BoxMeshPool';
import { Product } from '../../src/sim/types';

describe('Task 3: MedicineStack & BoxMeshPool', () => {
  let stack: MedicineStack;
  let pool: BoxMeshPool;
  let anchor: THREE.Group;

  const mockProductAntimalarial: Product = {
    id: 'prd_malar_cur',
    code: 'MC-01',
    name: 'Malar-Cur Forte',
    category: 'antimalarial',
    unitDescription: 'Pack of 6 tablets',
    baseCost: 1200,
    baseRetail: 2200,
    fairPriceMin: 2000,
    fairPriceMax: 2500,
    defaultStock: 20,
    symptomTags: ['malaria', 'fever'],
    fractionalAllowed: false,
    requiresPrescription: false,
    isColdChain: false,
    hasMasScratchCode: true,
    pixelColor: '#E53935',
    badge: 'ACT',
  };

  const mockProductAnalgesic: Product = {
    id: 'prd_painaway',
    code: 'PA-01',
    name: 'PainAway Extra',
    category: 'analgesic',
    unitDescription: 'Strip of 10 caplets',
    baseCost: 200,
    baseRetail: 500,
    fairPriceMin: 450,
    fairPriceMax: 600,
    defaultStock: 30,
    symptomTags: ['headache', 'body pain'],
    fractionalAllowed: true,
    requiresPrescription: false,
    isColdChain: false,
    hasMasScratchCode: false,
    pixelColor: '#43A047',
    badge: 'OTC',
  };

  beforeEach(() => {
    pool = new BoxMeshPool(15);
    anchor = new THREE.Group();
    stack = new MedicineStack({ anchor, maxCapacity: 5, pool });
  });

  it('pushes products onto stack up to max capacity', () => {
    expect(stack.count).toBe(0);
    const success1 = stack.push(mockProductAntimalarial);
    expect(success1).toBe(true);
    expect(stack.count).toBe(1);

    for (let i = 0; i < 4; i++) {
      expect(stack.push(mockProductAnalgesic)).toBe(true);
    }
    expect(stack.count).toBe(5);

    // Exceeding capacity should fail and return false
    const excess = stack.push(mockProductAnalgesic);
    expect(excess).toBe(false);
    expect(stack.count).toBe(5);
  });

  it('pops products from top of stack (LIFO)', () => {
    stack.push(mockProductAntimalarial);
    stack.push(mockProductAnalgesic);

    const top = stack.pop();
    expect(top?.id).toBe(mockProductAnalgesic.id);
    expect(stack.count).toBe(1);

    const bottom = stack.pop();
    expect(bottom?.id).toBe(mockProductAntimalarial.id);
    expect(stack.count).toBe(0);

    expect(stack.pop()).toBeNull();
  });

  it('positions each stacked box with vertical Y offset', () => {
    stack.push(mockProductAntimalarial);
    stack.push(mockProductAnalgesic);

    const meshes = stack.getMeshes();
    expect(meshes.length).toBe(2);
    expect(meshes[1].position.y).toBeGreaterThan(meshes[0].position.y);
  });

  it('applies inertia and sway to boxes during movement update', () => {
    stack.push(mockProductAntimalarial);
    stack.push(mockProductAnalgesic);

    // Move with velocity vector (1, 0)
    stack.update(0.016, new THREE.Vector2(1, 0));
    const meshes = stack.getMeshes();
    // Top box should sway slightly more than bottom box
    expect(meshes[1].rotation.z).not.toBe(0);
  });

  it('reuses mesh pool allocations cleanly', () => {
    expect(pool.availableCount).toBe(15);
    stack.push(mockProductAntimalarial);
    expect(pool.availableCount).toBe(14);

    stack.pop();
    expect(pool.availableCount).toBe(15);
  });

  it('pops matching category from any position in stack and repositions remainder', () => {
    // Stack: bottom = Antimalarial (index 0), top = Analgesic (index 1)
    stack.push(mockProductAntimalarial);
    stack.push(mockProductAnalgesic);
    expect(stack.count).toBe(2);

    // Pop antimalarial (which is under the analgesic)
    const popped = stack.popMatching('antimalarial');
    expect(popped).toBeDefined();
    expect(popped?.category).toBe('antimalarial');
    expect(stack.count).toBe(1);

    // Remaining item is analgesic, repositioned to bottom (index 0)
    const remainingMeshes = stack.getMeshes();
    expect(remainingMeshes.length).toBe(1);
    expect(remainingMeshes[0].position.y).toBe(0);
    expect(stack.peek()?.id).toBe(mockProductAnalgesic.id);
  });
});
