import * as THREE from 'three';
import { Customer, Product } from '../../sim/types';
import { PharmChrisEngine } from '../../sim/engine';
import { PharmacyShelves3D, normalizeCategory } from './PharmacyShelves3D';
import { ArcadeCustomer } from './ArcadeCustomer';

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
}

export class ArcadeCustomerQueue {
  public group: THREE.Group;
  public engine: PharmChrisEngine;
  public shelves: PharmacyShelves3D;
  public maxQueue: number;
  
  private customers: ArcadeCustomer[] = [];
  private spawnTimer: number = 0;
  private spawnInterval: number = 6.0;

  constructor(options: ArcadeCustomerQueueOptions) {
    this.engine = options.engine;
    this.shelves = options.shelves;
    this.maxQueue = options.maxQueue ?? 5;
    this.group = new THREE.Group();

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

  public injectCustomer(data: Customer, state: 'walking' | 'queued' | 'serving' = 'serving'): ArcadeCustomer {
    const customer = new ArcadeCustomer(data, 0);
    customer.state = state;
    if (state === 'serving') {
      customer.position.set(0, 0, 2.8);
      customer.targetPosition.set(0, 0, 2.8);
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

  public reindexSlots(): void {
    const active = this.customers.filter((c) => c.state !== 'leaving');
    active.forEach((cust, idx) => {
      cust.updateTargetSlot(idx);
    });
  }

  public update(delta: number): void {
    // Automatic spawner
    this.spawnTimer += delta;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      if (this.queueLength < this.maxQueue) {
        this.spawnCustomer();
      }
    }

    // Update all customer movement & animations
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const cust = this.customers[i];
      cust.update(delta);

      // Remove customer once they exited out the street (z > 10.5)
      if (cust.state === 'leaving' && cust.position.z >= 10.5) {
        this.group.remove(cust.mesh);
        this.customers.splice(i, 1);
      }
    }
  }
}
