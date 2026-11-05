import * as THREE from 'three';
import { Product } from '../../sim/types';

export interface BoxTextureSet {
  front: THREE.CanvasTexture;
  back: THREE.CanvasTexture;
  top: THREE.CanvasTexture;
  bottom: THREE.CanvasTexture;
  left: THREE.CanvasTexture;
  right: THREE.CanvasTexture;
  scratchCanvas?: HTMLCanvasElement;
  scratchTexture?: THREE.CanvasTexture;
  masCode?: string;
  isScratched?: boolean;
}

/**
 * Procedurally generates high-resolution textures for 3D medicine boxes
 * with authentic Nigerian pharmacy typography, NAFDAC / Agency numbers,
 * batch codes, expiry dates, holograms, and interactive MAS scratch panels.
 */
export class MedicineTextureGenerator {
  /**
   * Generate a 6-sided texture set for a product carton
   */
  public static generateCartonTextures(
    product: Product,
    batchNumber = '#OK-902',
    cartonExpiry = '11/2028',
    masCode = '3892-0192-88',
    isCounterfeit = false
  ): BoxTextureSet {
    const baseColor = product.pixelColor || '#329663';
    const darkColor = this.shadeColor(baseColor, -35);

    const front = this.createFrontTexture(product, baseColor, darkColor, isCounterfeit);
    const { texture: back, scratchCanvas, scratchTexture } = this.createBackTexture(
      product,
      baseColor,
      masCode,
      isCounterfeit
    );
    const top = this.createTopTexture(product, cartonExpiry);
    const bottom = this.createBottomTexture(product, batchNumber);
    const left = this.createSideTexture(product, baseColor, 'STORAGE & DOSAGE');
    const right = this.createSideTexture(product, baseColor, 'ACTIVE INGREDIENTS');

    return {
      front,
      back,
      top,
      bottom,
      left,
      right,
      scratchCanvas,
      scratchTexture,
      masCode,
      isScratched: false,
    };
  }

  private static createFrontTexture(
    product: Product,
    baseColor: string,
    darkColor: string,
    isCounterfeit: boolean
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 700;
    const ctx = canvas.getContext('2d')!;

    // Clean clinical box gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 700);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.35, '#F9FAF9');
    grad.addColorStop(0.38, baseColor);
    grad.addColorStop(1, darkColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 700);

    // Subtle diagonal geometric pattern on colored half
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 3;
    for (let i = -700; i < 1200; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 260);
      ctx.lineTo(i + 400, 700);
      ctx.stroke();
    }

    // Top Header: RX / OTC Status & Category
    ctx.fillStyle = '#444444';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(product.requiresPrescription ? 'PRESCRIPTION ONLY (Rx)' : 'OTC PHARMACY SALE', 32, 48);

    ctx.fillStyle = '#777777';
    ctx.font = '16px sans-serif';
    ctx.fillText(product.category.toUpperCase(), 32, 76);

    // Green Cross Pharmacy Icon
    this.drawGreenCross(ctx, 440, 50, 24);

    // Brand Name
    ctx.fillStyle = '#111111';
    ctx.font = '900 38px sans-serif';
    ctx.fillText(product.name, 32, 140);

    // Subtitle / Dosage Description
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(product.unitDescription, 32, 180);

    // Divider line
    ctx.fillStyle = baseColor;
    ctx.fillRect(32, 205, 448, 5);

    // Symptom Tags
    ctx.fillStyle = '#555555';
    ctx.font = 'italic 16px sans-serif';
    const tags = product.symptomTags.slice(0, 3).map((t) => t.replace('_', ' ')).join(' • ');
    ctx.fillText(`Indication: ${tags}`, 32, 240);

    // Lower half details (on colored background)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('LAGOS PHARMACEUTICAL SPEC', 32, 330);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '18px sans-serif';
    ctx.fillText('Guaranteed Therapeutic Purity', 32, 365);

    // Hologram Seal
    this.drawHologramSeal(ctx, 380, 360, 48, isCounterfeit);

    // Regulatory accreditation
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(isCounterfeit ? 'AGENCY REG NO: 04-9912 (SUSPECT)' : 'AGENCY APPROVED • NAFDAC AUTH', 32, 480);

    // Security Foil / MAS Badge
    if (product.hasMasScratchCode) {
      ctx.fillStyle = '#FFE600';
      ctx.fillRect(32, 510, 448, 48);
      ctx.fillStyle = '#000000';
      ctx.font = '900 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('★ AUTHENTIC MOBILE AUTHENTICATION (MAS) ★', 256, 540);
      ctx.textAlign = 'left';
    }

    // Bottom Corporate Banner
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 620, 512, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('DISTRIBUTED BY OKONKWO PHARMA MERCHANTS', 32, 655);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#CCCCCC';
    ctx.fillText('ORILE-KOKA DISTRICT • LAGOS NIGERIA', 32, 680);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private static createBackTexture(
    product: Product,
    baseColor: string,
    masCode: string,
    isCounterfeit: boolean
  ): { texture: THREE.CanvasTexture; scratchCanvas?: HTMLCanvasElement; scratchTexture?: THREE.CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 700;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#F4F5F4';
    ctx.fillRect(0, 0, 512, 700);

    // Header band
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 60);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`${product.name.toUpperCase()} — DRUG FACTS`, 24, 38);

    // Dosage & Administration
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('DOSAGE & DIRECTIONS:', 24, 100);

    ctx.fillStyle = '#444444';
    ctx.font = '15px sans-serif';
    ctx.fillText('• Adults: 1 to 2 units every 8 hours with clean water.', 24, 130);
    ctx.fillText('• Complete prescribed regimen even if symptoms resolve.', 24, 155);
    ctx.fillText('• Not for infants unless advised by certified physician.', 24, 180);

    // Warning Box
    ctx.fillStyle = '#FFF2F2';
    ctx.fillRect(24, 210, 464, 90);
    ctx.strokeStyle = '#D13438';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 210, 464, 90);

    ctx.fillStyle = '#B82020';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('⚠ CONTRAINDICATIONS & WARNINGS:', 36, 238);
    ctx.fillStyle = '#444444';
    ctx.font = '14px sans-serif';
    ctx.fillText('If symptoms persist past 3 days, visit clinic immediately.', 36, 265);
    ctx.fillText('Store in a cool dry place below 30°C. Protect from moisture.', 36, 288);

    // MAS SCRATCH PANEL SECTION
    let scratchCanvas: HTMLCanvasElement | undefined;
    let scratchTexture: THREE.CanvasTexture | undefined;

    if (product.hasMasScratchCode) {
      ctx.fillStyle = '#E8F5E9';
      ctx.fillRect(24, 330, 464, 190);
      ctx.strokeStyle = '#2E7D32';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 330, 464, 190);

      ctx.fillStyle = '#1B5E20';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('AGENCY VERIFICATION (SMS 38353)', 40, 362);

      ctx.fillStyle = '#333333';
      ctx.font = '14px sans-serif';
      ctx.fillText('Scratch silver panel below and SMS 10-digit PIN to 38353 for free verification.', 40, 390);

      // Underneath revealing code
      ctx.fillStyle = '#000000';
      ctx.fillRect(50, 415, 412, 65);
      ctx.fillStyle = '#00FF66';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(masCode, 256, 458);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#555555';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(isCounterfeit ? 'STATUS: MULTIPLE PINS DETECTED' : 'STATUS: AUTHENTIC NAFDAC BATCH', 40, 505);

      // Create dynamic scratch texture overlay
      scratchCanvas = document.createElement('canvas');
      scratchCanvas.width = 412;
      scratchCanvas.height = 65;
      const sCtx = scratchCanvas.getContext('2d')!;
      // Silver foil coating
      const sGrad = sCtx.createLinearGradient(0, 0, 412, 65);
      sGrad.addColorStop(0, '#B0B0B0');
      sGrad.addColorStop(0.25, '#E0E0E0');
      sGrad.addColorStop(0.5, '#A0A0A0');
      sGrad.addColorStop(0.75, '#D5D5D5');
      sGrad.addColorStop(1, '#909090');
      sCtx.fillStyle = sGrad;
      sCtx.fillRect(0, 0, 412, 65);

      // Security microprint
      sCtx.fillStyle = 'rgba(0,0,0,0.2)';
      sCtx.font = 'bold 11px monospace';
      for (let y = 16; y < 65; y += 18) {
        sCtx.fillText('SCRATCH GENTLY • NAFDAC MAS AUTHENTICATION • ', 10, y);
      }

      scratchTexture = new THREE.CanvasTexture(scratchCanvas);
      scratchTexture.colorSpace = THREE.SRGBColorSpace;
    }

    // Barcode & Manufacturer Info at bottom
    this.drawBarcode(ctx, 40, 560, 240, 80);

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('PRIME STAR PHARM LTD', 300, 575);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#666666';
    ctx.fillText('Industrial Area, Ikeja', 300, 595);
    ctx.fillText('Lagos State, Nigeria', 300, 615);
    ctx.fillText('Toll-Free: 0800-PHARM', 300, 635);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, scratchCanvas, scratchTexture };
  }

  private static createTopTexture(product: Product, cartonExpiry: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 512, 200);

    // Tamper evident seal across flap
    ctx.fillStyle = '#D49826';
    ctx.fillRect(0, 85, 512, 30);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★ SECURITY SEAL — DO NOT ACCEPT IF BROKEN ★', 256, 106);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#111111';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(product.name, 24, 50);

    ctx.fillStyle = '#444444';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`EXP: ${cartonExpiry}`, 24, 160);
    ctx.fillText('MFG: 01/2024', 300, 160);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private static createBottomTexture(product: Product, batchNumber: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#EEEEEE';
    ctx.fillRect(0, 0, 512, 200);

    this.drawBarcode(ctx, 32, 30, 260, 90);

    ctx.fillStyle = '#000000';
    ctx.font = '900 24px monospace';
    ctx.fillText(`BATCH: ${batchNumber}`, 32, 160);

    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#D13438';
    ctx.fillText(`M.R.P. ₦${product.baseRetail.toLocaleString()}`, 320, 160);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private static createSideTexture(product: Product, baseColor: string, title: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 700;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 256, 700);

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 50);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 128, 32);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(product.name, 20, 100);

    ctx.fillStyle = '#666666';
    ctx.font = '14px sans-serif';
    ctx.fillText(product.unitDescription, 20, 130);

    // Storage symbol glyphs
    ctx.fillStyle = '#EEEEEE';
    ctx.fillRect(20, 170, 216, 120);
    ctx.strokeStyle = '#CCCCCC';
    ctx.strokeRect(20, 170, 216, 120);

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('STORAGE CONDITIONS:', 30, 195);
    ctx.font = '12px sans-serif';
    ctx.fillText(product.isColdChain ? 'KEEP REFRIGERATED (2°-8°C)' : 'STORE IN DRY AMBIENT (<30°C)', 30, 220);
    ctx.fillText('DO NOT FREEZE', 30, 245);
    ctx.fillText('PROTECT FROM SUNLIGHT', 30, 270);

    // NAFDAC stamp
    ctx.strokeStyle = '#329663';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 330, 216, 70);
    ctx.fillStyle = '#329663';
    ctx.font = '900 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NAFDAC VERIFIED', 128, 360);
    ctx.font = 'bold 12px monospace';
    ctx.fillText('LAGOS ZONE 1', 128, 382);
    ctx.textAlign = 'left';

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private static drawGreenCross(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.fillStyle = '#329663';
    const third = size / 3;
    ctx.fillRect(x - third / 2, y - size / 2, third, size);
    ctx.fillRect(x - size / 2, y - third / 2, size, third);
  }

  private static drawHologramSeal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    isCounterfeit: boolean
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();

    const hGrad = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    if (isCounterfeit) {
      // Dull, off-color fake hologram
      hGrad.addColorStop(0, '#888888');
      hGrad.addColorStop(0.5, '#AAAAAA');
      hGrad.addColorStop(1, '#666666');
    } else {
      // Authentic iridescent hologram shimmer
      hGrad.addColorStop(0, '#FF80BF');
      hGrad.addColorStop(0.2, '#FFE066');
      hGrad.addColorStop(0.4, '#70FFAF');
      hGrad.addColorStop(0.6, '#66E0FF');
      hGrad.addColorStop(0.8, '#B880FF');
      hGrad.addColorStop(1, '#FF80BF');
    }
    ctx.fillStyle = hGrad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GENUINE', x, y - 5);
    ctx.fillText('PRODUCT', x, y + 12);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  private static drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000000';

    let curX = x + 8;
    const barHeight = h - 24;
    while (curX < x + w - 16) {
      const barWidth = Math.random() > 0.4 ? 2 : 5;
      const gap = Math.random() > 0.5 ? 2 : 4;
      ctx.fillRect(curX, y + 6, barWidth, barHeight);
      curX += barWidth + gap;
    }

    ctx.font = 'bold 12px monospace';
    ctx.fillText('0 72918 39201 4', x + 12, y + h - 4);
  }

  private static shadeColor(color: string, percent: number): string {
    let num = parseInt(color.replace('#', ''), 16);
    if (isNaN(num)) num = 0x329663;
    const amt = Math.round(2.55 * percent);
    const B = (num & 0x0000ff) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const R = (num >> 16) + amt;
    return `#${(
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)}`;
  }
}
