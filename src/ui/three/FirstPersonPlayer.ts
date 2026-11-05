import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export interface InteractionTarget {
  type: 'shutter' | 'product_shelf' | 'product_held' | 'register' | 'pos' | 'delivery_crate' | 'ledger' | 'customer';
  id?: string;
  object: THREE.Object3D;
  point?: THREE.Vector3;
  distance: number;
  promptText: string;
  data?: any;
}

export class FirstPersonPlayer {
  public camera: THREE.PerspectiveCamera;
  public controls: PointerLockControls;
  public moveSpeed = 3.8;
  public isLocked = false;

  // Movement vectors and keys
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private isSprinting = false;
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();

  // Collision bounding box [minX, maxX, minZ, maxZ]
  // Room bounds: X [-4.5, 4.5], Z [-5.2, 5.2]
  // Counter obstacle: X [-3.5, 3.5], Z [-0.6, 0.8]
  private counterBounds = new THREE.Box3(
    new THREE.Vector3(-3.4, 0, -0.7),
    new THREE.Vector3(3.4, 2.5, 0.8)
  );

  // Raycasting for interaction
  public raycaster = new THREE.Raycaster();
  public currentTarget: InteractionTarget | null = null;
  public maxReach = 2.8;

  // In-hand item socket (child of camera)
  public heldItemSocket: THREE.Group;
  public heldItem: THREE.Object3D | null = null;
  public isInspectingHeldItem = false;

  constructor(domElement: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 50);
    // Initial player position: standing in front of the counter facing the shop entrance
    this.camera.position.set(0, 1.68, 2.8);

    this.controls = new PointerLockControls(this.camera, domElement);

    // Held item socket positioned in bottom right of view
    this.heldItemSocket = new THREE.Group();
    this.heldItemSocket.position.set(0.28, -0.22, -0.48);
    this.camera.add(this.heldItemSocket);

    this.bindKeyboard();
  }

  private bindKeyboard(): void {
    this.controls.addEventListener('lock', () => {
      this.isLocked = true;
    });

    this.controls.addEventListener('unlock', () => {
      this.isLocked = false;
      this.moveForward = false;
      this.moveBackward = false;
      this.moveLeft = false;
      this.moveRight = false;
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isLocked) return;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.isSprinting = true;
          break;
        case 'KeyF':
          // Toggle close-up inspect of held item
          if (this.heldItem) {
            this.toggleInspectHeldItem();
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.isSprinting = false;
          break;
      }
    });
  }

  public attachHeldItem(itemGroup: THREE.Object3D): void {
    if (this.heldItem) {
      this.heldItemSocket.remove(this.heldItem);
    }
    this.heldItem = itemGroup;
    this.heldItem.position.set(0, 0, 0);
    this.heldItem.rotation.set(0.1, -0.2, 0);
    this.heldItem.scale.set(0.85, 0.85, 0.85);
    this.heldItemSocket.position.set(0.28, -0.22, -0.48);
    this.heldItemSocket.add(this.heldItem);
    this.isInspectingHeldItem = false;
  }

  public detachHeldItem(): THREE.Object3D | null {
    if (!this.heldItem) return null;
    const item = this.heldItem;
    this.heldItemSocket.remove(item);
    this.heldItem = null;
    this.isInspectingHeldItem = false;
    return item;
  }

  public toggleInspectHeldItem(): void {
    if (!this.heldItem) return;
    this.isInspectingHeldItem = !this.isInspectingHeldItem;

    if (this.isInspectingHeldItem) {
      // Move to center of screen for detailed inspection
      this.heldItemSocket.position.set(0, 0, -0.35);
      this.heldItem.rotation.set(0, 0, 0);
      this.heldItem.scale.set(1.1, 1.1, 1.1);
    } else {
      // Return to resting held hand position
      this.heldItemSocket.position.set(0.28, -0.22, -0.48);
      this.heldItem.rotation.set(0.1, -0.2, 0);
      this.heldItem.scale.set(0.85, 0.85, 0.85);
    }
  }

  public update(delta: number, interactableObjects: THREE.Object3D[]): void {
    if (this.isLocked) {
      // Damping velocity
      this.velocity.x -= this.velocity.x * 10.0 * delta;
      this.velocity.z -= this.velocity.z * 10.0 * delta;

      this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
      this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
      this.direction.normalize();

      const currentSpeed = (this.isSprinting ? this.moveSpeed * 1.6 : this.moveSpeed) * 32.0;

      if (this.moveForward || this.moveBackward) {
        this.velocity.z -= this.direction.z * currentSpeed * delta;
      }
      if (this.moveLeft || this.moveRight) {
        this.velocity.x -= this.direction.x * currentSpeed * delta;
      }

      // Calculate proposed movement
      const moveX = -this.velocity.x * delta;
      const moveZ = -this.velocity.z * delta;

      const prevPos = this.camera.position.clone();

      this.controls.moveRight(moveX);
      this.controls.moveForward(moveZ);

      // Keep player at constant eye level (prevent floating/falling)
      this.camera.position.y = 1.68;

      // Room Boundary Collision
      this.camera.position.x = Math.max(-4.2, Math.min(4.2, this.camera.position.x));
      this.camera.position.z = Math.max(-5.0, Math.min(5.0, this.camera.position.z));

      // Counter Obstacle Collision (allow walkway around sides X < -3.3 or X > 3.3)
      if (this.counterBounds.containsPoint(this.camera.position)) {
        // Revert to previous position
        this.camera.position.copy(prevPos);
      }
    }

    // Center-screen raycasting for interactive items
    this.updateInteractionRaycast(interactableObjects);
  }

  private updateInteractionRaycast(interactables: THREE.Object3D[]): void {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObjects(interactables, true);

    this.currentTarget = null;

    for (const hit of hits) {
      if (hit.distance > this.maxReach) continue;

      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData?.interactionType) {
          this.currentTarget = {
            type: obj.userData.interactionType,
            id: obj.userData.id,
            object: obj,
            point: hit.point,
            distance: hit.distance,
            promptText: obj.userData.promptText || 'Interact',
            data: obj.userData,
          };
          return;
        }
        obj = obj.parent;
      }
    }
  }
}
