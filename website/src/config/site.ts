// Single source for everything the marketing pages say about the product, prices and company.
// Keep plan numbers in sync with backend/src/config/planLimits.ts and paymentService PLAN_PRICES.

export const APP_URL = (import.meta.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '')

export const links = {
    login: `${APP_URL}/login`,
    signup: `${APP_URL}/signup`
}

// Fill these in before going live — they appear in the footer and legal pages
export const company = {
    brand: 'Signal AI',
    legalName: '[Registered company name]',
    address: '[Registered office address, City, State, PIN]',
    gstin: '[GSTIN]',
    email: 'hello@geosignalai.com',
    salesEmail: 'sales@geosignalai.com',
    supportEmail: 'support@geosignalai.com',
    grievanceOfficer: '[Grievance officer name]',
    jurisdiction: '[City], India'
}

export type AiEngine = { id: string; name: string; color: string }

export const engines: AiEngine[] = [
    { id: 'chatgpt', name: 'ChatGPT', color: '#3FBF8F' },
    { id: 'gemini', name: 'Gemini', color: '#6C8EF5' },
    { id: 'claude', name: 'Claude', color: '#D97757' },
    { id: 'grok', name: 'Grok', color: '#7A8587' },
    { id: 'deepseek', name: 'DeepSeek', color: '#4D6BFE' },
    { id: 'perplexity', name: 'Perplexity', color: '#20B8CD' }
]

export type Plan = {
    id: 'free' | 'starter' | 'growth' | 'agency'
    name: string
    monthly: number | null // null = custom
    yearly: number | null
    pitch: string
    brands: string
    queries: string
    scans: string
    manual: string
    engines: string[]
    extras: string[]
    cta: string
    featured?: boolean
}

export const plans: Plan[] = [
    {
        id: 'free',
        name: 'Free',
        monthly: 0,
        yearly: 0,
        pitch: 'See whether AI mentions your brand at all.',
        brands: '1 brand',
        queries: '3 questions',
        scans: 'Scanned every week',
        manual: 'Site audit re-run once a day',
        engines: ['chatgpt', 'gemini', 'claude'],
        extras: ['AI crawler and schema audit'],
        cta: 'Start free'
    },
    {
        id: 'starter',
        name: 'Starter',
        monthly: 2999,
        yearly: 29990,
        pitch: 'For a founder running one Shopify or D2C store.',
        brands: '1 brand',
        queries: '15 questions',
        scans: 'Scanned every day',
        manual: '1 on-demand re-scan a day',
        engines: ['chatgpt', 'gemini', 'claude', 'grok', 'deepseek'],
        extras: ['AI recommendations', 'Weekly email report with PDF', 'AI crawler and schema audit'],
        cta: 'Start with Starter',
        featured: true
    },
    {
        id: 'growth',
        name: 'Growth',
        monthly: 9999,
        yearly: 99990,
        pitch: 'For growing D2C brands with more than one label.',
        brands: '3 brands',
        queries: '30 questions per brand',
        scans: 'Scanned 3 times a day',
        manual: '3 on-demand re-scans a day',
        engines: ['chatgpt', 'gemini', 'claude', 'grok', 'deepseek'],
        extras: ['Competitor share of voice', 'AI recommendations', 'Weekly email report with PDF', 'AI crawler and schema audit'],
        cta: 'Start with Growth'
    },
    {
        id: 'agency',
        name: 'Agency',
        monthly: null,
        yearly: null,
        pitch: 'For agencies tracking many client brands.',
        brands: 'Up to 25 brands',
        queries: '100 questions per brand',
        scans: 'Scanned twice a day',
        manual: '10 on-demand re-scans a day',
        engines: ['chatgpt', 'gemini', 'claude', 'grok', 'deepseek', 'perplexity'],
        extras: ['Everything in Growth', 'Priority support', 'Dedicated onboarding'],
        cta: 'Talk to sales'
    }
]

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN')

// Public list prices of other AI-visibility tools, converted at USD_TO_INR.
// Only facts the vendors publish; null = not published. Re-check before each release.
export const USD_TO_INR = 85
export const COMPARE_CHECKED = 'October 2026'

export type Competitor = {
    name: string
    tier: string
    usd: number
    questions: string
    engines: string
    frequency: string | null
    source: string
}

export const competitorsEntry: Competitor[] = [
    { name: 'Otterly.ai', tier: 'Lite', usd: 29, questions: '15 prompts', engines: '4', frequency: null, source: 'https://otterly.ai/pricing' },
    { name: 'Peec AI', tier: 'Starter', usd: 95, questions: '50 prompts', engines: '3', frequency: 'Daily', source: 'https://peec.ai/pricing' },
    { name: 'Profound', tier: 'Starter', usd: 99, questions: '50 prompts', engines: '1 (ChatGPT)', frequency: null, source: 'https://www.tryprofound.com/pricing' },
    { name: 'AthenaHQ', tier: 'Starter', usd: 295, questions: '3,600 credits', engines: 'Up to 10', frequency: null, source: 'https://www.athenahq.ai/pricing' }
]

export const competitorsMid: Competitor[] = [
    { name: 'Otterly.ai', tier: 'Standard', usd: 189, questions: '100 prompts', engines: '4', frequency: null, source: 'https://otterly.ai/pricing' },
    { name: 'Peec AI', tier: 'Pro', usd: 245, questions: '150 prompts', engines: '3', frequency: 'Daily', source: 'https://peec.ai/pricing' },
    { name: 'Profound', tier: 'Growth', usd: 399, questions: '100 prompts', engines: '3', frequency: null, source: 'https://www.tryprofound.com/pricing' }
]

export const nav = [
    { href: '/features', label: 'Features' },
    { href: '/compare', label: 'Compare' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/blog', label: 'Blog' },
    { href: '/about', label: 'About' }
]

export const legalNav = [
    { href: '/legal/terms', label: 'Terms of service' },
    { href: '/legal/privacy', label: 'Privacy policy' },
    { href: '/legal/refund', label: 'Cancellation and refund policy' },
    { href: '/legal/delivery', label: 'Service delivery policy' }
]
