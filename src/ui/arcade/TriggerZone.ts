import * as THREE from 'three';
import { ZONES } from './layout';
import { ArcadePlayer } from './ArcadePlayer';
import { MedicineStack } from './MedicineStack';
import { PharmacyShelves3D } from './PharmacyShelves3D';
import { PharmChrisEngine } from '../../sim/engine';
import { Product } from '../../sim/types';
import { artVersion } from './art';
import { textures } from './textures';

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
  private baseOpacity: number;
  private soft = false;

  constructor(config: TriggerZoneConfig) {
    this.id = config.id;
    this.name = config.name;
    this.position = config.position;
    this.radius = config.radius;
    this.color = config.color;

    // v3: a soft gradient band instead of a hard saturated hoop. Six constant
    // 0.65-opacity primary rings is the loudest "debug gizmo" read in the frame;
    // the halo fades up as the player approaches and stays quiet when they are
    // across the room.
    this.soft = artVersion() === 'v3';
    this.baseOpacity = this.soft ? 0.5 : 0.65;
    const ringGeo = this.soft
      ? new THREE.PlaneGeometry(this.radius * 2, this.radius * 2)
      : new THREE.RingGeometry(this.radius * 0.75, this.radius, 32);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.color),
      map: this.soft ? textures()?.zoneRing ?? null : null,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: this.baseOpacity,
      depthWrite: false,
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

  public update(delta: number, playerPosition?: THREE.Vector3): void {
    this.pulseTimer += delta * 4;
    const pulse = 1 + Math.sin(this.pulseTimer) * 0.08;

    if (this.soft && playerPosition) {
      // 1 inside the zone, 0 at 4 m out. 0.34 at rest still has to be readable
      // against a cream terrazzo floor; 0.16 was invisible and killed affordance.
      const dx = playerPosition.x - this.position.x;
      const dz = playerPosition.z - this.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const near = Math.min(1, Math.max(0, 1 - (distance - this.radius) / 4));
      this.ringMat.opacity = this.baseOpacity + near * (0.9 - this.baseOpacity);
      const grow = 1 + near * 0.04;
      this.ringMesh.scale.set(pulse * grow, pulse * grow, 1);
      return;
    }

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
    const configs: TriggerZoneConfig[] = ZONES.map((zone) => ({
      id: zone.id,
      name: zone.name,
      position: new THREE.Vector3(zone.x, 0, zone.z),
      radius: zone.radius,
      color: zone.color,
    }));

    for (const conf of configs) {
      const zone = new TriggerZone(conf);
      this.zones.set(conf.id, zone);
      this.group.add(zone.ringMesh);
    }
  }

  public getZone(id: string): TriggerZone | undefined {
    return this.zones.get(id);
  }

  /**
   * Zone positions for external gates. The mobile gate used to hardcode the old
   * 16 x 18 m coordinates, so it was teleporting the player into the walls and
   * calling the result "reachable". Reading the live zones makes drift impossible.
   */
  public list(): Array<{ id: string; name: string; x: number; z: number; radius: number }> {
    return [...this.zones.values()].map((zone) => ({
      id: zone.id,
      name: zone.name,
      x: zone.position.x,
      z: zone.position.z,
      radius: zone.radius,
    }));
  }

  public update(delta: number, player: ArcadePlayer, stack: MedicineStack): void {
    // Update pulsing rings
    for (const zone of this.zones.values()) {
      zone.update(delta, player.position);
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
