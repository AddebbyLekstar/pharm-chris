import { EndgameOutcome, EndgameReport, GameState } from './types';

export const ORIGINAL_DEBT = 4200000;
export const RENEGOTIATE_THRESHOLD = 1680000; // <= 40% of 4.2M (at least 60% paid, i.e. 2.52M paid)

/**
 * Evaluates the final endgame report against the 6 brief end-states:
 * 1. STAYED_SOLVENT (Debt cleared + Trust >= 50 + Stayed)
 * 2. STAYED_BARELY (Debt renegotiated to <= 40% + Stayed)
 * 3. LEFT_SHOP_TO_SADE (Debt cleared + Boarded flight + Handed shop to Sade)
 * 4. LEFT_SHOP_SOLD (Debt renegotiated to <= 40% + Boarded flight + Shop sold to liquidate remainder)
 * 5. SEALED_DEBT (Debt unpaid on Day 90 -> Chief Okonkwo seizes shop)
 * 6. SEALED_COMPLIANCE (2 Board violations -> Board padlock)
 */
export function evaluateEndgame(state: GameState, decision: 'stay' | 'leave'): EndgameReport {
  const originalDebt = state.originalDebt || ORIGINAL_DEBT;
  const finalDebt = Math.max(0, state.debt);
  const debtRepaid = Math.max(0, originalDebt - finalDebt);
  const finalCash = state.cash;
  const trust = state.trust;
  const boardViolations = state.boardViolations;
  const cluesCount = state.clues.length;
  const customersServed = state.totalCustomersServed;
  const successfulSales = state.successfulSales;

  let outcome: EndgameOutcome;

  if (boardViolations >= 2 || (state.isPremisesSealed && state.sealedReason === 'compliance')) {
    outcome = 'SEALED_COMPLIANCE';
  } else if (state.isPremisesSealed && state.sealedReason === 'debt') {
    outcome = 'SEALED_DEBT';
  } else if (finalDebt > RENEGOTIATE_THRESHOLD) {
    // Over 40% debt remains unpaid on Day 90
    outcome = 'SEALED_DEBT';
  } else if (finalDebt <= 0) {
    // Debt completely paid off
    if (decision === 'stay') {
      outcome = trust >= 50 ? 'STAYED_SOLVENT' : 'STAYED_BARELY';
    } else {
      outcome = 'LEFT_SHOP_TO_SADE';
    }
  } else {
    // Debt renegotiated (<= 40% remains)
    if (decision === 'stay') {
      outcome = 'STAYED_BARELY';
    } else {
      outcome = 'LEFT_SHOP_SOLD';
    }
  }

  let trustBadge = '🎖️';
  let trustBadgeTitle = 'Trusted Community Chemist';
  if (trust >= 70) {
    trustBadge = '🏆';
    trustBadgeTitle = 'Pillar of Orile-Koka';
  } else if (trust >= 50) {
    trustBadge = '🎖️';
    trustBadgeTitle = 'Trusted Community Chemist';
  } else if (trust >= 30) {
    trustBadge = '⚖️';
    trustBadgeTitle = 'Compromised Merchant';
  } else {
    trustBadge = '⚠️';
    trustBadgeTitle = 'Discredited Trader';
  }

  const config = OUTCOME_DETAILS[outcome];

  return {
    outcome,
    title: config.title,
    newspaperName: config.newspaperName,
    headline: config.headline,
    subheadline: config.subheadline,
    narrativeText: config.narrativeText,
    sadeFinalQuote: config.sadeFinalQuote,
    tolaMonologue: config.tolaMonologue,
    finalCash,
    finalDebt,
    originalDebt,
    debtRepaid,
    trust,
    trustBadge,
    trustBadgeTitle,
    customersServed,
    successfulSales,
    cluesCount,
    boardViolations,
    playerDecision: decision,
    isPremisesSealed: outcome === 'SEALED_COMPLIANCE' || outcome === 'SEALED_DEBT',
  };
}

const OUTCOME_DETAILS: Record<EndgameOutcome, {
  title: string;
  newspaperName: string;
  headline: string;
  subheadline: string;
  narrativeText: string;
  sadeFinalQuote: string;
  tolaMonologue: string;
}> = {
  STAYED_SOLVENT: {
    title: 'THE LAGOS DAILY CHRONICLE',
    newspaperName: 'THE LAGOS DAILY CHRONICLE - RETRO EDITION',
    headline: 'DEBT CLEARED! PHARM CHRIS BECOMES INDESTRUCTIBLE PILLAR OF LAGOS MAINLAND',
    subheadline: 'Ethical Medicine Prevails: N4.2M Distributor Balance Settled in Full',
    narrativeText: "Against soaring inflation and open-market counterfeits, Chris Tola tore up the Heathrow flight ticket. Auntie Joke's N4,200,000 debt to Chief Okonkwo has been liquidated to the last Kobo without dispensing a single grain of chalk. Mama Ngozi now brings hot pepper soup on Sundays, Emeka wears a custom Pharm Chris reflective vest on his bike, and the green neon cross shines unshakeable over Commercial Avenue.",
    sadeFinalQuote: "Pharmacist, I knew you had iron in your chest. Auntie Joke is looking down right now and smiling with all thirty-two teeth.",
    tolaMonologue: "Six years of pharmacy school in the books. I didn't get cold UK drizzle, but I built something real and incorruptible on Lagos asphalt.",
  },
  STAYED_BARELY: {
    title: 'MAINLAND BUSINESS RECORDER',
    newspaperName: 'MAINLAND BUSINESS RECORDER - EVENING DISPATCH',
    headline: 'PHARMACY RESTRUCTURES DEBT: LANDMARK STORE SURVIVES CRUNCH',
    subheadline: 'Chief Okonkwo Grants Extended Net-Credit After 60% Amortisation',
    narrativeText: "Tola chose to stay and weather the storm. With over 60% of Auntie Joke's debt amortised in good faith, Chief Okonkwo agreed to a low-interest multi-year refinancing deal. The generator still coughs and profit margins remain paper-thin, but the doors stay open, the stock is genuine, and the neighborhood knows where to find honest medicine.",
    sadeFinalQuote: "Chief Okonkwo didn't padlock us, sir. Small small, the goat will eat yam until the harvest improves.",
    tolaMonologue: "We are bruised, the shelf space is lean, but the roof is ours. The battle continues tomorrow at 8:00 AM.",
  },
  LEFT_SHOP_TO_SADE: {
    title: 'LAGOS OVERSEAS DIASPORA & HEATHROW HERALD',
    newspaperName: 'LAGOS OVERSEAS DIASPORA & HEATHROW HERALD',
    headline: 'PHARMACIST HEADS TO UK WITH CLEAN SLATE; HANDS KEYS TO ATTENDANT SADE',
    subheadline: 'N4.2M Debt Fully Retired - Dispensary Transformed into Employee-Owned Bastion',
    narrativeText: "Chris Tola paid off every single Naira owed to Chief Okonkwo, signed over full managerial ownership to Sade at the High Court, and boarded the overnight British Airways flight to London. As the Boeing 777 soared over Lagos Island, Sade opened the shutters as Managing Director. A clean exit, an empowered team, and an unblemished legacy.",
    sadeFinalQuote: "Go safe, Pharmacist! Send us UK chocolate, and don't worry about the shop - nobody will sell fake paracetamol on my watch!",
    tolaMonologue: "Looking down at the twinkling lights of the Third Mainland Bridge from 30,000 feet, my debt is zero and my heart is light.",
  },
  LEFT_SHOP_SOLD: {
    title: 'METROPOLITAN COMMERCIAL ADVERTISER',
    newspaperName: 'METROPOLITAN COMMERCIAL ADVERTISER',
    headline: 'HISTORIC CHEMIST SOLD TO CLEAR REMAINING LIABILITIES AS OWNER RELOCATES',
    subheadline: 'Chief Okonkwo Recoups Capital; Chain Mega-Pharmacy Acquires Storefront',
    narrativeText: "Tola boarded the scheduled flight to the UK. However, with 40% of the original debt still hanging, the physical storefront and remaining inventory were liquidated to clear Chief Okonkwo's ledger. Sade was assisted with a generous severance package, but Auntie Joke's wooden sign was taken down to make way for a corporate franchise.",
    sadeFinalQuote: "Safe journey, Chris. It pains me to see them take down Auntie's sign, but at least your hands are free.",
    tolaMonologue: "I got my UK visa and my fresh start, but a part of my soul will always wonder what Auntie Joke's shop could have become.",
  },
  SEALED_DEBT: {
    title: 'CREDITORS TRIBUNAL & DEBT RECOVERY NOTICE',
    newspaperName: 'CREDITORS TRIBUNAL & DEBT RECOVERY NOTICE',
    headline: 'AUCTION IMMINENT: CHIEF OKONKWO FORECLOSES ON PHARM CHRIS DISPENSARY',
    subheadline: 'Day 90 Default Leaves N4.2M Debt Unresolved; Heavy Chains Padlock Facility',
    narrativeText: "Day 90 arrived without the required debt clearance. Chief Okonkwo's recovery agents arrived in flatbed trucks, dismantling the dispensary glass cabinets, carting away remaining inventory, and padlocking the iron shutter with industrial chains. Tola's Letter of Good Standing was stalled by creditor injunctions, leaving both business and travel plans completely ruined.",
    sadeFinalQuote: "Pharmacist... I told you Chief Okonkwo doesn't joke with his money. Where will I find work now?",
    tolaMonologue: "The padlock clicked shut. No pharmacy, no UK flight, just an empty counter gathering Lagos red dust.",
  },
  SEALED_COMPLIANCE: {
    title: 'THE REGULATORY ENFORCER (STATE PHARMACY BOARD)',
    newspaperName: 'THE REGULATORY ENFORCER - OFFICIAL GAZETTE',
    headline: 'BOARD TASK FORCE SEALS PHARM CHRIS OVER FATAL COMPLIANCE VIOLATIONS',
    subheadline: 'Two Regulatory Strikes Trigger Red Tape Padlock & Pharmacist License Revocation',
    narrativeText: "Inspector Danjuma returned with armed task force escorts. Following a second catastrophic compliance failure - unsegregated counterfeit stock on customer shelves and breached poison registers - the Board ordered immediate premises closure. Red seal tape blocks the entryway, Tola's practising licence is suspended, and criminal charges loom.",
    sadeFinalQuote: "Ah, Pharmacist Chris! I warned you about Dele's dirty cartons! Now task force has put wax on our lock!",
    tolaMonologue: "Two strikes. Inspector Danjuma slapped the red sticker on the glass. My license is revoked, my UK visa interview cancelled. It's over.",
  },
};
