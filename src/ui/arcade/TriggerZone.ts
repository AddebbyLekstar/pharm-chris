import * as THREE from 'three';
import { ArcadePlayer } from './ArcadePlayer';
import { MedicineStack } from './MedicineStack';
import { PharmacyShelves3D } from './PharmacyShelves3D';
import { PharmChrisEngine } from '../../sim/engine';
import { Product } from '../../sim/types';

export interface TriggerZoneConfig {
  id: string;
  name: string;
  position: THREE.Vector3;
  radius: number;
  color: string;
}

export class TriggerZone {
  public id: string;
  public name: string;
  public position: THREE.Vector3;
  public radius: number;
  public color: string;
  public ringMesh: THREE.Mesh;
  private pulseTimer: number = 0;
  private ringMat: THREE.MeshBasicMaterial;

  constructor(config: TriggerZoneConfig) {
    this.id = config.id;
    this.name = config.name;
    this.position = config.position;
    this.radius = config.radius;
    this.color = config.color;

    // Circular flat ring on floor
    const ringGeo = new THREE.RingGeometry(this.radius * 0.75, this.radius, 32);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.color),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    this.ringMesh = new THREE.Mesh(ringGeo, this.ringMat);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.set(this.position.x, 0.02, this.position.z);
  }

  public isInside(targetPos: THREE.Vector3): boolean {
    const dx = targetPos.x - this.position.x;
    const dz = targetPos.z - this.position.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.radius;
  }

  public update(delta: number): void {
    this.pulseTimer += delta * 4;
    const pulse = 1 + Math.sin(this.pulseTimer) * 0.08;
    this.ringMesh.scale.set(pulse, pulse, 1);
  }
}

export interface TriggerZoneManagerOptions {
  shelves: PharmacyShelves3D;
  engine: PharmChrisEngine;
}

export class TriggerZoneManager {
  public group: THREE.Group;
  public shelves: PharmacyShelves3D;
  public engine: PharmChrisEngine;
  private zones: Map<string, TriggerZone> = new Map();
  private transferCooldown: number = 0;
  private readonly transferInterval: number = 0.12;
  private availableProducts: Product[];
  private dockProductIndex: number = 0;

  constructor(options: TriggerZoneManagerOptions) {
    this.shelves = options.shelves;
    this.engine = options.engine;
    this.group = new THREE.Group();
    this.availableProducts = this.engine.getAllProducts();

    this.setupZones();
  }

  private setupZones(): void {
    const configs: TriggerZoneConfig[] = [
      {
        id: 'dock',
        name: 'Delivery Unboxing Dock',
        position: new THREE.Vector3(0, 0, -6.5),
        radius: 2.0,
        color: '#FFD54F',
      },
      {
        id: 'shelf_antimalarial',
        name: 'Antimalarial Shelf',
        position: new THREE.Vector3(-4.5, 0, -4.5),
        radius: 1.8,
        color: '#E53935',
      },
      {
        id: 'shelf_analgesic',
        name: 'Analgesic Shelf',
        position: new THREE.Vector3(-4.5, 0, 0.5),
        radius: 1.8,
        color: '#43A047',
      },
      {
        id: 'shelf_antibiotic',
        name: 'Antibiotic Shelf',
        position: new THREE.Vector3(4.5, 0, -4.5),
        radius: 1.8,
        color: '#1E88E5',
      },
      {
        id: 'shelf_cold_chain',
        name: 'Cold Chain / Insulin Shelf',
        position: new THREE.Vector3(4.5, 0, 0.5),
        radius: 1.8,
        color: '#00ACC1',
      },
      {
        id: 'counter_cashier',
        name: 'Dispensing & Cashier Counter',
        position: new THREE.Vector3(0, 0, 0.2),
        radius: 2.0,
        color: '#00E676',
      },
    ];

    for (const conf of configs) {
      const zone = new TriggerZone(conf);
      this.zones.set(conf.id, zone);
      this.group.add(zone.ringMesh);
    }
  }

  public getZone(id: string): TriggerZone | undefined {
    return this.zones.get(id);
  }

  public update(delta: number, player: ArcadePlayer, stack: MedicineStack): void {
    // Update pulsing rings
    for (const zone of this.zones.values()) {
      zone.update(delta);
    }

    this.transferCooldown = Math.max(0, this.transferCooldown - delta);
    if (this.transferCooldown > 0) return;

    // 1. Check Delivery Dock Zone (Take boxes onto player's stack)
    const dockZone = this.zones.get('dock');
    if (dockZone && dockZone.isInside(player.position)) {
      if (stack.count < stack.maxCapacity && this.availableProducts.length > 0) {
        const prod = this.availableProducts[this.dockProductIndex % this.availableProducts.length];
        this.dockProductIndex++;
        if (stack.push(prod)) {
          this.transferCooldown = this.transferInterval;
          return;
        }
      }
    }

    // 2. Check Shelf Zones (Place matching boxes onto shelves)
    const shelfZoneMap: Record<string, string> = {
      shelf_antimalarial: 'antimalarial',
      shelf_analgesic: 'analgesic',
      shelf_antibiotic: 'antibiotic',
      shelf_cold_chain: 'cold_chain',
    };

    for (const [zoneId, category] of Object.entries(shelfZoneMap)) {
      const zone = this.zones.get(zoneId);
      if (zone && zone.isInside(player.position)) {
        const popped = stack.popMatching(category);
        if (popped) {
          this.shelves.addStock(category, 1);
          this.transferCooldown = this.transferInterval;
          return;
        }
      }
    }
  }
}
