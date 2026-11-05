import { Customer, Product } from '../../sim/types';
import { PharmChrisEngine } from '../../sim/engine';

export interface DialogueModalOpenOptions {
  customer: Customer;
  engine: PharmChrisEngine;
  onComplete: (result: { success: boolean; cashEarned: number; productServed?: Product }) => void;
}

export class DialogueModal {
  public isOpen: boolean = false;
  private container: HTMLElement | null = null;
  private modalEl: HTMLElement | null = null;
  private currentCustomer: Customer | null = null;
  public engine: PharmChrisEngine | null = null;
  private onCompleteCallback: ((res: any) => void) | null = null;
  private offeredPrice: number = 0;
  private selectedProduct: Product | null = null;

  public mount(container: HTMLElement): void {
    this.container = container;
    this.buildModalDom();
  }

  private buildModalDom(): void {
    if (typeof document === 'undefined') return;

    const modal = document.createElement('div');
    modal.className = 'arcade-dialogue-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.backgroundColor = 'rgba(10, 16, 13, 0.85)';
    modal.style.backdropFilter = 'blur(6px)';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    modal.style.padding = '16px';

    const card = document.createElement('div');
    card.className = 'arcade-dialogue-card';
    card.style.width = '100%';
    card.style.maxWidth = '460px';
    card.style.background = '#1b2621';
    card.style.border = '2px solid #00E676';
    card.style.borderRadius = '16px';
    card.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.6)';
    card.style.color = '#fff';
    card.style.fontFamily = 'system-ui, sans-serif';
    card.style.overflow = 'hidden';

    modal.appendChild(card);
    this.modalEl = modal;
    if (this.container) {
      this.container.appendChild(modal);
    }
  }

  public open(options: DialogueModalOpenOptions): void {
    this.isOpen = true;
    this.currentCustomer = options.customer;
    this.engine = options.engine;
    this.onCompleteCallback = options.onComplete;

    const matchedId = options.customer.matchedProductIds[0];
    this.selectedProduct = options.engine.getAllProducts().find((p) => p.id === matchedId) || options.engine.getAllProducts()[0];
    this.offeredPrice = this.selectedProduct ? this.selectedProduct.baseRetail : 1000;

    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
      this.renderCardContent();
    }
  }

  public getOfferedPrice(): number {
    return this.offeredPrice;
  }

  private renderCardContent(): void {
    if (!this.modalEl || !this.currentCustomer) return;
    const card = this.modalEl.querySelector('.arcade-dialogue-card') as HTMLElement;
    if (!card) return;

    card.innerHTML = `
      <div style="background: #111a16; padding: 16px 20px; border-bottom: 1px solid #2a3c33; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; color: #00E676; font-weight: 700;">${this.currentCustomer.name}</h3>
          <div style="font-size: 0.8rem; color: #a4b3ac; margin-top: 2px;">${this.currentCustomer.title}</div>
        </div>
        <span style="background: #2e3d36; color: #ffeb3b; padding: 4px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 600;">
          Budget: ₦${this.currentCustomer.budget}
        </span>
      </div>

      <div style="padding: 20px;">
        <div style="background: #22312a; border-left: 4px solid #ff9800; padding: 12px 14px; border-radius: 6px; font-style: italic; font-size: 0.92rem; line-height: 1.4; color: #e1ede6; margin-bottom: 18px;">
          "${this.currentCustomer.initialQuote}"
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 0.75rem; text-transform: uppercase; color: #8fa39a; margin-bottom: 6px; letter-spacing: 0.5px;">Product Selected</div>
          <div style="background: #151e1a; padding: 10px 14px; border-radius: 8px; border: 1px solid #2b3a32; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; font-size: 0.95rem;">${this.selectedProduct?.name}</span>
            <span style="color: #00e676; font-weight: 700;">₦${this.offeredPrice}</span>
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 20px;">
          <button id="btn-modal-accept" style="flex: 1; padding: 12px; border-radius: 8px; background: #00E676; color: #0c1a13; border: none; font-weight: bold; cursor: pointer;">
            Dispense & Collect ₦${this.offeredPrice}
          </button>
          <button id="btn-modal-discount" style="padding: 12px 16px; border-radius: 8px; background: #2f4037; color: #ffd54f; border: 1px solid #476153; font-weight: 600; cursor: pointer;">
            Cut Price
          </button>
        </div>
      </div>
    `;

    const btnAccept = card.querySelector('#btn-modal-accept');
    const btnDiscount = card.querySelector('#btn-modal-discount');

    btnDiscount?.addEventListener('click', () => {
      this.offeredPrice = Math.max(100, Math.floor(this.offeredPrice * 0.8));
      this.renderCardContent();
    });

    btnAccept?.addEventListener('click', () => {
      const earned = Math.min(this.currentCustomer?.budget ?? this.offeredPrice, this.offeredPrice);
      this.close();
      if (this.onCompleteCallback) {
        this.onCompleteCallback({
          success: true,
          cashEarned: earned,
          productServed: this.selectedProduct,
        });
      }
    });
  }

  public close(): void {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }
}
