export interface QueryItem {
  id: string;
  text: string;
  lang: 'EN' | 'HI-EN';
  intent: 'Best-of' | 'Comparison' | 'Direct' | 'How-to';
  enabled: boolean;
}

/**
 * Map of category presets with customized starter queries
 */
const CATEGORY_PRESETS: Record<string, Omit<QueryItem, 'id' | 'enabled'>[]> = {
  'SaaS & Software': [
    { text: 'Best SaaS software for businesses in India 2026', lang: 'EN', intent: 'Best-of' },
    { text: 'Top recommended cloud software solutions', lang: 'EN', intent: 'Best-of' },
    { text: 'Sasta aur efficient software alternatives kaunse hain', lang: 'HI-EN', intent: 'Best-of' },
    { text: 'Features, customer reviews and pricing comparison', lang: 'EN', intent: 'Direct' },
    { text: 'Which software tool is best for daily business management', lang: 'HI-EN', intent: 'Direct' },
    { text: 'Comparison with leading market software competitors', lang: 'EN', intent: 'Comparison' },
    { text: 'How to choose the right SaaS software for your workflow', lang: 'EN', intent: 'How-to' },
  ],
  'Skincare & Personal Care': [
    { text: 'Best skincare brand in India for daily use', lang: 'EN', intent: 'Best-of' },
    { text: 'Top dermatologist recommended skincare products 2026', lang: 'EN', intent: 'Best-of' },
    { text: 'Accha aur affordable skincare brand kaunsa hai', lang: 'HI-EN', intent: 'Best-of' },
    { text: 'Ingredients, customer reviews and side effect ratings', lang: 'EN', intent: 'Direct' },
    { text: 'Is this personal care brand suitable for sensitive skin', lang: 'HI-EN', intent: 'Direct' },
    { text: 'Skincare brand comparison with top beauty competitors', lang: 'EN', intent: 'Comparison' },
    { text: 'How to build an effective daily skincare routine', lang: 'EN', intent: 'How-to' },
  ],
  'FinTech & Banking': [
    { text: 'Best FinTech app for payments and investments in India', lang: 'EN', intent: 'Best-of' },
    { text: 'Top safe and secure financial services 2026', lang: 'EN', intent: 'Best-of' },
    { text: 'Sabse bharosemand banking aur investment app kaunsa hai', lang: 'HI-EN', intent: 'Best-of' },
    { text: 'Hidden charges, user reviews and security features', lang: 'EN', intent: 'Direct' },
    { text: 'Which digital payment app offers best cashback and rewards', lang: 'HI-EN', intent: 'Direct' },
    { text: 'FinTech comparison with top traditional banks', lang: 'EN', intent: 'Comparison' },
    { text: 'How to choose the safest digital wallet or trading platform', lang: 'EN', intent: 'How-to' },
  ],
  'E-Commerce & Retail': [
    { text: 'Best e-commerce shopping platform in India', lang: 'EN', intent: 'Best-of' },
    { text: 'Top recommended online shopping stores 2026', lang: 'EN', intent: 'Best-of' },
    { text: 'Sabse sasta aur fast delivery shopping website konsi hai', lang: 'HI-EN', intent: 'Best-of' },
    { text: 'Return policy, delivery speed and customer ratings', lang: 'EN', intent: 'Direct' },
    { text: 'Which retail store has genuine original products', lang: 'HI-EN', intent: 'Direct' },
    { text: 'E-commerce store comparison with market leaders', lang: 'EN', intent: 'Comparison' },
    { text: 'How to get maximum discounts and cashback on online orders', lang: 'EN', intent: 'How-to' },
  ],
  'EdTech & Learning': [
    { text: 'Best online learning platform for courses in India', lang: 'EN', intent: 'Best-of' },
    { text: 'Top recommended EdTech apps for skill development 2026', lang: 'EN', intent: 'Best-of' },
    { text: 'Sabse accha aur sasta online learning platform kaunsa hai', lang: 'HI-EN', intent: 'Best-of' },
    { text: 'Course quality, teacher reviews and certification validity', lang: 'EN', intent: 'Direct' },
    { text: 'Which learning app is best for competitive exam preparation', lang: 'HI-EN', intent: 'Direct' },
    { text: 'EdTech comparison with traditional coaching institutes', lang: 'EN', intent: 'Comparison' },
    { text: 'How to select the right online course for career growth', lang: 'EN', intent: 'How-to' },
  ],
  'HealthTech & Healthcare': [
    { text: 'Best HealthTech app for doctor consultation in India', lang: 'EN', intent: 'Best-of' },
    { text: 'Top recommended healthcare platforms 2026', lang: 'EN', intent: 'Best-of' },
    { text: 'Ghar baithe doctor consultation ke liye best app kaunsa hai', lang: 'HI-EN', intent: 'Best-of' },
    { text: 'Medicine delivery speed, lab test accuracy and ratings', lang: 'EN', intent: 'Direct' },
    { text: 'Which healthcare service offers fast medicine delivery', lang: 'HI-EN', intent: 'Direct' },
    { text: 'HealthTech app comparison for lab tests and consultations', lang: 'EN', intent: 'Comparison' },
    { text: 'How to order genuine medicines online safely', lang: 'EN', intent: 'How-to' },
  ],
  'Food & Beverage': [
    { text: 'Best food and beverage brand in India', lang: 'EN', intent: 'Best-of' },
    { text: 'Top healthy snack and drink options 2026', lang: 'EN', intent: 'Best-of' },
    { text: 'Sabse tasty aur healthy food products kaunse hain', lang: 'HI-EN', intent: 'Best-of' },
    { text: 'Nutritional value, ingredients and customer reviews', lang: 'EN', intent: 'Direct' },
    { text: 'Which food brand is best for daily consumption', lang: 'HI-EN', intent: 'Direct' },
    { text: 'Food brand comparison with top market competitors', lang: 'EN', intent: 'Comparison' },
    { text: 'How to pick organic and preservative-free food items', lang: 'EN', intent: 'How-to' },
  ],
  'Artificial Intelligence & ML': [
    { text: 'Best AI and Machine Learning tools for businesses 2026', lang: 'EN', intent: 'Best-of' },
    { text: 'Top recommended AI automation solutions in India', lang: 'EN', intent: 'Best-of' },
    { text: 'Sabse powerful aur sasta AI tool kaunsa hai', lang: 'HI-EN', intent: 'Best-of' },
    { text: 'API performance, accuracy and pricing breakdown', lang: 'EN', intent: 'Direct' },
    { text: 'Which AI platform is best for productivity and content', lang: 'HI-EN', intent: 'Direct' },
    { text: 'AI platform comparison with ChatGPT and Claude', lang: 'EN', intent: 'Comparison' },
    { text: 'How to integrate AI models into business workflow', lang: 'EN', intent: 'How-to' },
  ],
};

/**
 * Generate category-tailored query items
 */
export function generateCategoryQueries(categoryName: string, brandName?: string): QueryItem[] {
  const cleanCat = (categoryName || '').trim();
  const cleanBrand = (brandName || '').trim();

  // Look for exact match or partial match in presets
  const presetKey = Object.keys(CATEGORY_PRESETS).find(
    (key) => key.toLowerCase() === cleanCat.toLowerCase() || cleanCat.toLowerCase().includes(key.toLowerCase())
  );

  let rawQueries: Omit<QueryItem, 'id' | 'enabled'>[];

  if (presetKey && CATEGORY_PRESETS[presetKey]) {
    rawQueries = CATEGORY_PRESETS[presetKey];
  } else {
    // Dynamic fallback query generator for any custom category
    const catLabel = cleanCat || 'products & services';
    rawQueries = [
      { text: `Best ${catLabel} brand in India 2026`, lang: 'EN', intent: 'Best-of' },
      { text: `Top recommended options for ${catLabel}`, lang: 'EN', intent: 'Best-of' },
      { text: `Sabse accha aur sasta ${catLabel} kaunsa hai`, lang: 'HI-EN', intent: 'Best-of' },
      { text: `${cleanBrand ? cleanBrand + ' ' : ''}customer reviews and ratings in ${catLabel}`, lang: 'EN', intent: 'Direct' },
      { text: `Which brand is best for daily usage in ${catLabel}`, lang: 'HI-EN', intent: 'Direct' },
      { text: `Top ${catLabel} comparison with market competitors`, lang: 'EN', intent: 'Comparison' },
      { text: `How to choose the right ${catLabel} for your needs`, lang: 'EN', intent: 'How-to' },
    ];
  }

  // Map to QueryItem with unique IDs and enabled by default
  return rawQueries.map((q, idx) => ({
    ...q,
    id: `q-${Date.now()}-${idx}`,
    enabled: true,
  }));
}
