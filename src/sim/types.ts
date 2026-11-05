export type PaymentMethod = 'cash' | 'pos_transfer';

export type CustomerMood = 'Patient' | 'Haggling' | 'Dramatic' | 'Hurried' | 'Desperate';

export type Day1Phase =
  | 'shutters'
  | 'first_sale'
  | 'unit_dispensing'
  | 'ledger'
  | 'evening_tally'
  | 'choice'
  | 'day2_teaser'
  | 'day2_morning_arrival'
  | 'day2_inspection'
  | 'day2_resolved'
  | 'free_play'
  | 'day_rush'
  | 'board_inspection'
  | 'agency_raid'
  | 'macro_shock_alert'
  | 'season_finale'
  | 'epilogue';

export type GamePhase = Day1Phase;

export type SupplierChoice = 'dele' | 'okonkwo';

export type DeliveryAction = 'accept' | 'reject' | 'quarantine';

export type TamperSealStatus = 'intact' | 'tampered';

export type MasVerificationStatus = 'genuine' | 'duplicate_warning' | 'invalid';

export interface MasVerificationResponse {
  code: string;
  isGenuine: boolean;
  smsMessage: string;
  status: MasVerificationStatus;
  queryCount: number;
}

export interface DeliveryCrate {
  id: string;
  supplier: SupplierChoice;
  supplierName: string;
  courierDescription: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  paymentTerms: 'cash_on_delivery' | '14_day_credit';
  batchNumber: string;
  cartonExpiry: string;
  blisterExpiry: string;
  batchMatches: boolean;
  tamperSeal: TamperSealStatus;
  tamperSealDescription: string;
  agencyRegNumber: string;
  agencyRegWarning?: string;
  masCode: string;
  masScratched: boolean;
  scratchPercentage: number;
  masResponse: MasVerificationResponse;
  invoice: {
    number: string;
    hasFormalStamp: boolean;
    terms: string;
    notes: string;
  };
  isFake: boolean;
}

export interface DeliveryResolutionResult {
  action: DeliveryAction;
  crate: DeliveryCrate;
  inventoryAdded: number;
  cashDelta: number;
  debtDelta: number;
  trustDelta: number;
  reputationDelta: number;
  cluesFound: string[];
  feedbackMessage: string;
  tolaMonologue: string;
  sadeComment: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  unitDescription: string;
  baseCost: number;
  baseRetail: number;
  fairPriceMin: number;
  fairPriceMax: number;
  defaultStock: number;
  symptomTags: string[];
  fractionalAllowed: boolean;
  unitCost?: number;
  unitRetail?: number;
  unitsPerPack?: number;
  requiresPrescription: boolean;
  isColdChain: boolean;
  hasMasScratchCode: boolean;
  pixelColor: string;
  badge: string;
}

export interface DialogueResponse {
  text: string;
  speaker: string;
  tone: 'satisfied' | 'scolded' | 'furious' | 'grateful' | 'skeptical';
}

export interface CustomerDialogueMatrix {
  fairPrice: string[];
  overpriced: string[];
  wrongProduct: string[];
  exceedsBudget: string[];
  fractionalOffer?: string[];
}

export interface Customer {
  id: string;
  name: string;
  title: string;
  avatarKey: string;
  initialQuote: string;
  symptoms: string[];
  symptomLabel: string;
  matchedProductIds: string[];
  budget: number;
  mood: CustomerMood;
  patienceMax: number;
  preferredPayment: PaymentMethod;
  dialogue: CustomerDialogueMatrix;
}

export interface TransactionAttempt {
  productId: string;
  offeredPrice: number;
  paymentMethod: PaymentMethod;
  isFractional?: boolean;
  fractionalUnits?: number;
}

export interface TransactionResult {
  success: boolean;
  customerDialogue: DialogueResponse;
  tolaRemark: string;
  cashDelta: number;
  trustDelta: number;
  marginPercent: number;
  isWithinFairBand: boolean;
  isOverpriced: boolean;
  isWrongProduct: boolean;
  isAboveBudget: boolean;
  isFractional?: boolean;
  fractionalUnits?: number;
  receiptNumber: string;
}

export interface Day1Stats {
  mamaNgoziServed: boolean;
  emekaServed: boolean;
  ledgerOpened: boolean;
  cashEarned: number;
}

// ==========================================
// Stage 5 Endgame Matrix & Outcomes
// ==========================================
export type EndgameOutcome =
  | 'STAYED_SOLVENT'
  | 'STAYED_BARELY'
  | 'LEFT_SHOP_TO_SADE'
  | 'LEFT_SHOP_SOLD'
  | 'SEALED_DEBT'
  | 'SEALED_COMPLIANCE';

export interface EndgameReport {
  outcome: EndgameOutcome;
  title: string;
  newspaperName: string;
  headline: string;
  subheadline: string;
  narrativeText: string;
  sadeFinalQuote: string;
  tolaMonologue: string;
  finalCash: number;
  finalDebt: number;
  originalDebt: number;
  debtRepaid: number;
  trust: number;
  trustBadge: string;
  trustBadgeTitle: string;
  customersServed: number;
  successfulSales: number;
  cluesCount: number;
  boardViolations: number;
  playerDecision: 'stay' | 'leave';
  isPremisesSealed: boolean;
}

// ==========================================
// Stage 5 Board Regulatory Inspection (Danjuma)
// ==========================================
export type InspectionDefectType = 'none' | 'minor' | 'major';

export interface InspectionAuditArea {
  name: string;
  category: 'license' | 'presence' | 'poison_register' | 'cold_chain' | 'quarantine';
  status: 'pass' | 'minor_defect' | 'major_defect';
  detail: string;
}

export interface InspectionResult {
  passed: boolean;
  defectType: InspectionDefectType;
  fine: number;
  trustDelta: number;
  violationsCount: number;
  totalViolations: number;
  sealed: boolean;
  areas: InspectionAuditArea[];
  notes: string[];
  inspectorDialogue: string;
  commendationBonus?: boolean;
}

export interface InspectionOptions {
  hasLicenseDisplayed?: boolean;
  superintendentPresent?: boolean;
  hasPoisonRegisterLogged?: boolean;
  hasColdChainLogs?: boolean;
  hasUnsegregatedFakeStock?: boolean;
}

// ==========================================
// Stage 5 Agency Anti-Counterfeiting Raid
// ==========================================
export interface AgencyRaidResult {
  success: boolean;
  cluesSubmitted: number;
  trustBonus: number;
  debtRelief: number;
  message: string;
  headline: string;
  primeStarNeutralized: boolean;
  communityRiskCleared: boolean;
}

// ==========================================
// Stage 5 Macroeconomic Shocks
// ==========================================
export interface MacroeconomicShock {
  id: string;
  name: string;
  description: string;
  startDay: number;
  durationDays: number;
  costMultiplier: number;
  affectedCategories: string[];
  active: boolean;
}

// ==========================================
// Stage 5 Milestone Events & Progression
// ==========================================
export interface SeasonMilestoneEvent {
  day: number;
  title: string;
  description: string;
  type: 'fx_shock' | 'prime_star_ultimatum' | 'board_inspection' | 'agency_raid_window' | 'season_finale';
  resolved?: boolean;
  data?: any;
}

export interface FastSimPolicy {
  pricingMarkupPercent?: number;
  fuelOnBlackout?: boolean;
  debtRepaymentRatio?: number;
  quarantineDubiousStock?: boolean;
}

export interface GameState {
  saveVersion: 1;
  seed: number;
  day: number;
  time?: string;
  daysRemaining: number;
  seasonLength: number;
  cash: number;
  trust: number;
  debt: number;
  originalDebt: number;
  inventory: Record<string, number>;
  quarantinedStock: Record<string, number>;
  clues: string[];
  dailyScratchQuota: number;
  currentCustomerIndex: number;
  totalCustomersServed: number;
  successfulSales: number;
  reputationScore: number;
  day1Phase: Day1Phase;
  day1SupplierChoice?: SupplierChoice;
  day1Stats: Day1Stats;
  activeDelivery?: DeliveryCrate;
  deliveryResolved?: boolean;
  deliveryResolution?: DeliveryResolutionResult;
  rushSecondsRemaining?: number;
  featuredQueue?: Customer[];
  followUps?: Array<{ customerName: string; productId: string; counterfeit: boolean }>;
  followUpOutcomes?: Array<{ customerName: string; cured: boolean; probability: number; counterfeit: boolean }>;
  creditDue?: Array<{ customerName: string; amount: number }>;
  rushRevenue?: { walkInRevenue: number; walkInCost: number; featuredRevenue: number; featuredCost: number };
  generatorFuel?: number;
  blackout?: boolean;
  // Stage 5 State Additions
  boardViolations: number;
  isPremisesSealed: boolean;
  sealedReason?: 'compliance' | 'debt';
  activeShocks: MacroeconomicShock[];
  agencyRaidCompleted: boolean;
  primeStarNeutralized?: boolean;
  currentMilestone?: SeasonMilestoneEvent;
  milestonesTriggered: number[];
  inspectionHistory: InspectionResult[];
  endgameReport?: EndgameReport;
  playerDecision?: 'stay' | 'leave';
}
