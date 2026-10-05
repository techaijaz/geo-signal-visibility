// Questions Indian shoppers actually ask an AI: Hinglish, with a rupee budget, or for an occasion.
// Curated per-vertical templates (no AI), plus AI suggestions that are validated before anyone sees them.
import aiService from './aiService'
import logger from '../util/loger'

export type QueryLang = 'EN' | 'HI-EN'
export type QueryIntent = 'Best-of' | 'Price' | 'Occasion' | 'Comparison' | 'Direct' | 'How-to'

export interface ISuggestedQuery {
    text: string
    lang: QueryLang
    intent: QueryIntent
}

export type Vertical =
    | 'fragrance'
    | 'skincare'
    | 'beauty'
    | 'fashion'
    | 'jewellery'
    | 'food'
    | 'wellness'
    | 'baby'
    | 'home'
    | 'electronics'
    | 'pet'
    | 'retail'
    | 'saas'
    | 'fintech'
    | 'edtech'
    | 'healthtech'
    | 'ai'
    | 'generic'

// First match wins, so the narrow D2C verticals come before the broad ones
const VERTICAL_RULES: [Vertical, RegExp][] = [
    ['fragrance', /perfume|fragrance|attar|ittar|\bitr\b|\boud\b|\bdeo|scent|cologne/i],
    ['skincare', /skin|personal care|hair ?care/i],
    ['beauty', /beauty|cosmetic|make-?up/i],
    ['jewellery', /jewel|watch|luxury/i],
    ['fashion', /fashion|apparel|clothing|footwear|ethnic wear|accessor/i],
    ['baby', /baby|kids|mother/i],
    ['pet', /\bpets?\b/i],
    ['healthtech', /healthtech|healthcare/i],
    ['wellness', /fitness|wellness|supplement|nutrition|ayurved|protein/i],
    ['food', /food|beverage|snack|\btea\b|coffee|spice|masala/i],
    ['home', /home|furniture|living|decor|kitchen/i],
    ['electronics', /electronic|gadget/i],
    ['fintech', /fintech|banking|insur/i],
    ['ai', /artificial intelligence|\bai\b|machine learning/i],
    ['edtech', /edtech|learning|education/i],
    ['saas', /saas|software/i],
    // Broad picks (the onboarding default is "E-Commerce & Retail")
    ['retail', /e-?commerce|retail|\bd2c\b|\bother\b|\bgeneral\b/i]
]

export const detectVertical = (category: string): Vertical => {
    const c = (category || '').trim()
    if (!c) return 'retail'
    return VERTICAL_RULES.find(([, re]) => re.test(c))?.[0] ?? 'generic'
}

const q = (text: string, lang: QueryLang, intent: QueryIntent): ISuggestedQuery => ({ text, lang, intent })

// Order matters: onboarding pre-ticks only the first maxQueries (Free = 3), so every D2C list
// starts with a Hinglish price question, a Hinglish occasion question and an English best-of.
const TEMPLATES: Record<Exclude<Vertical, 'generic'>, ISuggestedQuery[]> = {
    fragrance: [
        q('500 ke andar sabse accha attar', 'HI-EN', 'Price'),
        q('Shaadi ke liye kaunsa perfume lagayein', 'HI-EN', 'Occasion'),
        q('Best long lasting perfume for men in India', 'EN', 'Best-of'),
        q('Namaz ke liye alcohol free attar kaunsa accha hai', 'HI-EN', 'Occasion'),
        q('Best oud attar under ₹1000', 'EN', 'Price'),
        q('Office ke liye long lasting perfume jo zyada strong na ho', 'HI-EN', 'Occasion'),
        q('Eid ke liye best attar konsa hai', 'HI-EN', 'Occasion'),
        q('Best perfume for women under ₹1500 in India', 'EN', 'Price'),
        q('Gift ke liye accha perfume set 2000 ke andar', 'HI-EN', 'Occasion'),
        q('Garmi me lagane ke liye fresh perfume kaunsa hai', 'HI-EN', 'Occasion'),
        q('Indian attar brands vs imported perfumes, kaunsa better hai', 'HI-EN', 'Comparison'),
        q('Original attar online kahan se kharidein', 'HI-EN', 'Direct')
    ],
    skincare: [
        q('500 ke andar sabse accha face wash oily skin ke liye', 'HI-EN', 'Price'),
        q('Shaadi se pehle glowing skin ke liye kya use karein', 'HI-EN', 'Occasion'),
        q('Best skincare brand in India for daily use', 'EN', 'Best-of'),
        q('Best sunscreen for Indian skin under ₹500', 'EN', 'Price'),
        q('Garmi me oily skin ke liye best moisturizer', 'HI-EN', 'Occasion'),
        q('Sensitive skin ke liye chemical free skincare brand', 'HI-EN', 'Direct'),
        q('Best vitamin C serum in India under ₹800', 'EN', 'Price'),
        q('Pimples aur dark spots ke liye kaunsa serum accha hai', 'HI-EN', 'Direct'),
        q('Winter me dry skin ke liye best cream', 'HI-EN', 'Occasion'),
        q('Ayurvedic vs chemical skincare, kaunsa better hai', 'HI-EN', 'Comparison')
    ],
    beauty: [
        q('300 ke andar sabse accha lipstick long lasting', 'HI-EN', 'Price'),
        q('Shaadi ke makeup ke liye best waterproof products', 'HI-EN', 'Occasion'),
        q('Best makeup brand in India for Indian skin tone', 'EN', 'Best-of'),
        q('Best foundation for Indian skin under ₹1000', 'EN', 'Price'),
        q('College ke liye daily makeup kit kya lein', 'HI-EN', 'Occasion'),
        q('Garmi me pasine me na bahne wala kajal', 'HI-EN', 'Occasion'),
        q('Cruelty free makeup brands in India', 'EN', 'Best-of'),
        q('Gift ke liye accha makeup hamper 1500 ke andar', 'HI-EN', 'Occasion'),
        q('Indian makeup brands vs international brands, kaunsa better hai', 'HI-EN', 'Comparison')
    ],
    fashion: [
        q('1000 ke andar sabse accha kurta online', 'HI-EN', 'Price'),
        q('Shaadi me pehenne ke liye best ethnic wear brand', 'HI-EN', 'Occasion'),
        q('Best clothing brands in India for quality and fit', 'EN', 'Best-of'),
        q('Best cotton shirts for men under ₹1500', 'EN', 'Price'),
        q('Office ke liye formal kapde kahan se lein', 'HI-EN', 'Occasion'),
        q('Diwali ke liye festive outfit online kahan milega', 'HI-EN', 'Occasion'),
        q('Garmi ke liye comfortable kapdon ka best brand', 'HI-EN', 'Occasion'),
        q('Best sneakers in India under ₹3000', 'EN', 'Price'),
        q('Online kapde size sahi aate hain kis brand ke', 'HI-EN', 'Direct'),
        q('Indian D2C fashion brands vs Zara and H&M, kaunsa better hai', 'HI-EN', 'Comparison')
    ],
    jewellery: [
        q('5000 ke andar sabse accha gold plated jewellery set', 'HI-EN', 'Price'),
        q('Shaadi ke liye best artificial jewellery brand', 'HI-EN', 'Occasion'),
        q('Best silver jewellery brands in India', 'EN', 'Best-of'),
        q('Best watch for men under ₹5000 in India', 'EN', 'Price'),
        q('Anniversary gift ke liye kaunsi jewellery lein', 'HI-EN', 'Occasion'),
        q('Daily wear ke liye anti tarnish jewellery', 'HI-EN', 'Occasion'),
        q('Hallmarked jewellery online kahan se kharidein', 'HI-EN', 'Direct'),
        q('Raksha Bandhan pe behen ke liye best gift jewellery', 'HI-EN', 'Occasion'),
        q('Lab grown diamond vs real diamond, kaunsa lein', 'HI-EN', 'Comparison')
    ],
    food: [
        q('200 ke andar sabse healthy snacks online', 'HI-EN', 'Price'),
        q('Diwali gifting ke liye best dry fruits box', 'HI-EN', 'Occasion'),
        q('Best healthy snack brands in India', 'EN', 'Best-of'),
        q('Best green tea in India under ₹500', 'EN', 'Price'),
        q('Office me khane ke liye healthy namkeen', 'HI-EN', 'Occasion'),
        q('Bachon ke liye bina preservative wale snacks', 'HI-EN', 'Direct'),
        q('Weight loss ke liye best breakfast cereal', 'HI-EN', 'Direct'),
        q('Ramzan me iftar ke liye best dates kaunse hain', 'HI-EN', 'Occasion'),
        q('Homemade jaisa achaar online kahan milega', 'HI-EN', 'Direct'),
        q('Organic vs regular food brands, paisa vasool kaunsa hai', 'HI-EN', 'Comparison')
    ],
    wellness: [
        q('2000 ke andar sabse accha whey protein', 'HI-EN', 'Price'),
        q('Gym shuru karne walon ke liye kaunsa supplement lein', 'HI-EN', 'Occasion'),
        q('Best protein powder brands in India that are genuine', 'EN', 'Best-of'),
        q('Best multivitamin for women in India under ₹800', 'EN', 'Price'),
        q('Vegetarian logon ke liye best protein source', 'HI-EN', 'Direct'),
        q('Fake supplement se kaise bachein, original kaise pehchane', 'HI-EN', 'How-to'),
        q('Weight loss ke liye ayurvedic product jo kaam kare', 'HI-EN', 'Direct'),
        q('Yoga mat under ₹1000 best quality', 'EN', 'Price'),
        q('Running ke liye best energy drink ya electrolyte', 'HI-EN', 'Occasion'),
        q('Ayurvedic vs allopathic supplements, kaunsa safe hai', 'HI-EN', 'Comparison')
    ],
    baby: [
        q('500 ke andar sabse accha baby lotion', 'HI-EN', 'Price'),
        q('New born baby gift ke liye kya lein', 'HI-EN', 'Occasion'),
        q('Best baby care brands in India that are toxin free', 'EN', 'Best-of'),
        q('Best diapers in India for rashes under ₹1000', 'EN', 'Price'),
        q('Sardi me baby ki skin ke liye best oil', 'HI-EN', 'Occasion'),
        q('Pregnancy me stretch marks ke liye kaunsi cream safe hai', 'HI-EN', 'Direct'),
        q('Bachon ke liye chemical free shampoo kaunsa hai', 'HI-EN', 'Direct'),
        q('Travel ke liye baby essentials kit', 'HI-EN', 'Occasion'),
        q('Ayurvedic baby products vs regular, kaunsa better hai', 'HI-EN', 'Comparison')
    ],
    home: [
        q('2000 ke andar sabse accha bedsheet set', 'HI-EN', 'Price'),
        q('Diwali pe ghar sajane ke liye best decor items', 'HI-EN', 'Occasion'),
        q('Best home decor brands in India online', 'EN', 'Best-of'),
        q('Best non-stick cookware set under ₹3000', 'EN', 'Price'),
        q('Housewarming gift ke liye kya lein', 'HI-EN', 'Occasion'),
        q('Chhote flat ke liye space saving furniture kahan milega', 'HI-EN', 'Direct'),
        q('Garmi me cotton bedsheet kaunsi best hai', 'HI-EN', 'Occasion'),
        q('Online furniture lena safe hai ya nahi, kis brand se lein', 'HI-EN', 'Direct'),
        q('Steel vs non-stick cookware, sehat ke liye kaunsa better', 'HI-EN', 'Comparison')
    ],
    electronics: [
        q('2000 ke andar sabse accha bluetooth earbuds', 'HI-EN', 'Price'),
        q('Gym ke liye sweat proof earphones kaunse lein', 'HI-EN', 'Occasion'),
        q('Best Indian electronics brands for quality and service', 'EN', 'Best-of'),
        q('Best smartwatch under ₹3000 in India', 'EN', 'Price'),
        q('Office calls ke liye best noise cancelling headphones', 'HI-EN', 'Occasion'),
        q('Travel ke liye best power bank kaunsa hai', 'HI-EN', 'Occasion'),
        q('Kis brand ki after sales service India me acchi hai', 'HI-EN', 'Direct'),
        q('Rakhi pe bhai ke liye gadget gift 1500 ke andar', 'HI-EN', 'Occasion'),
        q('Indian brands like boAt vs Sony, paisa vasool kaunsa', 'HI-EN', 'Comparison')
    ],
    pet: [
        q('1000 ke andar sabse accha dog food', 'HI-EN', 'Price'),
        q('Garmi me dog ko kya khilayein', 'HI-EN', 'Occasion'),
        q('Best pet food brands in India', 'EN', 'Best-of'),
        q('Best cat food in India under ₹800', 'EN', 'Price'),
        q('Puppy ke liye pehli baar kya kya lena chahiye', 'HI-EN', 'Occasion'),
        q('Dog ke liye tick aur flea ka best shampoo', 'HI-EN', 'Direct'),
        q('Indian street dog ke liye kaunsa food accha hai', 'HI-EN', 'Direct'),
        q('Travel me pet ke liye carrier kahan milega', 'HI-EN', 'Occasion'),
        q('Homemade vs packaged pet food, kaunsa better hai', 'HI-EN', 'Comparison')
    ],
    retail: [
        q('500 ke andar best online shopping deals kahan milte hain', 'HI-EN', 'Price'),
        q('Diwali sale me sabse accha discount kaunsi website deti hai', 'HI-EN', 'Occasion'),
        q('Best D2C brands in India to buy online', 'EN', 'Best-of'),
        q('Best online gifts under ₹1000 in India', 'EN', 'Price'),
        q('Shaadi ke gift online kahan se order karein', 'HI-EN', 'Occasion'),
        q('Cash on delivery aur easy return wale online stores', 'HI-EN', 'Direct'),
        q('Fast delivery wale Indian online brands kaunse hain', 'HI-EN', 'Best-of'),
        q('Original products online kaise pehchane, fake se kaise bachein', 'HI-EN', 'How-to'),
        q('Brand ki website vs Amazon Flipkart, kahan se lena better hai', 'HI-EN', 'Comparison')
    ],
    // Not D2C, kept from the earlier presets
    saas: [
        q('Best SaaS software for businesses in India 2026', 'EN', 'Best-of'),
        q('Sasta aur efficient software alternatives kaunse hain', 'HI-EN', 'Price'),
        q('Top recommended cloud software solutions', 'EN', 'Best-of'),
        q('Which software tool is best for daily business management', 'EN', 'Direct'),
        q('Chhote business ke liye best software 1000 rupaye mahine ke andar', 'HI-EN', 'Price'),
        q('Comparison with leading market software competitors', 'EN', 'Comparison')
    ],
    fintech: [
        q('Best FinTech app for payments and investments in India', 'EN', 'Best-of'),
        q('Sabse bharosemand banking aur investment app kaunsa hai', 'HI-EN', 'Best-of'),
        q('Top safe and secure financial services 2026', 'EN', 'Best-of'),
        q('Which digital payment app offers best cashback and rewards', 'EN', 'Direct'),
        q('Hidden charges, user reviews and security features', 'EN', 'Direct'),
        q('FinTech comparison with top traditional banks', 'EN', 'Comparison')
    ],
    edtech: [
        q('Best online learning platform for courses in India', 'EN', 'Best-of'),
        q('Sabse accha aur sasta online learning platform kaunsa hai', 'HI-EN', 'Price'),
        q('Top recommended EdTech apps for skill development 2026', 'EN', 'Best-of'),
        q('Which learning app is best for competitive exam preparation', 'EN', 'Direct'),
        q('Course quality, teacher reviews and certification validity', 'EN', 'Direct'),
        q('EdTech comparison with traditional coaching institutes', 'EN', 'Comparison')
    ],
    healthtech: [
        q('Best HealthTech app for doctor consultation in India', 'EN', 'Best-of'),
        q('Ghar baithe doctor consultation ke liye best app kaunsa hai', 'HI-EN', 'Best-of'),
        q('Top recommended healthcare platforms 2026', 'EN', 'Best-of'),
        q('Which healthcare service offers fast medicine delivery', 'EN', 'Direct'),
        q('Medicine delivery speed, lab test accuracy and ratings', 'EN', 'Direct'),
        q('HealthTech app comparison for lab tests and consultations', 'EN', 'Comparison')
    ],
    ai: [
        q('Best AI and Machine Learning tools for businesses 2026', 'EN', 'Best-of'),
        q('Sabse powerful aur sasta AI tool kaunsa hai', 'HI-EN', 'Price'),
        q('Top recommended AI automation solutions in India', 'EN', 'Best-of'),
        q('Which AI platform is best for productivity and content', 'EN', 'Direct'),
        q('API performance, accuracy and pricing breakdown', 'EN', 'Direct'),
        q('AI platform comparison with ChatGPT and Claude', 'EN', 'Comparison')
    ]
}

// Any other category: the category name is the noun, in phrasing that reads right singular or plural
const genericTemplates = (category: string): ISuggestedQuery[] => {
    const noun = category.trim().toLowerCase()
    return [
        q(`1000 ke andar best ${noun} online`, 'HI-EN', 'Price'),
        q(`Gift ke liye best ${noun} India me`, 'HI-EN', 'Occasion'),
        q(`Best ${noun} brands in India`, 'EN', 'Best-of'),
        q(`Best ${noun} under ₹500 in India`, 'EN', 'Price'),
        q(`Diwali ke liye ${noun} online kahan se lein`, 'HI-EN', 'Occasion'),
        q(`${noun} ke liye sabse bharosemand brand`, 'HI-EN', 'Best-of'),
        q(`Daily use ke liye best ${noun} brand`, 'HI-EN', 'Direct'),
        q(`Original ${noun} online kaise pehchane`, 'HI-EN', 'How-to'),
        q(`Indian vs international ${noun} brands, kaunsa better hai`, 'HI-EN', 'Comparison')
    ]
}

export const templateQueries = (category: string, brandName?: string): ISuggestedQuery[] => {
    const vertical = detectVertical(category)
    const list = vertical === 'generic' ? genericTemplates(category) : [...TEMPLATES[vertical]]
    const brand = (brandName || '').trim()
    // One branded question, last, so small plans keep the unbranded discovery questions
    if (brand) list.push(q(`${brand} reviews: original aur value for money hai ya nahi?`, 'HI-EN', 'Direct'))
    return list
}

// ---------- AI suggestions ----------

const HINGLISH_MARKERS =
    /\b(ke|ki|ka|liye|sabse|accha|acchi|acche|kaunsa|kaunsi|kaunse|konsa|konsi|andar|kahan|kaise|kya|hai|hain|lein|karein|wala|wale|wali|aur|me|mein|ya|nahi|chahiye)\b/gi
const INTENTS: QueryIntent[] = ['Best-of', 'Price', 'Occasion', 'Comparison', 'Direct', 'How-to']
const MAX_SUGGESTIONS = 12

// Two or more Hindi words in Roman script make it Hinglish ("me" alone is also English)
export const detectLang = (text: string): QueryLang => ((text.match(HINGLISH_MARKERS) || []).length >= 2 ? 'HI-EN' : 'EN')

const dedupeKey = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}₹]+/gu, ' ')
        .trim()

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The AI only proposes; anything branded, duplicated, linked or essay-like is dropped here
export const cleanSuggestions = (raw: unknown, brandName: string, existing: string[]): ISuggestedQuery[] => {
    if (!Array.isArray(raw)) return []
    const brand = brandName.trim()
    const brandRe = brand ? new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(brand)}($|[^\\p{L}\\p{N}])`, 'iu') : null
    const seen = new Set(existing.map(dedupeKey))
    const out: ISuggestedQuery[] = []
    for (const item of raw) {
        if (out.length >= MAX_SUGGESTIONS) break
        const obj = typeof item === 'string' ? { text: item } : item && typeof item === 'object' ? (item as Record<string, unknown>) : null
        if (!obj || typeof obj.text !== 'string') continue
        const text = obj.text
            .replace(/^\s*(\d+[.)]|[-*•])\s*/, '')
            .replace(/^["'“‘\s]+|["'”’\s]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        const words = text.split(' ').length
        if (words < 3 || words > 20 || text.length > 140) continue
        if (/https?:\/\/|www\.|\.com\b/i.test(text)) continue
        if (brandRe?.test(text)) continue
        const key = dedupeKey(text)
        if (!key || seen.has(key)) continue
        seen.add(key)
        const lang: QueryLang = obj.lang === 'EN' || obj.lang === 'HI-EN' ? obj.lang : detectLang(text)
        const intent: QueryIntent = INTENTS.includes(obj.intent as QueryIntent)
            ? (obj.intent as QueryIntent)
            : /₹|\bunder\b|\bke andar\b|\brs\.?\s?\d/i.test(text)
              ? 'Price'
              : 'Best-of'
        out.push({ text, lang, intent })
    }
    return out
}

const parseJsonArray = (s: string | null): unknown => {
    if (!s) return null
    try {
        const match = s.match(/\[[\s\S]*\]/)
        return JSON.parse(match ? match[0] : s)
    } catch {
        return null
    }
}

const promptFor = (brand: { name: string; website?: string; category: string; region?: string }) => {
    const examples = templateQueries(brand.category)
        .slice(0, 3)
        .map((t) => `- ${t.text}`)
        .join('\n')
    return `You help an Indian D2C brand find the questions its buyers ask ChatGPT, Gemini and Perplexity before buying.
Brand: ${brand.name}${brand.website ? ` (${brand.website})` : ''}
Category: ${brand.category}
Market: ${brand.region || 'India'}

Write ${MAX_SUGGESTIONS} questions real Indian shoppers would type when looking for products like this brand sells.
- Do NOT include the brand name ${brand.name}; these are discovery questions.
- Mix Hinglish (Hindi in Roman script, e.g. "ke liye", "sabse accha", "kaunsa") and simple English, about half each.
- Include rupee budgets ("500 ke andar", "under ₹1000"), occasions (shaadi, Eid, Diwali, Rakhi, office, gym, garmi, gifting) and real problems.
- Short, the way people type: 4 to 14 words. No numbering, no quotes.
Examples of the style:
${examples}

Reply with JSON only: [{"text": "...", "lang": "EN" | "HI-EN", "intent": "Best-of" | "Price" | "Occasion" | "Comparison" | "Direct" | "How-to"}]`
}

// Never throws: no AI key or a junk reply gives []. The caller sets withAiCallContext for cost logs.
export const suggestQueries = async (
    brand: { name: string; website?: string; category: string; region?: string },
    existing: string[]
): Promise<ISuggestedQuery[]> => {
    try {
        const reply = await aiService.callAnyAvailableAi(promptFor(brand), 1200)
        const suggestions = cleanSuggestions(parseJsonArray(reply), brand.name, existing)
        if (!suggestions.length) logger.warn('[querySuggestion] AI gave no usable suggestions')
        return suggestions
    } catch (error) {
        logger.warn('[querySuggestion] AI suggestions failed', { meta: error })
        return []
    }
}
