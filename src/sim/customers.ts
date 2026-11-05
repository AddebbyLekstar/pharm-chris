import { Customer } from './types';

export const CUSTOMERS_ROSTER: Customer[] = [
  {
    id: 'cust_mama_ngozi',
    name: 'Mama Ngozi',
    title: 'The Neighborhood Matriarch',
    avatarKey: 'mama_ngozi',
    initialQuote: 'Headache, body hot since yesterday. Give me genuine medicine, my son.',
    symptoms: ['hot_body', 'headache', 'fever', 'chills'],
    symptomLabel: 'Headache, body hot since yesterday',
    matchedProductIds: ['prd_feverease_extra', 'prd_painaway_500', 'prd_malaguard_forte'],
    budget: 2500,
    mood: 'Haggling',
    patienceMax: 3,
    preferredPayment: 'pos_transfer',
    dialogue: {
      fairPrice: [
        "You get Auntie's hand. Take transfer!",
        'God go bless you! You get soft hand like your auntie.',
      ],
      overpriced: [
        'Ah-ah! You wan buy aeroplane on top my headache?!',
        '₦{price}?! Jesu Kristi! Bring down that price before I call your mother!',
      ],
      wrongProduct: [
        'Ehen? My head is pounding and you give me this? Are you sure you studied pharmacy?!',
        'This is not what I asked for! Do you want to treat fever with stomach mixture?',
      ],
      exceedsBudget: [
        'Chris my son, I only brought ₦{budget} cash from house. Where will I find ₦{price}?',
        'My money no reach. Have mercy on an old woman or give me half pack!',
      ],
      fractionalOffer: [
        'Good boy. Cut the half blister for me. God will multiply your small shop.',
      ],
    },
  },
  {
    id: 'cust_emeka',
    name: 'Emeka',
    title: 'Dramatic Okada Rider',
    avatarKey: 'emeka_okada',
    initialQuote: 'Oga, pothole don disconnect my waist bone! Cut four tablets for ₦200 make I fit ride.',
    symptoms: ['waist_pain', 'body_pain'],
    symptomLabel: 'Body aches from riding potholes (Wants just 4 tablets)',
    matchedProductIds: ['prd_painaway_500'],
    budget: 250,
    mood: 'Hurried',
    patienceMax: 2,
    preferredPayment: 'cash',
    dialogue: {
      fairPrice: [
        'You be correct guy! As my waist click back, I go carry passenger come here!',
        'Thanks for not chasing me away, Pharmacist! Balance my engine!',
      ],
      overpriced: [
        '₦{price} for four tablets?! Oga I look like Dangote?',
        'Bring down price jare, no be engine oil I come buy!',
      ],
      wrongProduct: [
        'Oga, waist dey pain me you dey give me this one? You wan knock my engine?!',
      ],
      exceedsBudget: [
        'Haba oga, I only have ₦{budget} cash! Sell 4 tablets or I go crash my bike!',
      ],
      fractionalOffer: [
        'You be correct guy! Thanks for not chasing me away, Pharmacist!',
        'Oya balance my engine with four tablets! God bless you.',
      ],
    },
  },
  {
    id: 'cust_bayo_danfo',
    name: 'Bayo Driver',
    title: 'Danfo King of Oshodi',
    avatarKey: 'bayo_danfo',
    initialQuote: 'Doc! My waist dey pepper me! Traffic on Third Mainland Bridge almost break my back!',
    symptoms: ['waist_pain', 'body_pain', 'headache'],
    symptomLabel: 'Severe Waist & Body Pain (Severe fatigue)',
    matchedProductIds: ['prd_painaway_500', 'prd_vitaboost_complex'],
    budget: 1500,
    mood: 'Hurried',
    patienceMax: 2,
    preferredPayment: 'cash',
    dialogue: {
      fairPrice: [
        'Sharp sharp! Oya hold your cash. Last bus dey load for Oshodi, make I tear the sachet now!',
        'You be real man! Keep the change, my motor engine dey idle outside.',
      ],
      overpriced: [
        'Which kind agbero price be this?! You think say money dey grow for conductor hand?!',
        'Haba bros! You wan collect my whole day steering work for just four caplets?!',
      ],
      wrongProduct: [
        'Doc, waist dey pain me you dey give me antacid? My belly is strong like cement, na back dey kill me!',
      ],
      exceedsBudget: [
        'Pocket don dry bros! ₦{budget} na all I get for pocket after LASTMA collected bribe today.',
      ],
    },
  },
  {
    id: 'cust_alabi_fintech',
    name: 'Alabi Fintech',
    title: 'Remote Product Manager',
    avatarKey: 'alabi_fintech',
    initialQuote: 'I have sprint planning in 10 minutes and this flu is destroying my focus. I will POS transfer.',
    symptoms: ['flu', 'catarrh', 'throat_pain', 'headache'],
    symptomLabel: 'Tech Flu & Throat Burn (Prefers POS transfer)',
    matchedProductIds: ['prd_coughcalm_elixir', 'prd_feverease_extra'],
    budget: 6000,
    mood: 'Patient',
    patienceMax: 4,
    preferredPayment: 'pos_transfer',
    dialogue: {
      fairPrice: [
        'Transfer initiated. Receipt generated. Smooth transaction, Chris. Good UX in this pharmacy.',
        'Great, debit alert just arrived on your terminal. Hope this elixir kicks in before standup.',
      ],
      overpriced: [
        'Wait, ₦{price}? The margin on this is wild. Are you running a startup valuation on over-the-counter medicine?',
        'That markup is aggressive even for Victoria Island. Rebalance your pricing model.',
      ],
      wrongProduct: [
        'This is for bacterial wounds... I have an upper respiratory bug. Check your diagnostic index.',
      ],
      exceedsBudget: [
        'Even my monthly wellness allowance did not budget ₦{price} for this.',
      ],
    },
  },
  {
    id: 'cust_iya_basira',
    name: 'Iya Basira',
    title: 'Local Buka Matron',
    avatarKey: 'iya_basira',
    initialQuote: 'Chris! Too much smoke from firewood and pepper don choke my chest. E dey scrape my throat!',
    symptoms: ['cough', 'chest_tightness', 'throat_pain'],
    symptomLabel: 'Heavy Smoker/Firewood Cough & Chest Tightness',
    matchedProductIds: ['prd_coughcalm_elixir'],
    budget: 3500,
    mood: 'Dramatic',
    patienceMax: 3,
    preferredPayment: 'cash',
    dialogue: {
      fairPrice: [
        'Ehen! God bless your hand! If you come my buka this evening, goat meat head is free for you!',
        'Oya take cash. Better boy with good heart.',
      ],
      overpriced: [
        'Yeepa! Chris do you want to kill Basira mother?! Where I wan see this kind money in this Tinubu economy?!',
        'You wan make me sell my pot of soup to buy cough syrup?! Reduce am!',
      ],
      wrongProduct: [
        'Chest dey rattle like generator and you dey hand me blood pressure pills?! Do you want my pressure to rise?!',
      ],
      exceedsBudget: [
        'My food money for tomorrow is inside this ₦{budget}. My hand cannot stretch reach ₦{price}!',
      ],
    },
  },
];
