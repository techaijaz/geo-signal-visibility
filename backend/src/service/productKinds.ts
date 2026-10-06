// What a product is, from its title, for every D2C category: the kind ("serum", "kurta"), the
// occasions buyers ask about, and the words that describe a product rather than name it.
// Tables are matched on the title, not the brand's category: many brands keep the default
// "E-Commerce & Retail" category whatever they sell.

interface IKind {
    kind: string
    re: RegExp
    // Hinglish occasion questions; "{k}" is the kind. The second one goes in English-free slot 4.
    occasions: [string, string]
}

const FRAGRANCE: [string, string] = ['Office ke liye long lasting {k} kaunsa hai', 'Shaadi ke liye best {k} kaunsa hai']

// Order matters: the first match wins, so narrow kinds come before broad ones
const KINDS: IKind[] = [
    // Fragrance
    { kind: 'attar', re: /\b(attars?|ittars?|itr)\b/i, occasions: FRAGRANCE },
    { kind: 'bakhoor', re: /\b(bakhoor|bakhur|bukhoor)\b/i, occasions: ['Ghar ke liye best {k} kaunsa hai', 'Eid ke liye best {k} kaunsa hai'] },
    { kind: 'deodorant', re: /\bdeo(dorant)?s?\b/i, occasions: ['Gym ke liye best {k} kaunsa hai', 'Garmi me long lasting {k} kaunsa hai'] },
    { kind: 'perfume', re: /\b(perfumes?|parfum|edp|edt|fragrances?|cologne|body mist)\b/i, occasions: FRAGRANCE },
    // Skincare and hair
    {
        kind: 'sunscreen',
        re: /\b(sunscreen|sunblock|spf)\b/i,
        occasions: ['Garmi me oily skin ke liye kaunsa {k} accha hai', 'Daily use ke liye best {k}']
    },
    {
        kind: 'face wash',
        re: /\b(face ?wash|cleanser)\b/i,
        occasions: ['Garmi me oily skin ke liye kaunsa {k} accha hai', 'Pimples ke liye best {k} kaunsa hai']
    },
    {
        kind: 'serum',
        re: /\bserums?\b/i,
        occasions: ['Garmi me oily skin ke liye kaunsa {k} accha hai', 'Shaadi se pehle glowing skin ke liye best {k}']
    },
    {
        kind: 'moisturiser',
        re: /\b(moisturi[sz]er|moisturi[sz]ing cream|face cream)\b/i,
        occasions: ['Winter me dry skin ke liye best {k}', 'Oily skin ke liye kaunsa {k} accha hai']
    },
    { kind: 'shampoo', re: /\bshampoos?\b/i, occasions: ['Hair fall ke liye best {k} kaunsa hai', 'Daily use ke liye mild {k}'] },
    { kind: 'hair oil', re: /\bhair oil\b/i, occasions: ['Hair fall ke liye best {k} kaunsa hai', 'Lambe baalon ke liye kaunsa {k} accha hai'] },
    // Beauty
    { kind: 'lipstick', re: /\blipsticks?\b/i, occasions: ['Office ke liye long lasting {k} kaunsi hai', 'Shaadi ke liye best {k} shade'] },
    { kind: 'kajal', re: /\b(kajal|kohl|eyeliner)\b/i, occasions: ['Pure din tikne wala {k} kaunsa hai', 'Shaadi ke liye best {k}'] },
    { kind: 'foundation', re: /\bfoundation\b/i, occasions: ['Oily skin ke liye kaunsa {k} accha hai', 'Shaadi ke liye best {k}'] },
    // Fashion
    { kind: 'saree', re: /\b(sarees?|saris?)\b/i, occasions: ['Shaadi ke liye best {k} kaunsi hai', 'Office ke liye halki {k}'] },
    { kind: 'kurta', re: /\b(kurtas?|kurtis?)\b/i, occasions: ['Shaadi ke liye best {k} kaunsa hai', 'Office ke liye comfortable {k}'] },
    {
        kind: 'sneakers',
        re: /\b(sneakers?|running shoes|shoes)\b/i,
        occasions: ['Daily walk ke liye best {k} kaunse hain', 'College ke liye stylish {k}']
    },
    { kind: 'shirt', re: /\b(shirts?|t-?shirts?|tees?)\b/i, occasions: ['Office ke liye best {k} kaunsi hai', 'Garmi ke liye cotton {k}'] },
    { kind: 'jeans', re: /\bjeans\b/i, occasions: ['Daily wear ke liye best {k}', 'College ke liye stylish {k}'] },
    { kind: 'dress', re: /\b(dress|dresses|gown)\b/i, occasions: ['Party ke liye best {k} kaunsi hai', 'Shaadi ke liye best {k}'] },
    // Jewellery and watches
    { kind: 'earrings', re: /\b(earrings?|jhumkas?|studs)\b/i, occasions: ['Shaadi ke liye best {k} kaunsi hain', 'Office ke liye simple {k}'] },
    {
        kind: 'necklace',
        re: /\b(necklaces?|chains?|pendants?|mangalsutra)\b/i,
        occasions: ['Shaadi ke liye best {k} kaunsa hai', 'Gift ke liye best {k}']
    },
    { kind: 'bracelet', re: /\b(bracelets?|bangles?|kada)\b/i, occasions: ['Gift ke liye best {k} kaunsa hai', 'Daily wear ke liye {k}'] },
    { kind: 'ring', re: /\brings?\b/i, occasions: ['Engagement ke liye best {k} kaunsi hai', 'Gift ke liye best {k}'] },
    { kind: 'watch', re: /\b(watch|watches)\b/i, occasions: ['Office ke liye best {k} kaunsi hai', 'Gift ke liye best {k}'] },
    // Food and wellness
    {
        kind: 'protein powder',
        re: /\b(whey|protein powder|protein)\b/i,
        occasions: ['Gym ke liye best {k} kaunsa hai', 'Beginners ke liye kaunsa {k} accha hai']
    },
    {
        kind: 'multivitamin',
        re: /\b(multivitamins?|vitamin tablets?|supplements?)\b/i,
        occasions: ['Daily energy ke liye best {k}', 'Gym jaane walon ke liye {k}']
    },
    { kind: 'tea', re: /\b(green tea|tea)\b/i, occasions: ['Weight loss ke liye kaunsi {k} acchi hai', 'Gift ke liye best {k}'] },
    { kind: 'coffee', re: /\bcoffee\b/i, occasions: ['Ghar pe cafe jaisi {k} ke liye kaunsi acchi hai', 'Gift ke liye best {k}'] },
    { kind: 'masala', re: /\b(masalas?|spices?)\b/i, occasions: ['Ghar ke khane ke liye best {k} kaunsa hai', 'Biryani ke liye best {k}'] },
    { kind: 'honey', re: /\bhoney\b/i, occasions: ['Daily use ke liye pure {k} kaunsa hai', 'Gift ke liye best {k}'] },
    { kind: 'chocolate', re: /\bchocolates?\b/i, occasions: ['Gift ke liye best {k} kaunsi hai', 'Diwali ke liye {k} hamper'] },
    // Baby
    { kind: 'diapers', re: /\b(diapers?|nappies)\b/i, occasions: ['Newborn ke liye best {k} kaunse hain', 'Raat ke liye best {k}'] },
    { kind: 'baby lotion', re: /\bbaby (lotion|oil|cream)\b/i, occasions: ['Newborn ke liye safe {k} kaunsa hai', 'Winter me baby ke liye {k}'] },
    // Home
    { kind: 'bedsheet', re: /\b(bedsheets?|bed sheets?)\b/i, occasions: ['Garmi ke liye best {k} kaunsi hai', 'Gift ke liye best {k}'] },
    { kind: 'candle', re: /\bcandles?\b/i, occasions: ['Diwali ke liye best {k}', 'Gift ke liye best {k}'] },
    // Electronics
    { kind: 'earbuds', re: /\b(earbuds|tws|earphones)\b/i, occasions: ['Office ke liye best {k} kaunse hain', 'Gym ke liye best {k}'] },
    { kind: 'headphones', re: /\bheadphones?\b/i, occasions: ['Office calls ke liye best {k} kaunse hain', 'Gaming ke liye best {k}'] },
    { kind: 'smartwatch', re: /\bsmart ?watch(es)?\b/i, occasions: ['Fitness ke liye best {k} kaunsi hai', 'Gift ke liye best {k}'] },
    { kind: 'power bank', re: /\bpower ?banks?\b/i, occasions: ['Travel ke liye best {k} kaunsa hai', 'Office ke liye best {k}'] },
    // Pets
    { kind: 'dog food', re: /\b(dog food|puppy food)\b/i, occasions: ['Puppy ke liye best {k} kaunsa hai', 'Daily feeding ke liye best {k}'] },
    { kind: 'cat food', re: /\bcat food\b/i, occasions: ['Kitten ke liye best {k} kaunsa hai', 'Daily feeding ke liye best {k}'] }
]

// For a Shopify product type ("Wallets") with no row above
const DEFAULT_OCCASIONS: [string, string] = ['Gift ke liye best {k} kaunsa hai', 'Daily use ke liye best {k}']

// Shopify's own product types that say nothing about the product
const NOT_A_KIND = new Set(['variable', 'simple', 'default', 'product', 'products', 'grouped', 'external', 'bundle'])

export const productKind = (title: string, productType = ''): { kind: string; occasions: [string, string] } | null => {
    // "Smart watch" before "watch": try the longest-named kinds whose pattern names a compound first
    const row = KINDS.find((k) => k.re.test(title))
    if (row) return { kind: row.kind, occasions: row.occasions }
    const type = productType.trim().toLowerCase()
    if (/^[a-z][a-z &-]{2,30}$/.test(type) && !NOT_A_KIND.has(type)) return { kind: type, occasions: DEFAULT_OCCASIONS }
    return null
}

// Words that describe a product rather than name it; the short name is what comes before the first
export const FILLER_WORDS = new Set(
    // Everywhere
    (
        'premium original luxury new set combo pack gift for men women him her with and by from unisex ' +
        'sample samples tester testers special pure natural organic herbal ayurvedic ' +
        // Fragrance
        'fragrance fragrances alcohol free long lasting attar attars ittar perfume perfumes parfum eau de edp edt spray ' +
        'powerful strong sweet fresh aromatic arabic scent ' +
        // Skincare, beauty, fashion
        'face body skin cotton linen printed embroidered'
    ).split(' ')
)

// One-word names that would match every answer in their category
export const GENERIC_WORDS = new Set(
    // Fragrance
    (
        'oud rose amber musk sandal sandalwood jasmine vanilla saffron kesar mogra lavender leather tobacco bakhoor kasturi ' +
        'citrus lemon aqua ocean wood woody spice spicy floral fruity sweet ' +
        // Colours and common words in any category
        'classic gold black white blue silver royal premium original fresh noir red green pink night ' +
        'glow daily gentle basic essential pure natural signature everyday regular ' +
        // Common product words
        'serum cream lotion kurta saree shirt tea coffee honey candle watch ring'
    ).split(' ')
)
