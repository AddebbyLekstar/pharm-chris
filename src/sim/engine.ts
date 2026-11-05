import rawProducts from '../content/products.json';
import { CUSTOMERS_ROSTER } from './customers';
import { Mulberry32 } from './prng';
import {
  Customer,
  Day1Phase,
  DeliveryAction,
  DeliveryCrate,
  DeliveryResolutionResult,
  GameState,
  MasVerificationResponse,
  Product,
  SupplierChoice,
  TransactionAttempt,
  TransactionResult,
  AgencyRaidResult,
  EndgameReport,
  FastSimPolicy,
  InspectionAuditArea,
  InspectionDefectType,
  InspectionOptions,
  InspectionResult,
  MacroeconomicShock,
  SeasonMilestoneEvent,
} from './types';
import { evaluateEndgame } from './endgame';

export const PRODUCTS: Product[] = rawProducts as Product[];
export const PRODUCTS_MAP = new Map<string, Product>(
  PRODUCTS.map((p) => [p.id, p])
);

export const INITIAL_GAME_STATE: GameState = {
  saveVersion: 1,
  seed: 19980812,
  day: 1,
  daysRemaining: 90,
  cash: 150000,
  trust: 50,
  debt: 4200000,
  inventory: {
    prd_painaway_500: 24,
    prd_feverease_extra: 15,
    prd_malaguard_forte: 8,
    prd_coughcalm_elixir: 12,
    prd_stomacare_susp: 10,
    prd_kidease_paediatric: 10,
    prd_clavumed_625: 6,
    prd_bpsteady_5: 7,
    prd_wounda_seal: 14,
    prd_vitaboost_complex: 12,
    prd_chillvial_safe: 4,
  },
  quarantinedStock: {},
  clues: [],
  dailyScratchQuota: 3,
  time: '08:00 AM',
  currentCustomerIndex: 0,
  totalCustomersServed: 0,
  successfulSales: 0,
  reputationScore: 50,
  day1Phase: 'shutters',
  day1SupplierChoice: undefined,
  day1Stats: {
    mamaNgoziServed: false,
    emekaServed: false,
    ledgerOpened: false,
    cashEarned: 0,
  },
  activeDelivery: undefined,
  deliveryResolved: false,
  deliveryResolution: undefined,
  generatorFuel: 1,
  blackout: false,
  originalDebt: 4200000,
  seasonLength: 90,
  boardViolations: 0,
  isPremisesSealed: false,
  activeShocks: [],
  agencyRaidCompleted: false,
  milestonesTriggered: [],
  inspectionHistory: [],
};

/**
 * Core simulation engine. Zero UI / DOM dependencies.
 * Deterministic logic driven by Mulberry32 PRNG.
 */
export class PharmChrisEngine {
  private state: GameState;
  private prng: Mulberry32;

  constructor(initialState: GameState = INITIAL_GAME_STATE) {
    this.state = JSON.parse(JSON.stringify(initialState));
    this.prng = new Mulberry32(this.state.seed);
  }

  public getState(): Readonly<GameState> {
    return JSON.parse(JSON.stringify(this.state));
  }

  public addCash(amount: number): number {
    this.state.cash += Math.max(0, amount);
    return this.state.cash;
  }

  public deductCash(amount: number): boolean {
    if (this.state.cash >= amount) {
      this.state.cash -= amount;
      return true;
    }
    return false;
  }

  public getProduct(id: string): Product | undefined {
    return PRODUCTS_MAP.get(id);
  }

  public getAllProducts(): Product[] {
    return [...PRODUCTS];
  }

  public getStock(productId: string): number {
    return this.state.inventory[productId] ?? 0;
  }

  public getCurrentCustomer(): Customer {
    if (this.state.day1Phase === 'day_rush' && this.state.featuredQueue?.length) {
      return this.state.featuredQueue[this.state.currentCustomerIndex] ?? this.state.featuredQueue[this.state.featuredQueue.length - 1];
    }
    const idx = this.state.currentCustomerIndex % CUSTOMERS_ROSTER.length;
    return CUSTOMERS_ROSTER[idx];
  }

  public nextCustomer(): Customer {
    this.state.currentCustomerIndex += 1;
    return this.getCurrentCustomer();
  }

  /**
   * Calculate suggested fair band for a product
   * Fair markup: 15% to 35% on base cost (or 15% to 50% for broken unit dispensing)
   */
  public calculateFairBand(
    product: Product,
    fractionalUnits?: number
  ): { min: number; max: number; standard: number } {
    if (fractionalUnits && fractionalUnits > 0) {
      const unitsPerPack = product.unitsPerPack ?? (Math.max(1, Math.round(product.baseCost / (product.unitCost || 1))) || 10);
      const unitCost = product.unitCost ?? Math.round(product.baseCost / unitsPerPack);
      const unitRetail = product.unitRetail ?? Math.round(product.baseRetail / unitsPerPack);
      const totalCost = unitCost * fractionalUnits;
      const min = Math.round(totalCost * 1.15);
      const max = Math.round(totalCost * 1.50);
      const standard = unitRetail * fractionalUnits;
      return { min, max, standard };
    }

    const min = Math.round((product.baseCost * 115) / 100);
    const max = Math.round((product.baseCost * 135) / 100);
    const standard = product.baseRetail;
    return { min, max, standard };
  }

  /**
   * Resolve a counter transaction attempt
   */
  public executeTransaction(attempt: TransactionAttempt): TransactionResult {
    const customer = this.getCurrentCustomer();
    const product = this.getProduct(attempt.productId);

    if (!product) {
      throw new Error(`Product not found: ${attempt.productId}`);
    }

    const currentStock = this.getStock(product.id);
    const offeredPrice = Math.max(0, Math.round(attempt.offeredPrice));
    const isFractional = Boolean(attempt.isFractional && attempt.fractionalUnits && attempt.fractionalUnits > 0);
    const fractionalUnits = isFractional ? attempt.fractionalUnits! : undefined;

    // Check if unit dispensing is allowed on this product line
    if (isFractional && !product.fractionalAllowed) {
      return {
        success: false,
        customerDialogue: {
          speaker: customer.name,
          text: 'Ah! Chris! You cannot cut this medicine! Sell full course only!',
          tone: 'scolded',
        },
        tolaRemark: 'Tola: "Master, you cannot break blisters for this product. Unit dispensing is only permitted for allowed analgesics."',
        cashDelta: 0,
        trustDelta: -2,
        marginPercent: 0,
        isWithinFairBand: false,
        isOverpriced: false,
        isWrongProduct: true,
        isAboveBudget: false,
        isFractional: true,
        fractionalUnits,
        receiptNumber: `PC-${this.state.day}-${this.state.totalCustomersServed + 1}-ERR`,
      };
    }

    const unitsPerPack = product.unitsPerPack ?? (Math.max(1, Math.round(product.baseCost / (product.unitCost || 1))) || 10);
    const effectiveCost = isFractional
      ? (product.unitCost ?? Math.round(product.baseCost / unitsPerPack)) * (fractionalUnits || 1)
      : product.baseCost;

    const fairBand = this.calculateFairBand(product, fractionalUnits);

    const maxAllowedPrice = Math.max(fairBand.max, isFractional ? fairBand.max : product.baseRetail);
    const isMatchesSymptom = customer.matchedProductIds.includes(product.id);
    const isAboveBudget = offeredPrice > customer.budget;
    const isWithinFairBand = offeredPrice >= fairBand.min && offeredPrice <= maxAllowedPrice;
    const isOverpriced = offeredPrice > maxAllowedPrice;
    const isUnderpriced = offeredPrice < fairBand.min;

    const marginPercent = Math.round(((offeredPrice - effectiveCost) / effectiveCost) * 100);
    const receiptNumber = `PC-${this.state.day}-${this.state.totalCustomersServed + 1}-${Math.floor(this.prng.next() * 9000 + 1000)}`;

    // Check stock
    if (currentStock <= 0) {
      return {
        success: false,
        customerDialogue: {
          speaker: customer.name,
          text: `Ah! Chris! You don't have ${product.name} in stock? Don't tell me you ran out of medicine!`,
          tone: 'scolded',
        },
        tolaRemark: 'Tola: "Master, I warned you yesterday about re-ordering. Now Mama is looking at us like empty cupboard."',
        cashDelta: 0,
        trustDelta: -2,
        marginPercent,
        isWithinFairBand,
        isOverpriced,
        isWrongProduct: !isMatchesSymptom,
        isAboveBudget,
        isFractional,
        fractionalUnits,
        receiptNumber,
      };
    }

    // 1. Wrong Product Case
    if (!isMatchesSymptom) {
      const dialogueTpl = this.prng.choice(customer.dialogue.wrongProduct);
      this.state.trust = Math.max(0, this.state.trust - 5);
      this.state.totalCustomersServed += 1;

      return {
        success: false,
        customerDialogue: {
          speaker: customer.name,
          text: dialogueTpl,
          tone: 'furious',
        },
        tolaRemark: 'Tola sighs: "Master Chris... check the symptom tag next time before Mama Ngozi uses umbrella on us."',
        cashDelta: 0,
        trustDelta: -5,
        marginPercent,
        isWithinFairBand,
        isOverpriced,
        isWrongProduct: true,
        isAboveBudget,
        isFractional,
        fractionalUnits,
        receiptNumber,
      };
    }

    // 2. Budget exceeded
    if (isAboveBudget) {
      let dialogueTpl = this.prng.choice(customer.dialogue.exceedsBudget);
      dialogueTpl = dialogueTpl.replace('{budget}', customer.budget.toLocaleString()).replace('{price}', offeredPrice.toLocaleString());
      this.state.trust = Math.max(0, this.state.trust - 2);
      this.state.totalCustomersServed += 1;

      return {
        success: false,
        customerDialogue: {
          speaker: customer.name,
          text: dialogueTpl,
          tone: 'skeptical',
        },
        tolaRemark: 'Tola mutters: "Their pocket has a limit, Master. High price with no money inside wallet is zero transaction."',
        cashDelta: 0,
        trustDelta: -2,
        marginPercent,
        isWithinFairBand,
        isOverpriced,
        isWrongProduct: false,
        isAboveBudget: true,
        isFractional,
        fractionalUnits,
        receiptNumber,
      };
    }

    // 3. Overpriced price gouging pushback
    if (isOverpriced) {
      let dialogueTpl = this.prng.choice(customer.dialogue.overpriced);
      dialogueTpl = dialogueTpl.replace('{price}', offeredPrice.toLocaleString());
      this.state.trust = Math.max(0, this.state.trust - 4);
      this.state.totalCustomersServed += 1;

      return {
        success: false,
        customerDialogue: {
          speaker: customer.name,
          text: dialogueTpl,
          tone: 'scolded',
        },
        tolaRemark: 'Tola: "The margin meter went into red zone! If The Agency or neighborhood union hears this, our rating will crash."',
        cashDelta: 0,
        trustDelta: -4,
        marginPercent,
        isWithinFairBand: false,
        isOverpriced: true,
        isWrongProduct: false,
        isAboveBudget: false,
        isFractional,
        fractionalUnits,
        receiptNumber,
      };
    }

    // 4. Success transaction!
    if (isFractional) {
      const packFraction = Number(((fractionalUnits || 1) / unitsPerPack).toFixed(2));
      this.state.inventory[product.id] = Math.max(0, Number((this.state.inventory[product.id] - packFraction).toFixed(2)));
    } else {
      this.state.inventory[product.id] -= 1;
    }

    if (this.state.day1Phase !== 'day_rush') this.state.cash += offeredPrice;
    this.state.totalCustomersServed += 1;
    this.state.successfulSales += 1;
    this.state.day1Stats.cashEarned += offeredPrice;
    if (this.state.day1Phase === 'day_rush') {
      this.recordRushRevenue({ walkInRevenue: 0, walkInCost: 0, featuredRevenue: offeredPrice, featuredCost: effectiveCost });
      this.recordFollowUp({ customerName: customer.name, productId: product.id, counterfeit: Boolean(this.state.activeDelivery?.isFake && product.id === this.state.activeDelivery.productId) });
    }

    let trustGain = 2;
    if (customer.id === 'cust_mama_ngozi') {
      // Mama Ngozi First Sale rule: Trust +1
      trustGain = 1;
      this.state.day1Stats.mamaNgoziServed = true;
    } else if (customer.id === 'cust_emeka' || isFractional) {
      // Wallet Limit / Unit Dispensing rule: Trust +2 (Fitted to Wallet)
      trustGain = 2;
      this.state.day1Stats.emekaServed = true;
    } else if (isUnderpriced) {
      trustGain = 4;
    } else if (isWithinFairBand) {
      trustGain = 3;
    }

    this.state.trust = Math.min(100, this.state.trust + trustGain);
    this.state.reputationScore = Math.min(100, Math.round(this.state.trust * 0.8 + (this.state.successfulSales / Math.max(1, this.state.totalCustomersServed)) * 20));

    let successDialogueTpl = isFractional && customer.dialogue.fractionalOffer && customer.dialogue.fractionalOffer.length > 0
      ? this.prng.choice(customer.dialogue.fractionalOffer)
      : this.prng.choice(customer.dialogue.fairPrice);

    let tolaRemark = '';
    if (customer.id === 'cust_mama_ngozi') {
      tolaRemark = 'Tola whispers: "First sale in the bag under 40 seconds. Auntie Joke would be proud."';
    } else if (customer.id === 'cust_emeka' || isFractional) {
      tolaRemark = 'Tola: "Clean unit dispensing. Customer fitted to wallet and riding safe."';
    } else {
      tolaRemark = attempt.paymentMethod === 'pos_transfer'
        ? 'Tola: "POS beep confirmed! Network went through without endless pending spinning. God be praised."'
        : 'Tola smiles: "Crisp Naira notes in the drawer. Counted and verified!"';
    }

    return {
      success: true,
      customerDialogue: {
        speaker: customer.name,
        text: successDialogueTpl,
        tone: 'satisfied',
      },
      tolaRemark,
      cashDelta: offeredPrice,
      trustDelta: trustGain,
      marginPercent,
      isWithinFairBand,
      isOverpriced: false,
      isWrongProduct: false,
      isAboveBudget: false,
      isFractional,
      fractionalUnits,
      receiptNumber,
    };
  }

  public reset(seed = 19980812): void {
    this.state = JSON.parse(JSON.stringify(INITIAL_GAME_STATE));
    this.state.seed = seed;
    this.prng = new Mulberry32(seed);
  }

  public getPhase(): Day1Phase {
    return this.state.day1Phase;
  }

  public setPhase(phase: Day1Phase): void {
    this.state.day1Phase = phase;
  }

  public recordDay1Choice(choice: SupplierChoice): void {
    this.state.day1SupplierChoice = choice;
    this.state.day1Phase = 'day2_teaser';
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('pharm_chris_day1_choice', choice);
      } catch {
        // Ignore localStorage restrictions
      }
    }
  }

  public getDay1Choice(): SupplierChoice | undefined {
    return this.state.day1SupplierChoice;
  }

  public openLedger(): void {
    this.state.day1Stats.ledgerOpened = true;
    this.state.day1Phase = 'ledger';
  }

  public advanceToDay2Morning(): DeliveryCrate {
    this.state.day = 2;
    this.state.time = '08:00 AM';
    this.state.dailyScratchQuota = 3;
    this.state.day1Phase = 'day2_morning_arrival';

    const choice = this.state.day1SupplierChoice || 'dele';
    const crate = this.generateDeliveryCrate(choice);
    this.state.activeDelivery = crate;
    this.state.deliveryResolved = false;
    this.state.deliveryResolution = undefined;
    return crate;
  }

  public generateDeliveryCrate(choice: SupplierChoice): DeliveryCrate {
    if (choice === 'dele') {
      return {
        id: 'crate_dele_001',
        supplier: 'dele',
        supplierName: "Dele's Prime Star Distribution (Idumota Express)",
        courierDescription: 'Unmarked, muffler-rattling motorcycle courier with rope-tied cardboard crate',
        productId: 'prd_malaguard_forte',
        productName: 'Malaguard Forte (Artemether/Lumefantrine 80/480mg)',
        quantity: 20,
        unitPrice: 2200,
        totalCost: 44000,
        paymentTerms: 'cash_on_delivery',
        batchNumber: 'MG-204',
        cartonExpiry: '11/2028',
        blisterExpiry: '06/2026',
        batchMatches: false,
        tamperSeal: 'tampered',
        tamperSealDescription: 'Smudged adhesive tape, slight perforation tear along the edge with faint glue residue',
        agencyRegNumber: 'A4-9912',
        agencyRegWarning: "Wait... Auntie Joke's dispensary ledger marked Batch #MG-204 with three red exclamation marks!",
        masCode: '7482-9914-02',
        masScratched: false,
        scratchPercentage: 0,
        masResponse: {
          code: '7482-9914-02',
          isGenuine: false,
          status: 'duplicate_warning',
          smsMessage: 'WARNING [The Agency MAS 38353]: Code 7482991402 has already been verified 14 TIMES across 3 states. Counterfeit / cloned batch suspected! Do NOT dispense. Report vendor immediately to The Agency task force.',
          queryCount: 14,
        },
        invoice: {
          number: 'PS-SCRAP-09',
          hasFormalStamp: false,
          terms: 'Cash on Counter — No Returns',
          notes: 'Bros abeg settle the boy quick make him run before task force come.',
        },
        isFake: true,
      };
    } else {
      return {
        id: 'crate_okonkwo_001',
        supplier: 'okonkwo',
        supplierName: "Chief Okonkwo's Certified Phyto-Chemicals Ltd",
        courierDescription: 'Branded refrigerated delivery van, courier in spotless grey dustcoat with carbon invoice clipboard',
        productId: 'prd_malaguard_forte',
        productName: 'Malaguard Forte (Artemether/Lumefantrine 80/480mg)',
        quantity: 20,
        unitPrice: 3800,
        totalCost: 76000,
        paymentTerms: '14_day_credit',
        batchNumber: 'MG-881',
        cartonExpiry: '08/2028',
        blisterExpiry: '08/2028',
        batchMatches: true,
        tamperSeal: 'intact',
        tamperSealDescription: 'Intact tamper-evident holographic foil security sticker with registered serial & microprint',
        agencyRegNumber: 'A4-9912',
        agencyRegWarning: undefined,
        masCode: '3190-4821-65',
        masScratched: false,
        scratchPercentage: 0,
        masResponse: {
          code: '3190-4821-65',
          isGenuine: true,
          status: 'genuine',
          smsMessage: 'VALID [The Agency MAS 38353]: Genuine Malaguard Forte 80/480mg. Reg: A4-9912. Batch MG-881. Expiry 08/2028. First-time verification. Safe to dispense.',
          queryCount: 1,
        },
        invoice: {
          number: 'CO-INV-2026-441',
          hasFormalStamp: true,
          terms: '14-Day Net Credit — Bank Transfer / Cheque',
          notes: 'Chief Okonkwo certified cold-chain guarantee. Genuine documentation attached.',
        },
        isFake: false,
      };
    }
  }

  public scratchMasCode(amount = 25): { scratchPercentage: number; isRevealed: boolean } {
    if (!this.state.activeDelivery) {
      throw new Error('No active delivery crate to scratch');
    }
    const crate = this.state.activeDelivery;
    crate.scratchPercentage = Math.min(100, crate.scratchPercentage + amount);
    if (crate.scratchPercentage >= 60) {
      crate.masScratched = true;
    }
    return {
      scratchPercentage: crate.scratchPercentage,
      isRevealed: crate.masScratched,
    };
  }

  public verifyMasCode(): MasVerificationResponse {
    if (!this.state.activeDelivery) {
      throw new Error('No active delivery to verify');
    }
    if (this.state.dailyScratchQuota <= 0) {
      throw new Error('Daily scratch check quota exhausted (3/3 used)');
    }
    const crate = this.state.activeDelivery;
    if (!crate.masScratched) {
      throw new Error('Scratch panel must be revealed before sending SMS verification');
    }

    this.state.dailyScratchQuota -= 1;
    return crate.masResponse;
  }

  public resolveDelivery(action: DeliveryAction): DeliveryResolutionResult {
    if (!this.state.activeDelivery) {
      throw new Error('No active delivery crate to resolve');
    }
    const crate = this.state.activeDelivery;
    const cluesFound: string[] = [];
    let inventoryAdded = 0;
    let cashDelta = 0;
    let debtDelta = 0;
    let trustDelta = 0;
    let reputationDelta = 0;
    let feedbackMessage = '';
    let tolaMonologue = '';
    let sadeComment = '';

    if (action === 'accept') {
      inventoryAdded = crate.quantity;
      this.state.inventory[crate.productId] = (this.state.inventory[crate.productId] || 0) + crate.quantity;

      if (crate.supplier === 'dele') {
        cashDelta = -crate.totalCost;
        this.state.cash += cashDelta;
        trustDelta = -10;
        reputationDelta = -15;
        this.state.trust = Math.max(0, this.state.trust + trustDelta);
        this.state.reputationScore = Math.max(0, this.state.reputationScore + reputationDelta);
        cluesFound.push("Accepted unverified Batch #MG-204 from Dele's courier");
        feedbackMessage = 'Shipment accepted. 20 packs of Malaguard Forte added to active shelves. ₦44,000 paid COD.';
        tolaMonologue = "We took the cheap stock... If The Agency walks in, or God forbid a child drinks this, my license and Auntie Joke's life work are finished.";
        sadeComment = "Chris... that courier was sweating like a thief at Oshodi. I pray this chalk doesn't kill somebody's brother.";
      } else {
        debtDelta = crate.totalCost;
        this.state.debt += debtDelta;
        trustDelta = 5;
        reputationDelta = 10;
        this.state.trust = Math.min(100, this.state.trust + trustDelta);
        this.state.reputationScore = Math.min(100, this.state.reputationScore + reputationDelta);
        cluesFound.push('Accepted certified Batch #MG-881 with formal 14-day invoice');
        feedbackMessage = 'Certified shipment accepted. 20 packs of genuine Malaguard Forte added. ₦76,000 recorded on 14-day credit.';
        tolaMonologue = "Certified stock safely shelved. The ₦76,000 debt hangs heavy over my head, but at least my conscience is clear.";
        sadeComment = "Chief Okonkwo's price can give person high blood pressure, but at least you can sleep at night without hearing sirens.";
      }
    } else if (action === 'reject') {
      if (crate.supplier === 'dele') {
        trustDelta = 5;
        reputationDelta = 5;
        this.state.trust = Math.min(100, this.state.trust + trustDelta);
        this.state.reputationScore = Math.min(100, this.state.reputationScore + reputationDelta);
        cluesFound.push('Rejected suspect counterfeit Batch #MG-204 at the door');
        feedbackMessage = "Shipment rejected! Dele's courier angrily packed his crate and sped off on his bike.";
        tolaMonologue = "I sent Dele's boy away with his dirty carton. We are running low on malaria medicine, but our hands remain clean.";
        sadeComment = "Good riddance! Did you see the ink running on the box? Ordinary rain would wash the expiry date away!";
      } else {
        trustDelta = -5;
        cluesFound.push('Turned away certified distributor delivery');
        feedbackMessage = "Delivery declined. Chief Okonkwo's driver shook his head in disbelief and drove the refrigerated van away.";
        tolaMonologue = "I turned away Chief Okonkwo's van. We avoided the ₦76,000 debt, but our malaria shelf is dangerously empty.";
        sadeComment = "Ehn? Chris, why did you reject Okonkwo? Now where will we find genuine malaria meds when the fever rush starts?"
      }
    } else if (action === 'quarantine') {
      this.state.quarantinedStock[crate.productId] = (this.state.quarantinedStock[crate.productId] || 0) + crate.quantity;
      cluesFound.push(`Quarantined Batch #${crate.batchNumber} in back-room lockup as regulatory evidence`);
      
      if (crate.supplier === 'dele') {
        trustDelta = 8;
        reputationDelta = 10;
        this.state.trust = Math.min(100, this.state.trust + trustDelta);
        this.state.reputationScore = Math.min(100, this.state.reputationScore + reputationDelta);
        feedbackMessage = 'Shipment seized & quarantined in the back room under lock and key. Zero cash paid to the courier.';
        tolaMonologue = "I locked the crate in Auntie Joke's secure cabinet. When The Agency task force arrives, this will be our shield, not our coffin.";
        sadeComment = "Wise boy. Lock it behind the old drip stands. If Dele calls, tell him NEPA took the network.";
      } else {
        feedbackMessage = "Shipment moved to back room for batch audit and compliance inspection.";
        tolaMonologue = "I placed the crate in holding until we verify the laboratory batch sheet with the state board.";
        sadeComment = "A bit overly cautious for Okonkwo, but safety first.";
      }
    }

    cluesFound.forEach((clue) => {
      if (!this.state.clues.includes(clue)) {
        this.state.clues.push(clue);
      }
    });

    const result: DeliveryResolutionResult = {
      action,
      crate,
      inventoryAdded,
      cashDelta,
      debtDelta,
      trustDelta,
      reputationDelta,
      cluesFound,
      feedbackMessage,
      tolaMonologue,
      sadeComment,
    };

    this.state.deliveryResolved = true;
    this.state.deliveryResolution = result;
    this.state.day1Phase = 'day2_resolved';
    return result;
  }

  public startDayRush(): { secondsRemaining: number; queue: Customer[]; blackout: boolean } {
    const names = ['Mama Ngozi', 'Baba Ibrahim', 'Emeka', 'Nurse Ify', 'Bukola', 'The Skeptic', 'The Rush Buyer', 'The Price Hunter', 'Bayo Driver', 'Alabi Fintech'];
    const sourceIndexes = [0, 0, 1, 4, 2, 3, 1, 0, 2, 3];
    const queue = names.map((name, i) => ({
      ...CUSTOMERS_ROSTER[sourceIndexes[i]],
      id: `rush_${this.state.day}_${i}`,
      name,
      title: `${name} • Featured customer`,
    }));
    this.state.featuredQueue = queue;
    this.state.currentCustomerIndex = 0;
    this.state.rushSecondsRemaining = 120;
    this.state.followUps = [];
    this.state.rushRevenue = { walkInRevenue: 0, walkInCost: 0, featuredRevenue: 0, featuredCost: 0 };
    this.state.generatorFuel ??= 0;
    this.state.blackout = this.prng.next() < 0.25;
    this.state.day1Phase = 'day_rush';
    return { secondsRemaining: 120, queue: JSON.parse(JSON.stringify(queue)), blackout: this.state.blackout };
  }

  public tickDayRush(seconds = 1): { secondsRemaining: number; phase: Day1Phase } {
    if (this.state.day1Phase !== 'day_rush') throw new Error('Day rush is not active');
    this.state.rushSecondsRemaining = Math.max(0, (this.state.rushSecondsRemaining ?? 120) - Math.max(0, seconds));
    if (this.state.rushSecondsRemaining === 0) this.state.day1Phase = 'evening_tally';
    return { secondsRemaining: this.state.rushSecondsRemaining, phase: this.state.day1Phase };
  }

  public getRushQueue(): Customer[] { return JSON.parse(JSON.stringify(this.state.featuredQueue ?? [])); }

  public advanceRushCustomer(): Customer | undefined {
    const queue = this.state.featuredQueue ?? [];
    if (this.state.currentCustomerIndex + 1 >= queue.length) return undefined;
    this.state.currentCustomerIndex += 1;
    return JSON.parse(JSON.stringify(queue[this.state.currentCustomerIndex]));
  }

  public getBackgroundWalkInCount(): number {
    return Math.max(1, Math.floor(this.state.trust / 10)) * (this.state.blackout && !(this.state.generatorFuel && this.state.generatorFuel > 0) ? 0 : 1);
  }

  public decideGeneratorFuel(useFuel: boolean): boolean {
    if (!this.state.blackout) return false;
    if (useFuel && (this.state.generatorFuel ?? 0) > 0) {
      this.state.generatorFuel = (this.state.generatorFuel ?? 0) - 1;
      this.state.blackout = false;
      return true;
    }
    return false;
  }

  public recordFollowUp(entry: { customerName: string; productId: string; counterfeit: boolean }): void {
    (this.state.followUps ??= []).push({ ...entry });
  }

  public resolveFollowUps(randomValues?: number[]): Array<{ customerName: string; cured: boolean; probability: number; counterfeit: boolean }> {
    const followUps = this.state.followUps ?? [];
    const results = followUps.map((entry, i) => {
      const probability = entry.counterfeit ? 0.25 : 0.9;
      const cured = (randomValues?.[i] ?? this.prng.next()) < probability;
      if (entry.counterfeit) {
        this.state.trust = Math.max(0, this.state.trust - 10);
        const clue = `Counterfeit batch traced after ${entry.customerName}'s follow-up`;
        if (!this.state.clues.includes(clue)) this.state.clues.push(clue);
      }
      return { customerName: entry.customerName, cured, probability, counterfeit: entry.counterfeit };
    });
    this.state.followUps = [];
    this.state.followUpOutcomes = results;
    return results;
  }

  public recordRushRevenue(revenue: { walkInRevenue: number; walkInCost: number; featuredRevenue: number; featuredCost: number }): void {
    const totals = this.state.rushRevenue ?? { walkInRevenue: 0, walkInCost: 0, featuredRevenue: 0, featuredCost: 0 };
    this.state.rushRevenue = {
      walkInRevenue: totals.walkInRevenue + revenue.walkInRevenue,
      walkInCost: totals.walkInCost + revenue.walkInCost,
      featuredRevenue: totals.featuredRevenue + revenue.featuredRevenue,
      featuredCost: totals.featuredCost + revenue.featuredCost,
    };
  }

  public recordCreditSale(customerName: string, amount: number): void {
    (this.state.creditDue ??= []).push({ customerName, amount: Math.max(0, Math.round(amount)) });
  }

  public closeDayLedger(): { walkInNet: number; featuredProfit: number; overhead: number; net: number } {
    const totals = this.state.rushRevenue ?? { walkInRevenue: 0, walkInCost: 0, featuredRevenue: 0, featuredCost: 0 };
    const walkInNet = totals.walkInRevenue - totals.walkInCost;
    const featuredProfit = totals.featuredRevenue - totals.featuredCost;
    const overhead = 8000;
    const net = walkInNet + featuredProfit - overhead;
    this.state.cash += net;
    this.state.day1Phase = 'evening_tally';
    return { walkInNet, featuredProfit, overhead, net };
  }

  public payDebt(amount: number): number {
    const paid = Math.min(Math.max(0, Math.floor(amount)), this.state.cash, this.state.debt);
    this.state.cash -= paid;
    this.state.debt -= paid;
    return paid;
  }

  public advanceToNextDay(): { day: number; creditRepaid: number } {
    const creditRepaid = (this.state.creditDue ?? []).reduce((sum, entry) => sum + Math.round(entry.amount * 0.85), 0);
    this.state.cash += creditRepaid;
    this.state.creditDue = [];
    this.state.day += 1;
    this.state.daysRemaining = Math.max(0, this.state.daysRemaining - 1);
    this.state.time = '08:00 AM';
    this.state.currentCustomerIndex = 0;
    this.state.rushSecondsRemaining = undefined;
    this.state.day1Phase = 'day2_morning_arrival';
    this.state.dailyScratchQuota = 3;
    this.state.activeDelivery = this.generateDeliveryCrate(this.state.day1SupplierChoice || 'okonkwo');
    this.state.deliveryResolved = false;
    this.state.deliveryResolution = undefined;
    return { day: this.state.day, creditRepaid };
  }

  public getStreetHealthMap(): Array<{ street: string; complaints: number }> {
    const streets = ['Lagos Island', 'Surulere', 'Yaba', 'Mushin', 'Oshodi'];
    const tracedCases = this.state.clues.filter((clue) => clue.startsWith('Counterfeit batch traced after')).length;
    return streets.map((street, i) => ({ street, complaints: Math.max(0, tracedCases - i) }));
  }

  public getDay1Summary() {
    return {
      startingCash: 150000,
      cash: this.state.cash,
      cashEarned: this.state.day1Stats.cashEarned,
      trust: this.state.trust,
      debt: this.state.debt,
      daysRemaining: this.state.daysRemaining,
      remainingStock: { ...this.state.inventory },
      choice: this.state.day1SupplierChoice,
    };
  }

  // ==========================================
  // Stage 5: 90-Day Season Engine Enhancements
  // ==========================================

  public getProductEffectiveCost(productId: string): number {
    const product = this.getProduct(productId);
    if (!product) return 0;
    let multiplier = 1.0;
    for (const shock of this.state.activeShocks ?? []) {
      if (shock.active && shock.affectedCategories.includes(product.category)) {
        multiplier *= shock.costMultiplier;
      }
    }
    return Math.round(product.baseCost * multiplier);
  }

  public applyMacroeconomicShock(shock: MacroeconomicShock): void {
    if (!this.state.activeShocks) {
      this.state.activeShocks = [];
    }
    const existingIdx = this.state.activeShocks.findIndex((s) => s.id === shock.id);
    if (existingIdx >= 0) {
      this.state.activeShocks[existingIdx] = { ...shock };
    } else {
      this.state.activeShocks.push({ ...shock });
    }
  }

  public getMilestoneForDay(day: number): SeasonMilestoneEvent | null {
    switch (day) {
      case 15:
        return {
          day: 15,
          title: 'Macroeconomic FX Devaluation Shock',
          description: 'Official Naira floats; parallel market hits ₦1,650/$1. Imported antimalarials and antibiotics jump by 80%.',
          type: 'fx_shock',
        };
      case 30:
        return {
          day: 30,
          title: 'Prime Star Pharmaceuticals Ultimatum',
          description: 'Mr. Dele visits the shop with an aggressive buy-in offer to corner your inventory.',
          type: 'prime_star_ultimatum',
        };
      case 45:
        return {
          day: 45,
          title: 'Surprise Pharmacy Board Regulatory Inspection',
          description: 'Inspector Danjuma and state officials arrive with clipboards to audit your dispensary standards.',
          type: 'board_inspection',
        };
      case 70:
        return {
          day: 70,
          title: 'The Agency Anti-Counterfeiting Task Force Window',
          description: 'Opportunity to submit collected batch evidence and coordinate a raid on illegal distribution hubs.',
          type: 'agency_raid_window',
        };
      case 90:
        return {
          day: 90,
          title: 'Day 90: Heathrow Flight & Season Finale',
          description: 'Your visa flight departs tonight. Will you stay in Orile-Koka or board the flight to the UK?',
          type: 'season_finale',
        };
      default:
        return null;
    }
  }

  public conductBoardInspection(options?: InspectionOptions): InspectionResult {
    const hasLicense = options?.hasLicenseDisplayed ?? true;
    const superintendentPresent = options?.superintendentPresent ?? true;
    const poisonRegister = options?.hasPoisonRegisterLogged ?? true;
    const coldChain = options?.hasColdChainLogs ?? true;
    const unsegregatedFake = options?.hasUnsegregatedFakeStock ?? false;

    const areas: InspectionAuditArea[] = [
      {
        name: 'Premises Annual Registration & Practice License',
        category: 'license',
        status: hasLicense ? 'pass' : 'minor_defect',
        detail: hasLicense
          ? 'Current annual certificate framed and visible in waiting area.'
          : 'License not prominently displayed; renewal fee receipt pending.',
      },
      {
        name: 'Superintendent Pharmacist Presence',
        category: 'presence',
        status: superintendentPresent ? 'pass' : 'major_defect',
        detail: superintendentPresent
          ? 'Chris Tola present in person wearing approved lab coat.'
          : 'Superintendent absent without qualified locum cover (fatal breach).',
      },
      {
        name: 'Poison & Controlled Substances Register',
        category: 'poison_register',
        status: poisonRegister ? 'pass' : 'minor_defect',
        detail: poisonRegister
          ? 'Hardcover Poison Book countersigned with customer prescription records.'
          : 'Gaps in disbursement ledger for Schedule 1 controlled sedatives.',
      },
      {
        name: 'Cold-Chain 2°C–8°C Temperature Logbook',
        category: 'cold_chain',
        status: coldChain ? 'pass' : 'minor_defect',
        detail: coldChain
          ? 'Twice-daily digital thermometer logbook fully signed and maintained.'
          : 'Temperature chart missing entries during generator blackout.',
      },
      {
        name: 'Suspect & Quarantined Inventory Segregation',
        category: 'quarantine',
        status: unsegregatedFake ? 'major_defect' : 'pass',
        detail: !unsegregatedFake
          ? 'Quarantine shelf properly designated behind red warning line.'
          : 'Suspected counterfeit blister packs found mixed on retail sales shelf.',
      },
    ];

    let defectType: InspectionDefectType = 'none';
    let fine = 0;
    let trustDelta = 0;
    const notes: string[] = [];

    const majorDefects = areas.filter((a) => a.status === 'major_defect');
    const minorDefects = areas.filter((a) => a.status === 'minor_defect');

    if (majorDefects.length > 0) {
      defectType = 'major';
      fine = 300000;
      trustDelta = -10;
      notes.push(`Critical compliance breach: ${majorDefects.map((d) => d.name).join(', ')}.`);
    } else if (minorDefects.length > 0) {
      defectType = 'minor';
      fine = 150000;
      trustDelta = -5;
      notes.push(`Statutory administrative defects: ${minorDefects.map((d) => d.name).join(', ')}.`);
    } else {
      defectType = 'none';
      fine = 0;
      trustDelta = +5;
      notes.push('Exemplary compliance rating: Premises commended by Pharmacy Board.');
    }

    const violationsInThisAudit = defectType === 'none' ? 0 : 1;
    this.state.boardViolations = (this.state.boardViolations || 0) + violationsInThisAudit;
    this.state.cash = Math.max(0, this.state.cash - fine);
    this.state.trust = Math.max(0, Math.min(100, this.state.trust + trustDelta));

    const sealed = this.state.boardViolations >= 2;
    if (sealed) {
      this.state.isPremisesSealed = true;
      this.state.sealedReason = 'compliance';
    }

    let inspectorDialogue = '';
    if (defectType === 'none') {
      inspectorDialogue = '"Pharmacist Tola, I am impressed. In this neighborhood full of patent medicine stores, your registers and cold chain are spotless. Keep it up."';
    } else if (sealed) {
      inspectorDialogue = '"Two infractions, Pharmacist! I warned you. Bring out the red tape and padlock the gate. Premises sealed until tribunal hearing."';
    } else if (defectType === 'major') {
      inspectorDialogue = `"This is unacceptable. A ₦${fine.toLocaleString()} penalty is hereby served. One more failure and we will padlock your shutters permanently."`;
    } else {
      inspectorDialogue = `"Rectify these lapses immediately. You have been penalized ₦${fine.toLocaleString()} payable to the state revenue account."`;
    }

    const result: InspectionResult = {
      passed: defectType === 'none',
      defectType,
      fine,
      trustDelta,
      violationsCount: violationsInThisAudit,
      totalViolations: this.state.boardViolations,
      sealed,
      areas,
      notes,
      inspectorDialogue,
      commendationBonus: defectType === 'none',
    };

    if (!this.state.inspectionHistory) {
      this.state.inspectionHistory = [];
    }
    this.state.inspectionHistory.push(result);

    return result;
  }

  public executeAgencyRaid(): AgencyRaidResult {
    if (this.state.agencyRaidCompleted) {
      throw new Error('The Agency anti-counterfeiting raid has already been conducted this season.');
    }
    const clueCount = (this.state.clues || []).length;
    if (clueCount < 7) {
      throw new Error(`Insufficient evidence. Need at least 7 clues to trigger an Agency raid; currently have ${clueCount}.`);
    }

    this.state.agencyRaidCompleted = true;
    this.state.primeStarNeutralized = true;
    const trustBonus = 15;
    const debtRelief = 250000;

    this.state.trust = Math.min(100, this.state.trust + trustBonus);
    this.state.debt = Math.max(0, this.state.debt - debtRelief);

    return {
      success: true,
      cluesSubmitted: clueCount,
      trustBonus,
      debtRelief,
      headline: 'AGENCY STORMS PRIME STAR WAREHOUSE: MASSIVE ILLICIT STOCK CONFISCATED',
      message: 'Armed Agency operatives acting on your detailed batch dossier raided Prime Star distribution hubs on Lagos Island. The counterfeit distribution ring is broken, and the community is safe.',
      primeStarNeutralized: true,
      communityRiskCleared: true,
    };
  }

  public fastForwardDays(daysCount: number, _policy?: FastSimPolicy): Array<{ day: number; milestone?: SeasonMilestoneEvent }> {
    if (this.state.isPremisesSealed) {
      throw new Error('Cannot advance calendar: pharmacy premises are sealed by authorities.');
    }

    const triggeredEvents: Array<{ day: number; milestone?: SeasonMilestoneEvent }> = [];
    const targetDay = Math.min(90, this.state.day + daysCount);

    while (this.state.day < targetDay) {
      if (this.state.isPremisesSealed) break;

      this.state.day += 1;
      this.state.daysRemaining = Math.max(0, 90 - this.state.day);

      // Daily small simulation baseline (net operating cashflow: sales margin - overhead)
      const dailyOverhead = 4000;
      const dailySimRevenue = 18000;
      const dailySimCost = 11000;
      const dailyNet = dailySimRevenue - dailySimCost - dailyOverhead;
      this.state.cash += dailyNet;
      this.state.totalCustomersServed += 5;
      this.state.successfulSales += 5;

      const milestone = this.getMilestoneForDay(this.state.day);
      if (milestone) {
        if (milestone.type === 'fx_shock') {
          this.applyMacroeconomicShock({
            id: 'fx_shock_day15',
            name: 'Naira FX Floating Surge',
            description: 'Import costs jump by 80% on Antimalarials and Antibiotics.',
            startDay: 15,
            durationDays: 45,
            costMultiplier: 1.8,
            affectedCategories: ['Antimalarial', 'Antibiotic'],
            active: true,
          });
        }
        triggeredEvents.push({ day: this.state.day, milestone });
      }
    }

    return triggeredEvents;
  }

  public triggerSeasonFinale(decision: 'stay' | 'leave'): EndgameReport {
    const report = evaluateEndgame(this.state, decision);
    this.state.endgameReport = report;
    this.state.playerDecision = decision;
    this.state.day1Phase = 'epilogue';
    return report;
  }
}
