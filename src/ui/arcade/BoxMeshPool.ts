import * as THREE from 'three';

export class BoxMeshPool {
  private pool: THREE.Mesh[] = [];
  private geo: THREE.BoxGeometry;
  private defaultMat: THREE.MeshStandardMaterial;
  private matCache: Map<string, THREE.MeshStandardMaterial> = new Map();

  constructor(initialSize: number = 20) {
    this.geo = new THREE.BoxGeometry(0.55, 0.22, 0.38);
    this.defaultMat = new THREE.MeshStandardMaterial({
      color: 0x43a047,
      roughness: 0.4,
    });

    for (let i = 0; i < initialSize; i++) {
      const mesh = new THREE.Mesh(this.geo, this.defaultMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.pool.push(mesh);
    }
  }

  public get availableCount(): number {
    return this.pool.length;
  }

  public acquire(colorOrCat: string): THREE.Mesh {
    let mesh: THREE.Mesh;
    if (this.pool.length > 0) {
      mesh = this.pool.pop()!;
    } else {
      mesh = new THREE.Mesh(this.geo, this.defaultMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    const colorHex = this.resolveColor(colorOrCat);
    if (!this.matCache.has(colorHex)) {
      this.matCache.set(
        colorHex,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorHex),
          roughness: 0.35,
        })
      );
    }
    mesh.material = this.matCache.get(colorHex)!;
    mesh.visible = true;
    mesh.rotation.set(0, 0, 0);
    return mesh;
  }

  public release(mesh: THREE.Mesh): void {
    mesh.visible = false;
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    this.pool.push(mesh);
  }

  private resolveColor(colorOrCat: string): string {
    if (colorOrCat.startsWith('#')) return colorOrCat;
    switch (colorOrCat.toLowerCase()) {
      case 'antimalarial':
        return '#E53935';
      case 'analgesic':
        return '#43A047';
      case 'antibiotic':
        return '#1E88E5';
      case 'cold_chain':
      case 'chronic':
        return '#00ACC1';
      default:
        return '#FB8C00';
    }
  }
}
