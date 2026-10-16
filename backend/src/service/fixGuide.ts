import mongoose from 'mongoose'
import auditModel from '../model/auditModel'
import developerSendModel from '../model/developerSendModel'

// Fix guide: for every kind of task the app gives a founder, who usually does it, plain steps for a Shopify
// store and for other sites, and a note for a developer. Written by us, never by an AI, so menu names are right.
export type FixKind =
    | 'crawler-access'
    | 'llms-txt'
    | 'product-schema'
    | 'faq-schema'
    | 'rating-schema'
    | 'js-content'
    | 'collection-schema'
    | 'reviews'
    | 'description'
    | 'alt-text'
    | 'title-meta'
    | 'price-stock'
    | 'product-ids'
    | 'images'
    | 'faq-page'
    | 'comparison-page'
    | 'marketplace'
    | 'outreach'
    | 'forums'
    | 'other'

export interface IFixGuide {
    kind: FixKind
    who: 'you' | 'developer'
    title: string
    steps: { shopify: string[]; other: string[] }
    forDeveloper: string
}

const g = (kind: FixKind, who: IFixGuide['who'], title: string, shopify: string[], other: string[], forDeveloper: string): IFixGuide => ({
    kind,
    who,
    title,
    steps: { shopify, other },
    forDeveloper
})

const TEST_RICH = 'Test a page at search.google.com/test/rich-results to check it worked.'

export const FIX_GUIDES: Record<FixKind, IFixGuide> = {
    'crawler-access': g(
        'crawler-access',
        'developer',
        'Let AI crawlers read your site',
        [
            'In Shopify admin, go to Online Store → Themes, click ⋯ next to your theme, then Edit code.',
            'Under Templates, open robots.txt.liquid (or click Add a new template → robots.txt).',
            'Make sure there is no Disallow rule for GPTBot, ClaudeBot, Google-Extended or PerplexityBot.',
            'Save, then open yourstore.com/robots.txt to check the rules.'
        ],
        [
            'Ask whoever manages your website for the robots.txt file at the root of your site.',
            'Remove any Disallow rule for GPTBot, ClaudeBot, Google-Extended or PerplexityBot.',
            'Open yoursite.com/robots.txt to check the rules.'
        ],
        'Allow GPTBot, ClaudeBot, Google-Extended and PerplexityBot in robots.txt (no Disallow for them). On Shopify, edit templates/robots.txt.liquid. Check /robots.txt after deploying.'
    ),
    'llms-txt': g(
        'llms-txt',
        'developer',
        'Publish an llms.txt file',
        [
            'Shopify does not let you add a file at yourstore.com/llms.txt from the admin.',
            'Search the Shopify App Store for "llms.txt" and install an app that publishes it, or ask your developer.',
            'Keep it short: who you are, what you sell, your main product pages and policies.',
            'Open yourstore.com/llms.txt to check it shows.'
        ],
        [
            'Ask your developer or host to add a plain text file named llms.txt at the root of your site.',
            'Keep it short: who you are, what you sell, your main product pages and policies.',
            'Open yoursite.com/llms.txt to check it shows.'
        ],
        'Serve a text/markdown file at /llms.txt (spec: llmstxt.org): a title, a one-line summary, then links to key pages. On Shopify use an app or an app proxy; root files cannot be uploaded directly.'
    ),
    'product-schema': g(
        'product-schema',
        'developer',
        'Add Product schema to product pages',
        [
            'Many Shopify themes already add Product schema. Open a product page and test it.',
            TEST_RICH,
            'If "Product" is missing, check your theme or SEO app settings for structured data.',
            'If there is no setting, send this task to your developer.'
        ],
        [TEST_RICH, 'If "Product" is missing, your site needs Product schema (JSON-LD) on each product page.', 'Send this task to your developer.'],
        'Add Product JSON-LD in the server-rendered HTML of each product page: name, image, description, brand, sku, offers (price, priceCurrency, availability) and aggregateRating if you have reviews. On Shopify, put it in the product section/template.'
    ),
    'faq-schema': g(
        'faq-schema',
        'developer',
        'Add FAQPage schema',
        [
            'Write 3 to 5 questions buyers ask, with short answers (the Fixes page can write them for you).',
            'In Online Store → Themes → Customize, open a product page and add a Collapsible row or FAQ block.',
            'An FAQ block does not always add FAQPage schema. Send the schema code to your developer, or use an FAQ app that adds it.',
            TEST_RICH
        ],
        [
            'Write 3 to 5 questions buyers ask, with short answers.',
            'Add them to the page as an FAQ section.',
            'Send the FAQPage schema code to your developer to add.',
            TEST_RICH
        ],
        'Add FAQPage JSON-LD with the same questions and answers that are visible on the page, in the server-rendered HTML. Answers must match the page text.'
    ),
    'rating-schema': g(
        'rating-schema',
        'developer',
        'Show your star ratings to AI',
        [
            'Open your review app (for example Judge.me or Loox) in Shopify admin → Apps.',
            'In its settings, turn on rich snippets, SEO or Google schema for reviews.',
            TEST_RICH,
            'No setting in your app? Send this task to your developer.'
        ],
        ['Check that your reviews show on the product page.', TEST_RICH, 'If ratings are missing, send this task to your developer.'],
        'Add aggregateRating (ratingValue, reviewCount) to the Product JSON-LD, rendered in the HTML, not injected by JavaScript after load.'
    ),
    'js-content': g(
        'js-content',
        'developer',
        'Put product details in the page HTML',
        [
            'Open a product page, right-click and choose View page source.',
            'Search for the product name, price and description. If they are missing, an app or theme section loads them later with JavaScript.',
            'AI crawlers do not run JavaScript, so they see an empty page.',
            'Send this task to your developer.'
        ],
        [
            'Open a product page, right-click and choose View page source.',
            'Search for the product name, price and description. If they are missing, they load later with JavaScript.',
            'Send this task to your developer.'
        ],
        'Render the product name (h1), price, description and rating in the server HTML (Liquid on Shopify) instead of client-side JavaScript. Check with curl or View source; Website audit → AI crawler view shows what AI sees.'
    ),
    'collection-schema': g(
        'collection-schema',
        'developer',
        'Add schema to collection pages',
        [
            'Open one of your collection pages and test it.',
            TEST_RICH,
            'Many themes add schema to products only. If none shows, send this task to your developer.'
        ],
        ['Open one of your category pages and test it.', TEST_RICH, 'If none shows, send this task to your developer.'],
        'Add CollectionPage or ItemList JSON-LD to the collection template listing the products (name, url) shown on the page.'
    ),
    reviews: g(
        'reviews',
        'you',
        'Collect more customer reviews',
        [
            'Install a review app from the Shopify App Store (Judge.me has a free plan).',
            'Turn on review request emails a few days after delivery.',
            'Email or WhatsApp your recent customers and ask for an honest review.',
            'Reply to reviews, good and bad.'
        ],
        [
            'Pick one place for reviews: your site, Google Business Profile or Trustpilot.',
            'Ask every customer for a review a few days after delivery.',
            'Reply to reviews, good and bad.'
        ],
        'If the store uses a review app, make sure reviews render in the product page HTML and in Product schema (aggregateRating).'
    ),
    description: g(
        'description',
        'you',
        'Write fuller product descriptions',
        [
            'In Shopify admin, go to Products and open the product.',
            'In Description, write at least 50 words: what it is, notes or ingredients, size, who it is for and how to use it.',
            'Use the words buyers search for (for example "alcohol free attar").',
            'Click Save.'
        ],
        [
            'Open the product in your website admin.',
            'Write at least 50 words: what it is, notes or ingredients, size, who it is for and how to use it.',
            'Save and check the product page.'
        ],
        'Make sure the description is plain text in the product page HTML, not inside an image or an app widget loaded later.'
    ),
    'alt-text': g(
        'alt-text',
        'you',
        'Add alt text to product images',
        [
            'Go to Products and open the product.',
            'Click an image in Media, then Add alt text.',
            'Write a short line that names the product, like "Silk Oud attar 12 ml bottle". Save.'
        ],
        [
            'Open the product in your website admin.',
            'For each image, fill in the alt text field.',
            'Write a short line that names the product. Save.'
        ],
        'Every product image needs an alt attribute naming the product; check the theme outputs the alt text set in the admin.'
    ),
    'title-meta': g(
        'title-meta',
        'you',
        'Improve page titles and descriptions',
        [
            'Open the product (or collection) and scroll to Search engine listing, then click Edit.',
            'Write a page title under 60 characters with the product name and type.',
            'Write a description under 160 characters that says what it is and who it is for.',
            'Click Save.'
        ],
        [
            'Open the page in your website admin or SEO plugin.',
            'Write a title under 60 characters and a description under 160 characters.',
            'Save the changes.'
        ],
        'Check the theme outputs <title> and <meta name="description"> from the admin fields.'
    ),
    'price-stock': g(
        'price-stock',
        'you',
        'Fix price and stock',
        [
            'Go to Products and open the product.',
            'Check the Price is set and correct.',
            'Under Inventory, make sure stock is tracked and above 0, or mark the product as sold out.',
            'Click Save.'
        ],
        ['Open the product in your website admin.', 'Check the price is set and correct.', 'Set the stock, or mark it as out of stock. Save.'],
        'Price and availability must be in the HTML and in Product schema offers (price, priceCurrency, availability), not only loaded by an app.'
    ),
    'product-ids': g(
        'product-ids',
        'you',
        'Fill in brand, type and barcode',
        [
            'Go to Products and open the product.',
            'Set Vendor to your brand name and Product type (for example "Attar").',
            'Under Variants, fill in Barcode (GTIN or EAN) if you have one.',
            'Click Save.'
        ],
        [
            'Open the product in your website admin.',
            'Fill in the brand, the product category and the barcode (GTIN or EAN) if you have one.',
            'Save the changes.'
        ],
        'Expose brand, gtin13/gtin and category in Product schema and the product feed.'
    ),
    images: g(
        'images',
        'you',
        'Add clear product photos',
        [
            'Go to Products and open the product.',
            'In Media, click Add and upload at least 3 clear JPG or PNG photos.',
            'Show the front, the label and the product in use. Click Save.'
        ],
        [
            'Open the product in your website admin.',
            'Upload at least 3 clear JPG or PNG photos.',
            'Show the front, the label and the product in use. Save.'
        ],
        'Use JPG or PNG main images (not WebP-only or SVG) and include them in Product schema image.'
    ),
    'faq-page': g(
        'faq-page',
        'you',
        'Publish an FAQ page',
        [
            'On the Fixes page, generate the FAQ and click Copy text.',
            'In Shopify admin, go to Online Store → Pages → Add page.',
            'Give it a title like "Frequently asked questions" and paste the text.',
            'Click Save, then add the page to your menu in Online Store → Navigation.'
        ],
        [
            'On the Fixes page, generate the FAQ and click Copy text.',
            'Create a new page on your site and paste the text.',
            'Publish it and link it from your menu.'
        ],
        'Optionally add the FAQPage JSON-LD from the Fixes page (Copy FAQ schema) to the page HTML.'
    ),
    'comparison-page': g(
        'comparison-page',
        'you',
        'Publish a comparison page',
        [
            'On the Fixes page, generate the comparison and click Copy HTML.',
            'In Shopify admin, go to Online Store → Pages → Add page.',
            'Click the <> button in the editor, paste the HTML and give the page a title.',
            'Click Save, then link it from your menu or a product page.'
        ],
        [
            'On the Fixes page, generate the comparison and click Copy HTML.',
            'Create a new page on your site and paste it into the HTML view.',
            'Publish it and link it from your menu.'
        ],
        'Publish the HTML as a normal page (server-rendered), linked from navigation or relevant product pages.'
    ),
    marketplace: g(
        'marketplace',
        'you',
        'List your products on marketplaces',
        [
            'Open your seller account (Amazon Seller Central, Flipkart Seller Hub or Nykaa) or create one.',
            'List your best products with the same names, photos and descriptions as your store.',
            'Ask buyers there for reviews too.',
            'Add links to these listings in your store footer.'
        ],
        [
            'Open your seller account (Amazon Seller Central, Flipkart Seller Hub or Nykaa) or create one.',
            'List your best products with the same names, photos and descriptions as your site.',
            'Add links to these listings on your site.'
        ],
        'Add sameAs links to the marketplace listings in the Organization schema.'
    ),
    outreach: g(
        'outreach',
        'you',
        'Get mentioned on pages AI reads',
        [
            'Open Competitors → Where AI reads and pick a page that names a competitor but not you.',
            'Find the writer or site contact on that page.',
            'Send a short, polite email: who you are, why your product fits, and offer a sample.',
            'Keep a list of who you contacted and follow up once after a week.'
        ],
        [
            'Open Competitors → Where AI reads and pick a page that names a competitor but not you.',
            'Find the writer or site contact on that page.',
            'Send a short, polite email and offer a sample. Follow up once after a week.'
        ],
        'No code needed. If the page links to stores, make sure your product page URL is stable and fast.'
    ),
    forums: g(
        'forums',
        'you',
        'Join forum and Reddit discussions',
        [
            'Find 2 or 3 active Reddit, Quora or forum threads about your category.',
            'Answer the question helpfully from your own experience.',
            'Mention your brand only where it truly fits, and say you work there.',
            'Do not post the same text in many places.'
        ],
        [
            'Find 2 or 3 active Reddit, Quora or forum threads about your category.',
            'Answer helpfully and mention your brand only where it fits.',
            'Do not post the same text in many places.'
        ],
        'No code needed: this is community work, not a website change.'
    ),
    other: g(
        'other',
        'developer',
        'Website task',
        [
            'Read the task above.',
            'If it is about your products, pages or listings, open them in Shopify admin and update them.',
            'If it is about your theme, code or settings you do not know, send it to your developer.'
        ],
        [
            'Read the task above.',
            'If it is about your products, pages or listings, update them in your website admin.',
            'If it is about code or settings you do not know, send it to your developer.'
        ],
        'Details are in the task above. Reply to the sender if anything is unclear.'
    )
}

export const ALL_FIX_KINDS = Object.keys(FIX_GUIDES) as FixKind[]

export const guideFor = (kind?: string | null): IFixGuide => FIX_GUIDES[(kind || '') as FixKind] ?? FIX_GUIDES.other

// Old saved recommendations have no kind; the first rule that matches wins (order matters)
const TEXT_RULES: Array<[RegExp, FixKind]> = [
    [/robots\.txt|crawler|gptbot|claudebot|google-extended|perplexitybot|unblock/i, 'crawler-access'],
    [/llms\.txt/i, 'llms-txt'],
    [/faq\s*page\s*schema|faqpage|faq.*schema|schema.*faq/i, 'faq-schema'],
    [/rating|aggregaterating|star/i, 'rating-schema'],
    [/\bvs\.?\b|versus|comparison/i, 'comparison-page'],
    [/\bfaq\b/i, 'faq-page'],
    [/review/i, 'reviews'],
    [/amazon|flipkart|nykaa|myntra|meesho|marketplace/i, 'marketplace'],
    [/reddit|subreddit|forum|quora/i, 'forums'],
    [/blog|outreach|press|\bpr\b|featured|influencer|listicle/i, 'outreach'],
    [/alt text/i, 'alt-text'],
    [/javascript|client-side|render/i, 'js-content'],
    [/collection/i, 'collection-schema'],
    [/schema|json-ld|structured data/i, 'product-schema'],
    [/description/i, 'description'],
    [/meta|title tag|page title/i, 'title-meta'],
    [/photo|image/i, 'images'],
    [/gtin|barcode|vendor|brand name/i, 'product-ids'],
    [/price|stock|inventory/i, 'price-stock']
]
export const kindFromText = (text: string): FixKind => TEXT_RULES.find(([re]) => re.test(text || ''))?.[1] ?? 'other'

const CHECK_KINDS: Record<'store-audit' | 'collection' | 'ai-view' | 'feed', Record<string, FixKind>> = {
    'store-audit': {
        schema: 'product-schema',
        price: 'price-stock',
        reviews: 'rating-schema',
        description: 'description',
        faq: 'faq-schema',
        alt: 'alt-text',
        meta: 'title-meta'
    },
    collection: { schema: 'collection-schema', description: 'description', meta: 'title-meta' },
    'ai-view': { name: 'js-content', price: 'js-content', rating: 'js-content', description: 'js-content', schema: 'product-schema' },
    feed: {
        description: 'description',
        title: 'title-meta',
        brand: 'product-ids',
        gtin: 'product-ids',
        category: 'product-ids',
        price: 'price-stock',
        stock: 'price-stock',
        image: 'images',
        images: 'images'
    }
}
export const kindForCheck = (surface: keyof typeof CHECK_KINDS, key: string): FixKind => CHECK_KINDS[surface][key] ?? 'other'

// The guides a response needs, once each
export const guidesFor = (kinds: Array<string | null | undefined>): Record<string, IFixGuide> =>
    Object.fromEntries([...new Set(kinds.map((k) => guideFor(k).kind))].map((k) => [k, FIX_GUIDES[k]]))

// What every surface needs to show guides: platform, the saved developer email and the guides for its kinds
export const guideContext = async (
    brand: { _id: unknown; developerEmail?: string | null; products?: Array<{ shopifyId?: string | null }> },
    kinds: Array<string | null | undefined>
) => {
    const fromProducts = (brand.products || []).some((p) => !!p.shopifyId)
    const audit = fromProducts ? null : await auditModel.findOne({ brandId: brand._id }).select('isShopify').lean()
    return {
        isShopify: fromProducts || !!audit?.isShopify,
        developerEmail: brand.developerEmail || '',
        guides: guidesFor(kinds),
        lastSent: await lastSends(String(brand._id))
    }
}

type KindedCheck = { key: string; pass?: boolean | null; kind?: string }
interface IAuditForKinds {
    storeAudit?: { pages?: Array<{ kind?: string; checks?: KindedCheck[] }> } | null
    aiView?: { pages?: Array<{ rows?: Array<{ key: string; missingForAi?: boolean; kind?: string }> }> } | null
}
// Sets a guide kind on every failing store audit check and AI view row (a plain copy of the audit); returns the kinds
export const withAuditKinds = (audit: IAuditForKinds | null | undefined): FixKind[] => {
    const kinds: FixKind[] = []
    for (const page of audit?.storeAudit?.pages || [])
        for (const c of page.checks || [])
            if (c.pass === false) kinds.push((c.kind = kindForCheck(page.kind === 'collection' ? 'collection' : 'store-audit', c.key)))
    for (const page of audit?.aiView?.pages || [])
        for (const r of page.rows || []) if (r.missingForAi) kinds.push((r.kind = kindForCheck('ai-view', r.key)))
    return kinds
}

// Same for the product feed: failing product checks and the summary of top gaps
export const withFeedKinds = (
    feed: { products?: Array<{ checks?: KindedCheck[] }>; summary?: Array<{ key: string; kind?: string }> } | null | undefined
): FixKind[] => {
    const kinds: FixKind[] = []
    for (const p of feed?.products || []) for (const c of p.checks || []) if (c.pass === false) kinds.push((c.kind = kindForCheck('feed', c.key)))
    for (const s of feed?.summary || []) kinds.push((s.kind = kindForCheck('feed', s.key)))
    return kinds
}

// The latest "Send to developer" per task of a brand, keyed like developerTask.taskKey
export const lastSends = async (brandId: string): Promise<Record<string, { to: string; at: Date }>> => {
    if (!mongoose.isValidObjectId(brandId)) return {}
    const rows = await developerSendModel.aggregate([
        { $match: { brandId: new mongoose.Types.ObjectId(brandId) } },
        { $sort: { sentAt: -1 } },
        { $group: { _id: '$taskKey', to: { $first: '$to' }, at: { $first: '$sentAt' } } }
    ])
    return Object.fromEntries(rows.map((r) => [r._id as string, { to: r.to as string, at: r.at as Date }]))
}
