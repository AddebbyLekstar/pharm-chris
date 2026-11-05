import * as THREE from 'three';

export interface FloatingTextItem {
  element?: HTMLElement;
  text: string;
  position: THREE.Vector3;
  color: string;
  lifetime: number;
  maxLifetime: number;
}

export class ArcadeJuice {
  public shakeIntensity: number = 0;
  public shakeDecay: number = 2.5;
  public shakeOffset: THREE.Vector3 = new THREE.Vector3();
  private container: HTMLElement | null = null;
  private floatingTexts: FloatingTextItem[] = [];

  constructor(container?: HTMLElement) {
    this.container = container ?? null;
  }

  public attach(container: HTMLElement): void {
    this.container = container;
  }

  public triggerScreenShake(intensity: number = 0.25): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch (e) {
        // Ignore vibration failure
      }
    }
  }

  public spawnFloatingText(text: string, worldPos: THREE.Vector3, color: string = '#00E676'): void {
    let el: HTMLElement | undefined;
    if (this.container && typeof document !== 'undefined') {
      el = document.createElement('div');
      el.className = 'arcade-floating-text';
      el.textContent = text;
      el.style.position = 'absolute';
      el.style.color = color;
      el.style.fontWeight = '900';
      el.style.fontSize = '1.25rem';
      el.style.textShadow = '0 2px 8px rgba(0,0,0,0.8), 0 0 12px ' + color;
      el.style.pointerEvents = 'none';
      el.style.zIndex = '500';
      el.style.transition = 'transform 0.8s ease-out, opacity 0.8s ease-out';
      el.style.left = '50%';
      el.style.top = '40%';
      el.style.transform = 'translate(-50%, -50%)';
      this.container.appendChild(el);

      setTimeout(() => {
        if (el) {
          el.style.transform = 'translate(-50%, -120px) scale(1.15)';
          el.style.opacity = '0';
        }
      }, 20);

      setTimeout(() => {
        if (el && el.parentElement) {
          el.parentElement.removeChild(el);
        }
      }, 850);
    }

    this.floatingTexts.push({
      element: el,
      text,
      position: worldPos.clone(),
      color,
      lifetime: 0,
      maxLifetime: 0.85,
    });
  }

  public update(delta: number): void {
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - delta * this.shakeDecay);
      const rx = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      const ry = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      const rz = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeOffset.set(rx, ry, rz);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const item = this.floatingTexts[i];
      item.lifetime += delta;
      if (item.lifetime >= item.maxLifetime) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }
}
