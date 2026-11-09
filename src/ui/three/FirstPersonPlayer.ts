import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { DeliveryCrate3D } from './DeliveryCrate3D';

export interface InteractionTarget {
  type:
    | 'shutter'
    | 'product_shelf'
    | 'product_held'
    | 'register'
    | 'pos'
    | 'delivery_crate'
    | 'ledger'
    | 'customer'
    | 'dumpster'
    | 'management_pc'
    | 'shelf_slot'
    | 'scanner'
    | 'counter_item'
    | 'curb_pallet'
    | 'naira_bill';
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
  public isTouchMode = false;
  public touchMoveVector = new THREE.Vector2(0, 0);

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

  // Two-handed socket for large delivery crates (bottom center)
  public crateSocket: THREE.Group;
  public carriedCrate: DeliveryCrate3D | null = null;
  public shutterOpen = false;

  constructor(domElement: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 50);
    // Initial player position: standing in front of the counter facing the shop entrance
    this.camera.position.set(0, 1.68, 2.8);

    this.controls = new PointerLockControls(this.camera, domElement);

    // Held item socket positioned in bottom right of view
    this.heldItemSocket = new THREE.Group();
    this.heldItemSocket.position.set(0.28, -0.22, -0.48);
    this.camera.add(this.heldItemSocket);

    // Two-handed crate socket (low center)
    this.crateSocket = new THREE.Group();
    this.crateSocket.position.set(0, -0.32, -0.55);
    this.camera.add(this.crateSocket);

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
    if (this.carriedCrate) {
      this.detachCrate();
    }
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

  public attachCrate(crate: DeliveryCrate3D): void {
    if (this.heldItem) {
      this.detachHeldItem();
    }
    if (this.carriedCrate) {
      this.detachCrate();
    }
    this.carriedCrate = crate;
    crate.group.position.set(0, 0, 0);
    crate.group.rotation.set(0.08, 0, 0);
    crate.group.scale.set(0.75, 0.75, 0.75);
    this.crateSocket.add(crate.group);
  }

  public detachCrate(): DeliveryCrate3D | null {
    if (!this.carriedCrate) return null;
    const crate = this.carriedCrate;
    this.crateSocket.remove(crate.group);
    crate.group.scale.set(1, 1, 1);
    this.carriedCrate = null;
    return crate;
  }

  public toggleInspectHeldItem(): void {
    if (!this.heldItem) return;
    this.isInspectingHeldItem = !this.isInspectingHeldItem;

    if (this.isInspectingHeldItem) {
      // Move to center of screen for detailed inspection
      this.heldItemSocket.position.set(0, 0, -0.35);
      this.heldItemSocket.rotation.set(0, 0, 0);
      this.heldItem.scale.set(1.1, 1.1, 1.1);
    } else {
      // Return to resting held hand position
      this.heldItemSocket.position.set(0.28, -0.22, -0.48);
      this.heldItemSocket.rotation.set(0.1, -0.2, 0);
      this.heldItem.scale.set(0.85, 0.85, 0.85);
    }
  }

  public setTouchMove(x: number, y: number): void {
    this.touchMoveVector.set(x, y);
  }

  public rotateView(deltaX: number, deltaY: number): void {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(this.camera.quaternion);
    const sensitivity = 0.0032;
    euler.y -= deltaX * sensitivity;
    euler.x -= deltaY * sensitivity;
    const maxPitch = Math.PI / 2 - 0.05;
    euler.x = Math.max(-maxPitch, Math.min(maxPitch, euler.x));
    this.camera.quaternion.setFromEuler(euler);
  }

  public update(delta: number, interactableObjects: THREE.Object3D[]): void {
    if (this.isLocked || this.isTouchMode) {
      // Damping velocity
      this.velocity.x -= this.velocity.x * 10.0 * delta;
      this.velocity.z -= this.velocity.z * 10.0 * delta;

      let dirX = Number(this.moveRight) - Number(this.moveLeft);
      let dirZ = Number(this.moveForward) - Number(this.moveBackward);

      // Integrate virtual touch joystick if active
      if (this.touchMoveVector.lengthSq() > 0.01) {
        dirX = this.touchMoveVector.x;
        dirZ = -this.touchMoveVector.y; // forward push (negative Y) maps to forward translation
      }

      this.direction.set(dirX, 0, dirZ);
      if (this.direction.lengthSq() > 0) {
        this.direction.normalize();
      }

      // 15% inertia penalty when carrying a heavy delivery crate
      const carryPenalty = this.carriedCrate ? 0.85 : 1.0;
      const baseSpeed = this.moveSpeed * carryPenalty;
      const currentSpeed = (this.isSprinting ? baseSpeed * 1.55 : baseSpeed) * 32.0;

      if (this.moveForward || this.moveBackward || Math.abs(this.direction.z) > 0.01) {
        this.velocity.z -= this.direction.z * currentSpeed * delta;
      }
      if (this.moveLeft || this.moveRight || Math.abs(this.direction.x) > 0.01) {
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

      // Handle Room bounds + Walkway through open shutter into outdoor street
      const currentZ = this.camera.position.z;
      if (currentZ > 5.5) {
        // Outside in street or doorway
        if (!this.shutterOpen && currentZ > 5.6 && prevPos.z <= 5.6) {
          // Blocked by closed shutter
          this.camera.position.z = 5.55;
        } else {
          // Outdoor street bounds
          this.camera.position.x = Math.max(-7.0, Math.min(7.0, this.camera.position.x));
          this.camera.position.z = Math.min(11.5, this.camera.position.z);
        }
      } else {
        // Inside pharmacy room bounds
        this.camera.position.x = Math.max(-4.4, Math.min(4.4, this.camera.position.x));
        this.camera.position.z = Math.max(-5.2, this.camera.position.z);
      }

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
    if (!this.camera || !interactables) return;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const valid = interactables.filter((obj) => obj && (obj as any).layers && (obj as any).isObject3D);
    const hits = this.raycaster.intersectObjects(valid, true);

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
