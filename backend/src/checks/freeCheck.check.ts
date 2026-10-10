/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/freeCheck.check.ts
import assert from 'assert'
import { freeCheckQuestions } from '../service/querySuggestionService'

// Every seeded category (script/seed categories)
const CATEGORIES = [
    'SaaS & Software',
    'E-Commerce & Retail',
    'Fragrances & Perfumes',
    'FinTech & Banking',
    'HealthTech & Healthcare',
    'EdTech & Learning',
    'Skincare & Personal Care',
    'Beauty & Cosmetics',
    'Food & Beverage',
    'Travel & Hospitality',
    'Real Estate & Property',
    'Automotive & Mobility',
    'Consumer Electronics & Gadgets',
    'Home, Furniture & Living',
    'Fashion, Apparel & Accessories',
    'Media, Gaming & Entertainment',
    'Artificial Intelligence & ML',
    'Cybersecurity & Data Privacy',
    'Cloud, DevOps & Infrastructure',
    'Marketing, Advertising & PR',
    'HRTech & Recruitment',
    'LegalTech & Compliance',
    'Logistics, Supply Chain & Delivery',
    'Fitness, Sports & Wellness',
    'Jewelry, Watches & Luxury Goods',
    'Mother, Baby & Kids Care',
    'Pet Care & Supplies',
    'Agriculture & AgriTech',
    'Renewable Energy & CleanTech',
    'Crypto, Web3 & Blockchain',
    'Construction & Architecture',
    'Professional & Business Services',
    'Non-Profit, NGO & Social Impact',
    'Events, Ticketing & Entertainment',
    'Industrial, Manufacturing & B2B',
    'Insurance & InsurTech',
    'Other / General'
]

const run = async () => {
    // Questions: no branded question, at least 4 English per category, no weak "comparison with competitors" lines
    for (const c of CATEGORIES) {
        const qs = freeCheckQuestions(c)
        assert.ok(qs.length >= 7, `${c}: ${qs.length} questions`)
        assert.ok(qs.filter((q) => q.lang === 'EN').length >= 4, `${c}: fewer than 4 EN`)
        assert.ok(!qs.some((q) => /reviews: original/.test(q.text)), `${c}: branded question present`)
        assert.ok(
            !qs.some((q) => /^(Comparison with|Hidden charges|Course quality|Medicine delivery speed|API performance)/.test(q.text)),
            `${c}: weak question`
        )
    }
    console.log('freeCheck checks passed')
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
