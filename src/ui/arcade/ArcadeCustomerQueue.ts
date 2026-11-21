import * as THREE from 'three';
import { QUEUE_SLOTS, ROOM } from './layout';
import { Customer, Product } from '../../sim/types';
import { PharmChrisEngine } from '../../sim/engine';
import { PharmacyShelves3D, normalizeCategory } from './PharmacyShelves3D';
import { ArcadeCustomer } from './ArcadeCustomer';
import { customerArtMode, SpriteBatch } from './kit/spriteBatch';
import { customerLook } from './kit/look';
import { CUSTOMERS_ROSTER } from '../../sim/customers';

/** First four customers cast shadows; the tail of the queue does not. */
const CROWD_SHADOW_LIMIT = 4;

export interface CounterServiceResult {
  success: boolean;
  customer: Customer;
  productServed?: Product;
  cashEarned: number;
  outOfStockCategory?: string;
}

export interface ArcadeCustomerQueueOptions {
  engine: PharmChrisEngine;
  shelves: PharmacyShelves3D;
  maxQueue?: number;
  initialSpawn?: number;
  /** The economy owns the clock; when false the queue never spawns on its own. */
  autoSpawn?: boolean;
}

export class ArcadeCustomerQueue {
  public group: THREE.Group;
  public engine: PharmChrisEngine;
  public shelves: PharmacyShelves3D;
  public maxQueue: number;
  /**
   * The crowd as one atlas batch. Non-null only under `?art=sprites`; the 3D rig
   * path stays the default and is untouched.
   */
  public sprites: SpriteBatch | null = null;
  
  private customers: ArcadeCustomer[] = [];
  private shadowLodCount = -1;
  private spawnTimer: number = 0;
  private spawnInterval: number = 6.0;
  public autoSpawn: boolean = true;

  constructor(options: ArcadeCustomerQueueOptions) {
    this.engine = options.engine;
    this.shelves = options.shelves;
    this.maxQueue = options.maxQueue ?? 5;
    this.autoSpawn = options.autoSpawn ?? true;
    this.group = new THREE.Group();

    if (customerArtMode() === 'sprites') {
      // Rasterise the authored roster up front: a customer appearing with an
      // empty atlas cell would pop in a frame late.
      this.sprites = new SpriteBatch(16);
      this.sprites.group.name = 'customer-sprite-layer';
      for (const data of CUSTOMERS_ROSTER) this.sprites.preload(customerLook(data));
      this.group.add(this.sprites.group);
    }

    // Spawn initial customers immediately on initialization (default 2)
    const initialSpawn = options.initialSpawn ?? 2;
    for (let i = 0; i < initialSpawn; i++) {
      this.spawnCustomer();
    }
  }

  public get queueLength(): number {
    return this.customers.filter((c) => c.state !== 'leaving').length;
  }

  public getFrontCustomer(): ArcadeCustomer | null {
    const active = this.customers.filter((c) => c.state !== 'leaving');
    return active.length > 0 ? active[0] : null;
  }

  public spawnCustomer(): ArcadeCustomer | null {
    if (this.queueLength >= this.maxQueue) {
      return null;
    }

    const custData = this.engine.getCurrentCustomer();
    const slotIndex = this.queueLength;
    const customer = new ArcadeCustomer(custData, slotIndex);

    this.customers.push(customer);
    this.group.add(customer.mesh);
    return customer;
  }

  /** Spawns the mesh for a customer the economy has already decided on. */
  public spawnFrom(data: Customer): ArcadeCustomer | null {
    if (this.queueLength >= this.maxQueue) return null;
    const customer = new ArcadeCustomer(data, this.queueLength);
    this.customers.push(customer);
    this.group.add(customer.mesh);
    return customer;
  }

  public injectCustomer(data: Customer, state: 'walking' | 'queued' | 'serving' = 'serving'): ArcadeCustomer {
    const customer = new ArcadeCustomer(data, 0);
    customer.state = state;
    if (state === 'serving') {
      const front = QUEUE_SLOTS[0];
      customer.position.set(front.x, 0, ROOM.maxZ + 0.9);
      customer.targetPosition.set(front.x, 0, front.z);
    }
    this.customers.unshift(customer);
    this.group.add(customer.mesh);
    this.reindexSlots();
    return customer;
  }

  public getCustomerCategory(cust: ArcadeCustomer): { category: string; product: Product } {
    const matchedId = cust.data.matchedProductIds[0];
    const product = this.engine.getAllProducts().find((p) => p.id === matchedId) || this.engine.getAllProducts()[0];
    const cat = product.isColdChain ? 'cold_chain' : normalizeCategory(product.category);
    return { category: cat, product };
  }

  public processCounterService(playerAtCounter: boolean): CounterServiceResult | null {
    if (!playerAtCounter) return null;

    const front = this.getFrontCustomer();
    if (!front || front.state !== 'serving') return null;

    // Find matching product
    const { category: cat, product } = this.getCustomerCategory(front);

    // Check if shelf has stock
    if (this.shelves.getStock(cat) <= 0) {
      return {
        success: false,
        customer: front.data,
        cashEarned: 0,
        outOfStockCategory: cat,
      };
    }

    // Consume shelf stock and complete transaction
    this.shelves.consumeStock(cat, 1);
    const cash = Math.min(front.data.budget, product.baseRetail);

    front.setLeaving();
    this.reindexSlots();

    return {
      success: true,
      customer: front.data,
      productServed: product,
      cashEarned: cash,
    };
  }

  /**
   * Crowd LOD for the shadow pass only.
   *
   * The spec's budget assumes ten characters, and past the fourth the player is not
   * reading faces — he is reading a queue. Dropping castShadow on the tail of the
   * queue removes one draw per material per customer from the shadow pass without
   * touching the visible mesh, and every customer keeps its own contact shadow.
   */
  private refreshShadowLod(): void {
    const active = this.customers.filter((c) => c.state !== 'leaving');
    if (active.length === this.shadowLodCount) return;
    this.shadowLodCount = active.length;
    active.forEach((cust, idx) => {
      const cast = idx < CROWD_SHADOW_LIMIT;
      cust.mesh.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = cast;
      });
    });
  }

  public reindexSlots(): void {
    const active = this.customers.filter((c) => c.state !== 'leaving');
    active.forEach((cust, idx) => {
      cust.updateTargetSlot(idx);
    });
  }

  /**
   * Place the sprite crowd for the current camera. Called after the follow camera
   * settles so a moving camera does not shear the quads by one frame.
   */
  public syncSprites(camera?: THREE.Camera): void {
    if (!this.sprites) return;
    this.sprites.sync(this.customers);
    if (camera) this.sprites.update(camera);
  }

  public update(delta: number): void {
    this.refreshShadowLod();
    // Automatic spawner (legacy path; the arcade economy drives spawning instead)
    if (this.autoSpawn) {
      this.spawnTimer += delta;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        if (this.queueLength < this.maxQueue) {
          this.spawnCustomer();
        }
      }
    }

    // Update all customer movement & animations
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const cust = this.customers[i];
      cust.update(delta);

      // Remove customer once they exited out the street (z > 10.5)
      if (cust.state === 'leaving' && cust.position.z >= ROOM.maxZ + 2.6) {
        this.group.remove(cust.mesh);
        this.customers.splice(i, 1);
      }
    }
  }
}
