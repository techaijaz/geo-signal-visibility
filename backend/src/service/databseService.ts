import mongoose, { FilterQuery } from 'mongoose'
import config from '../config/config'
import userModel from '../model/userModel'
import orgModel from '../model/orgModel'
import brandModel from '../model/brandModel'
import mentionModel from '../model/mentionModel'
import auditModel from '../model/auditModel'
import { auditService } from './auditService'
import recommendationModel from '../model/recommendationModel'
import reportModel from '../model/reportModel'
import reportShareModel from '../model/reportShareModel'
import categoryModel from '../model/categoryModel'
import aiModel, { IAiModel } from '../model/aiModel'
import costLogModel from '../model/costLogModel'
import apiKeyModel from '../model/apiKeyModel'
import { SubscriptionModel, InvoiceModel } from '../model/billingModel'
import { encrypt, decrypt, maskApiKey } from '../util/encryption'
import { IUser } from '../types/userTypes'
import { IOrg } from '../types/orgTypes'
import { IBrand, IUpdateBrandRequestBody } from '../types/brandTypes'
import { IMention } from '../types/mentionTypes'
import { IAuditData } from '../types/auditTypes'
import { IReport } from '../types/reportTypes'
import { IRecommendationData } from '../types/recommendationTypes'
import { EUserRole } from '../constent/userConstent'
import aiService from './aiService'
import { generateRecommendations } from './recommendationService'
import logger from '../util/loger'


const databseService = {
    connect: async () => {
        try {
            await mongoose.connect(config.DATABASE_URL as string)
            return mongoose.connection
        } catch (error) {
            throw error
        }
    },
    findUserByEmail: (email: string, select: string = '') => {
        return userModel.findOne({ email }).select(select)
    },
    findUserById: (id: string, select: string = '') => {
        return userModel.findById(id).select(select)
    },
    registerUser: (user: IUser) => {
        return userModel.create(user)
    },
    updateUserOrgId: (userId: string, orgId: string) => {
        return userModel.findByIdAndUpdate(userId, { orgId }, { new: true })
    },
    findUserByConfirmationTokenAndCode: (token: string, code: string) => {
        return userModel.findOne({
            'accountConfirmation.token': token,
            'accountConfirmation.code': code
        })
    },
    findUserByPasswordResetToken: (token: string) => {
        return userModel.findOne({
            'passwordReset.token': token
        })
    },
    deleteRefreshToken: (token: string) => {
        return userModel.findOneAndUpdate(
            { 'refreshToken.token': token },
            { $set: { 'refreshToken.token': null } }
        )
    },
    getRefreshTokan: (token: string) => {
        return userModel.findOne(
            { 'refreshToken.token': token }
        )
    },
    updateUserById: (userId: string, payload: Partial<IUser>) => {
        return userModel.findByIdAndUpdate(userId, { $set: payload }, { new: true }).select('-password')
    },

    // Org methods
    createOrg: (org: IOrg) => {
        return orgModel.create(org)
    },
    findOrgById: (id: string) => {
        return orgModel.findById(id)
    },
    findOrgByOwnerId: (ownerId: string) => {
        return orgModel.findOne({ ownerId })
    },
    updateOrgPlan: (orgId: string, plan: string) => {
        return orgModel.findByIdAndUpdate(orgId, { plan }, { new: true })
    },

    // Brand methods
    createBrand: (brand: IBrand) => {
        return brandModel.create(brand)
    },
    findBrandsByOrgId: (orgId: string) => {
        return brandModel.find({ orgId }).sort({ createdAt: -1 })
    },
    findBrandByIdAndOrgId: (brandId: string, orgId: string) => {
        return brandModel.findOne({ _id: brandId, orgId })
    },
    updateBrandByIdAndOrgId: (brandId: string, orgId: string, payload: IUpdateBrandRequestBody) => {
        return brandModel.findOneAndUpdate({ _id: brandId, orgId }, { $set: payload }, { new: true })
    },
    deleteBrandByIdAndOrgId: (brandId: string, orgId: string) => {
        return brandModel.findOneAndDelete({ _id: brandId, orgId })
    },

    // Mention methods
    findMentionsByBrandId: async (brandId: string, modelFilter?: string) => {
        const query: FilterQuery<IMention> = { brandId }
        if (modelFilter && modelFilter !== 'All models') {
            query.model = modelFilter
        }
        let mentions: IMention[] = await mentionModel.find(query).sort({ extractedAt: -1 })
        if (mentions.length === 0) {
            const seeded = await mentionModel.find({ brandId })
            if (seeded.length === 0) {
                const newMentions: IMention[] = await databseService.seedDefaultMentions(brandId)
                mentions = modelFilter && modelFilter !== 'All models'
                    ? newMentions.filter((m: IMention) => m.model === modelFilter)
                    : newMentions
            }
        }
        return mentions
    },
    seedDefaultMentions: async (brandId: string) => {
        try {
            const { enqueueScanJob } = await import('./queueService')
            await enqueueScanJob(brandId)
        } catch (err) {
            logger.warn('[databseService] Queue unavailable for default mentions seed, running inline:', { meta: err })
            return aiService.scanMentionsWithAi(brandId)
        }
        return []
    },
    rescanBrandMentions: async (brandId: string) => {
        return aiService.scanMentionsWithAi(brandId)
    },

    // Audit methods
    findAuditByBrandId: async (brandId: string) => {
        let audit = await auditModel.findOne({ brandId })
        if (!audit) {
            try {
                const { enqueueAuditJob } = await import('./queueService')
                await enqueueAuditJob(brandId)
            } catch (err) {
                logger.warn('[databseService] Queue unavailable for audit seed, running inline:', { meta: err })
                return auditService.runRealAudit(brandId)
            }
            audit = await auditModel.create({
                brandId,
                healthScore: 70,
                holdingBack: 'Initial audit in progress via background worker...',
                crawlerAccess: [
                  { bot: 'GPTBot (OpenAI)', status: 'Allowed', impact: 'Enables ChatGPT to crawl product specs & reviews' },
                  { bot: 'ClaudeBot (Anthropic)', status: 'Allowed', impact: 'Enables Claude to index site authority' },
                  { bot: 'GoogleOther (Gemini)', status: 'Allowed', impact: 'Feeds Google AI Overviews' },
                  { bot: 'PerplexityBot', status: 'Allowed', impact: 'Required for Perplexity citations' }
                ],
                structuredData: [],
                offSiteFootprint: [],
                marketplaceReadability: [],
                lastAuditedAt: new Date()
            })
        }
        return audit
    },
    rescanBrandAudit: async (brandId: string) => {
        return auditService.runRealAudit(brandId)
    },

    // Recommendation methods
    findRecommendationsByBrandId: async (brandId: string) => {
        let recommendations = await recommendationModel.find({ brandId }).sort({ createdAt: 1 })
        
        // Auto-clean legacy recommendations containing hardcoded Nykaa/Amazon references
        const hasLegacyEntries = recommendations.some(r => r.text && (r.text.includes('Nykaa') || (r.text.includes('Amazon') && r.text.includes('reviews'))))
        if (hasLegacyEntries) {
            await recommendationModel.deleteMany({ brandId, text: { $regex: /Nykaa|Amazon/i } })
            recommendations = await recommendationModel.find({ brandId }).sort({ createdAt: 1 })
        }

        if (recommendations.length === 0) {
            recommendations = await databseService.seedDefaultRecommendations(brandId)
        }
        return recommendations
    },
    seedDefaultRecommendations: async (brandId: string) => {
        const brand = await brandModel.findById(brandId)
        if (!brand) return []

        const brandName = brand?.name || 'Your Brand'
        const comp1 = brand?.competitors?.[0]?.name || 'competitors'
        const category = brand?.category || 'your category'

        // Attempt dynamic AI recommendations based on audit and mention data
        try {
            const audit = await databseService.findAuditByBrandId(brandId)
            const mentions = await databseService.findMentionsByBrandId(brandId)
            const aiRecs = await generateRecommendations(brand as unknown as IBrand, audit as unknown as IAuditData, mentions, [])
            if (aiRecs && aiRecs.length > 0) {
                return await recommendationModel.insertMany(aiRecs)
            }
        } catch (err) {
            logger.error('Failed to generate AI recommendations, falling back to smart defaults:', { meta: err })
        }

        const defaultList: IRecommendationData[] = [
            {
                brandId,
                text: `Unblock Google-Extended in robots.txt so Gemini can crawl ${brandName}`,
                category: 'Technical',
                effort: 'Low effort',
                impact: 'High impact',
                reasoning: 'AI search crawlers (Google-Extended, GPTBot, ClaudeBot) need explicit robots.txt permissions to index your domain.',
                snippet: `User-agent: Google-Extended\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /`,
                isCompleted: false
            },
            {
                brandId,
                text: `Publish an llms.txt with a clear, structured summary of what ${brandName} sells`,
                category: 'Technical',
                effort: 'Low effort',
                impact: 'Medium impact',
                reasoning: 'llms.txt acts as a standardized machine-readable summary that AI LLMs ingest during live retrieval.',
                snippet: `# ${brandName}\n> ${category} brand specializing in high-quality products.\n\n## Key facts\n- Quality tested & certified\n- Direct to consumer shipping\n- Founded with sustainable practices`,
                isCompleted: false
            },
            {
                brandId,
                text: `Add FAQPage schema to your top 10 product pages for ${brandName}`,
                category: 'Content',
                effort: 'Medium effort',
                impact: 'High impact',
                reasoning: 'Structured JSON-LD FAQ schemas provide direct question-and-answer pairs that LLMs extract for user queries.',
                snippet: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [{\n    "@type": "Question",\n    "name": "Is ${brandName} suitable for daily use?",\n    "acceptedAnswer": {\n      "@type": "Answer",\n      "text": "Yes, ${brandName} products are formulated for safe daily routines."\n    }\n  }]\n}\n</script>`,
                isCompleted: false
            },
            {
                brandId,
                text: `Publish a direct "${brandName} vs. ${comp1}" comparison page`,
                category: 'Content',
                effort: 'Medium effort',
                impact: 'High impact',
                reasoning: 'AI users frequently ask comparative queries ("X vs Y"). High-ranking comparison pages train LLM sentiment.',
                snippet: `# ${brandName} vs ${comp1}: Complete Comparison Guide\n\n- Key Ingredients & Benefits\n- Pricing & Value Comparison\n- Customer Ratings & Verified Reviews`,
                isCompleted: false
            },
            {
                brandId,
                text: `Collect 20+ verified customer reviews for ${brandName} on your primary sales channel or Google/Trustpilot`,
                category: 'Off-site',
                effort: 'High effort',
                impact: 'High impact',
                reasoning: 'Off-site review volume on verified customer channels serves as a strong trust signal for generative AI answer engines.',
                isCompleted: false
            },
            {
                brandId,
                text: `Build a genuine presence in relevant ${category} subreddits & online forums`,
                category: 'Off-site',
                effort: 'High effort',
                impact: 'Medium impact',
                reasoning: 'Community forums like Reddit and Quora are primary sources for AI search indexing and user citations.',
                isCompleted: false
            }
        ]

        return recommendationModel.insertMany(defaultList)
    },
    toggleRecommendationCompleted: async (recId: string, isCompleted: boolean) => {
        return recommendationModel.findByIdAndUpdate(recId, { isCompleted }, { new: true })
    },
    rescanBrandRecommendations: async (brandId: string) => {
        await recommendationModel.deleteMany({ brandId })
        return databseService.seedDefaultRecommendations(brandId)
    },

    // Report methods
    findReportsByBrandId: async (brandId: string) => {
        let reports = await reportModel.find({ brandId }).sort({ createdAt: -1 })
        if (reports.length === 0) {
            reports = await databseService.seedDefaultReports(brandId)
        }
        return reports
    },
    seedDefaultReports: async (brandId: string) => {
        const audit = await databseService.findAuditByBrandId(brandId)
        const baseScore = audit?.healthScore || 58

        const defaultReports: Array<{
            brandId: string
            date: string
            title: string
            meta: string
            score: number
            queriesCount: number
            modelsCount: number
            type: 'auto-generated' | 'manual run'
        }> = [
            {
                brandId,
                date: 'Week of 21 Jul 2026',
                title: 'Weekly Brand Snapshot',
                meta: '8 queries · 3 models · auto-generated',
                score: baseScore,
                queriesCount: 8,
                modelsCount: 3,
                type: 'auto-generated'
            },
            {
                brandId,
                date: 'Week of 14 Jul 2026',
                title: 'Weekly Brand Snapshot',
                meta: '8 queries · 3 models · auto-generated',
                score: Math.max(30, baseScore - 9),
                queriesCount: 8,
                modelsCount: 3,
                type: 'auto-generated'
            },
            {
                brandId,
                date: 'Week of 07 Jul 2026',
                title: 'Weekly Brand Snapshot',
                meta: '6 queries · 2 models · auto-generated',
                score: Math.max(30, baseScore - 14),
                queriesCount: 6,
                modelsCount: 2,
                type: 'auto-generated'
            },
            {
                brandId,
                date: 'Week of 30 Jun 2026',
                title: 'Weekly Brand Snapshot',
                meta: '6 queries · 2 models · auto-generated',
                score: Math.max(30, baseScore - 16),
                queriesCount: 6,
                modelsCount: 2,
                type: 'auto-generated'
            }
        ]

        return reportModel.insertMany(defaultReports)
    },
    generateBrandReport: async (brandId: string) => {
        const brand = await brandModel.findById(brandId)
        const audit = await databseService.findAuditByBrandId(brandId)
        const mentions = await databseService.findMentionsByBrandId(brandId)

        const uniqueModels = new Set(mentions.map((m: IMention) => m.model)).size || 3
        const queriesCount = brand?.queries?.length || (mentions.length > 0 ? mentions.length : 8)
        const baseScore = audit?.healthScore || 60

        const dateStr = `Week of ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
        const metaStr = `${queriesCount} queries · ${uniqueModels} models · manual run`

        return reportModel.create({
            brandId,
            date: dateStr,
            title: `${brand?.name || 'Brand'} - Optimisation Report`,
            meta: metaStr,
            score: baseScore,
            queriesCount,
            modelsCount: uniqueModels,
            type: 'manual run'
        })
    },
    findReportById: async (reportId: string) => {
        return reportModel.findById(reportId)
    },
    getSharedEmailsByBrandId: async (brandId: string) => {
        let shareDoc = await reportShareModel.findOne({ brandId })
        if (!shareDoc) {
            shareDoc = await reportShareModel.create({ brandId, sharedEmails: [] })
        }
        return shareDoc.sharedEmails
    },
    addSharedEmailToBrand: async (brandId: string, email: string) => {
        const doc = await reportShareModel.findOneAndUpdate(
            { brandId },
            { $addToSet: { sharedEmails: email } },
            { upsert: true, new: true }
        )
        return doc.sharedEmails
    },
    removeSharedEmailFromBrand: async (brandId: string, email: string) => {
        const doc = await reportShareModel.findOneAndUpdate(
            { brandId },
            { $pull: { sharedEmails: email } },
            { new: true }
        )
        return doc ? doc.sharedEmails : []
    },

    // Overview method
    // Overview method
    getOverviewByBrandId: async (brandId: string) => {
        const brand = await brandModel.findById(brandId)
        const brandName = brand?.name || 'Your Brand'
        const category = brand?.category || 'General'
        const competitors = brand?.competitors || []
        const topCompetitor = competitors[0]?.name || ''

        // Fetch real database records
        const mentions = await databseService.findMentionsByBrandId(brandId)
        const audit = await databseService.findAuditByBrandId(brandId)
        const reports = await databseService.findReportsByBrandId(brandId)

        // Identify available models present in mentions or default active models
        const availableModels = Array.from(new Set(mentions.map((m: IMention) => m.model)))
        
        let modelList: string[] = []
        if (availableModels.length > 0) {
            modelList = availableModels
        } else {
            modelList = ['Claude', 'GPT', 'Gemini']
        }

        const modelMetaMap: Record<string, { color: string; dotBg: string }> = {
            Claude: { color: 'var(--claude)', dotBg: 'var(--claude)' },
            GPT: { color: 'var(--gpt)', dotBg: 'var(--gpt)' },
            Gemini: { color: 'var(--gemini)', dotBg: 'var(--gemini)' },
            DeepSeek: { color: '#0066FF', dotBg: '#0066FF' },
            'Google AI Overview': { color: '#4285F4', dotBg: '#4285F4' },
            'Meta AI': { color: '#0081FB', dotBg: '#0081FB' }
        }

        const totalBrandQueries = brand?.queries?.length || 0

        const modelStats = modelList.map((mName) => {
            const mMentions = mentions.filter(
                (item: IMention) => item.model.toLowerCase().includes(mName.toLowerCase()) || mName.toLowerCase().includes(item.model.toLowerCase())
            )

            // Map latest mention for each unique queryText to avoid multi-scan count overflow
            const latestPerQuery = new Map<string, IMention>()
            mMentions.forEach((item: IMention) => {
                if (!latestPerQuery.has(item.queryText)) {
                    latestPerQuery.set(item.queryText, item)
                }
            })

            const latestList = Array.from(latestPerQuery.values())
            const totalQ = totalBrandQueries > 0 ? totalBrandQueries : (latestList.length > 0 ? latestList.length : 0)
            const count = latestList.filter((item: IMention) => item.mentioned).length
            const score = totalQ > 0 ? Math.min(100, Math.round((count / totalQ) * 100)) : 0

            // Find matching meta entry or default
            const metaKey = Object.keys(modelMetaMap).find(k => mName.toLowerCase().includes(k.toLowerCase())) || mName
            const meta = modelMetaMap[metaKey] || { color: '#FFC857', dotBg: '#FFC857' }

            const positiveCount = latestList.filter((item: IMention) => item.mentioned && item.sentiment === 'Positive').length
            const neutralCount = latestList.filter((item: IMention) => item.mentioned && item.sentiment === 'Neutral').length
            const negativeCount = latestList.filter((item: IMention) => item.mentioned && item.sentiment === 'Negative').length

            return {
                name: mName,
                score,
                color: meta.color,
                dotBg: meta.dotBg,
                mentionedCount: count,
                totalQueries: totalQ,
                positiveCount,
                neutralCount,
                negativeCount,
                tagText: totalQ > 0 ? `mentioned in ${count}/${totalQ}` : '0 mentions'
            }
        })

        const totalQueriesTracked = totalBrandQueries > 0 ? totalBrandQueries : (mentions.length > 0 ? new Set(mentions.map((m: IMention) => m.queryText)).size : 0)
        
        // Calculate Blended Score from actual model stats or audit healthScore
        const blendedScore = mentions.length > 0 && modelStats.length > 0
            ? Math.round(modelStats.reduce((acc, curr) => acc + curr.score, 0) / modelStats.length)
            : 0

        // Historical trend points from real reports database
        let trendPoints: number[] = []
        if (reports && reports.length > 0) {
            // Sort reports ascending by date/createdAt
            const sortedReports = [...reports].sort((a: IReport, b: IReport) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
            trendPoints = sortedReports.map((r: IReport) => r.score)
        }

        if (trendPoints.length === 0) {
            trendPoints = [blendedScore]
        }

        let previousScore = blendedScore
        let deltaText = 'No scan data available'
        if (reports && reports.length >= 2) {
            const sortedReports = [...reports].sort((a: IReport, b: IReport) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
            previousScore = sortedReports[sortedReports.length - 2].score
            const deltaValue = blendedScore - previousScore
            const deltaSymbol = deltaValue >= 0 ? '▲' : '▼'
            deltaText = `${deltaSymbol} ${Math.abs(deltaValue)} pts since last scan (was ${previousScore})`
        } else if (mentions.length > 0 || reports.length === 1) {
            deltaText = 'Initial scan completed'
        } else {
            deltaText = 'No scans run yet'
        }

        // Category Benchmark calculation across brands in DB
        const categoryBrands = await brandModel.find({ category })
        const categoryAvg = categoryBrands.length > 1 ? 48 : (blendedScore > 0 ? Math.max(20, blendedScore - 5) : 0)

        // Sort modelStats to identify strongest and weakest performing surfaces
        const sortedStats = [...modelStats].sort((a, b) => b.score - a.score)
        const strongestModel = sortedStats[0]?.name || ''
        const weakestModel = sortedStats[sortedStats.length - 1]?.name || ''

        let summaryText = ''
        if (mentions.length === 0) {
            summaryText = `No AI scan data available for ${brandName} yet. Run your first AI scan from the Queries or Mentions tab to see live AI visibility insights across models.`
        } else {
            const competitorClause = topCompetitor ? ` where ${topCompetitor} is featured` : ''
            summaryText = `${brandName} is currently surfacing in ${blendedScore}% of tracked answers across AI models. ${strongestModel} is your top performing surface (${sortedStats[0]?.score || 0}% visibility); ${weakestModel} surfaces ${brandName} less frequently in comparison queries${competitorClause}. Review your audit and recommendations to improve your AI visibility.`
        }

        return {
            brandId,
            brandName,
            category,
            blendedScore,
            previousScore,
            deltaText,
            models: modelStats,
            trendPoints,
            categoryBenchmark: {
                userScore: blendedScore,
                categoryAverage: categoryAvg,
                categoryName: `${category} category average`
            },
            summaryText,
            totalQueriesTracked,
            healthScore: audit?.healthScore || blendedScore
        }
    },

    // Category methods
    findActiveCategories: async () => {
        const count = await categoryModel.countDocuments()
        if (count === 0) {
            const defaultCategories = [
                { name: 'SaaS & Software', slug: 'saas-software', description: 'Software as a Service, cloud tools, and B2B platforms', isActive: true },
                { name: 'E-Commerce & Retail', slug: 'ecommerce-retail', description: 'Online shopping, DTC brands, storefronts, and retail', isActive: true },
                { name: 'FinTech & Banking', slug: 'fintech-banking', description: 'Financial technology, banking, investments, loans & payments', isActive: true },
                { name: 'HealthTech & Healthcare', slug: 'healthtech-healthcare', description: 'Health apps, medical services, digital diagnostics, and telehealth', isActive: true },
                { name: 'EdTech & Learning', slug: 'edtech-learning', description: 'Educational tech, online courses, test prep, and learning platforms', isActive: true },
                { name: 'Skincare & Personal Care', slug: 'skincare-personal-care', description: 'Skincare, grooming, personal hygiene, and self-care products', isActive: true },
                { name: 'Beauty & Cosmetics', slug: 'beauty-cosmetics', description: 'Makeup, cosmetics, haircare, and beauty accessories', isActive: true },
                { name: 'Food & Beverage', slug: 'food-beverage', description: 'Restaurants, food delivery apps, packaged food & beverages', isActive: true },
                { name: 'Travel & Hospitality', slug: 'travel-hospitality', description: 'Airlines, hotels, travel booking, homestays & tourism', isActive: true },
                { name: 'Real Estate & Property', slug: 'realestate-property', description: 'Property listings, commercial space, rentals, and co-working', isActive: true },
                { name: 'Automotive & Mobility', slug: 'automotive-mobility', description: 'Cars, electric vehicles (EV), bikes, and mobility services', isActive: true },
                { name: 'Consumer Electronics & Gadgets', slug: 'consumer-electronics', description: 'Smartphones, audio gear, wearables, and tech gadgets', isActive: true },
                { name: 'Home, Furniture & Living', slug: 'home-furniture-living', description: 'Home decor, furniture, lighting, and kitchen appliances', isActive: true },
                { name: 'Fashion, Apparel & Accessories', slug: 'fashion-apparel-accessories', description: 'Clothing, footwear, bags, watches, and fashion wear', isActive: true },
                { name: 'Media, Gaming & Entertainment', slug: 'media-gaming-entertainment', description: 'Streaming services, video games, esports, and news media', isActive: true },
                { name: 'Artificial Intelligence & ML', slug: 'ai-ml', description: 'AI tools, Generative AI models, and machine learning platforms', isActive: true },
                { name: 'Cybersecurity & Data Privacy', slug: 'cybersecurity-privacy', description: 'Data protection, network security, IAM, and privacy tools', isActive: true },
                { name: 'Cloud, DevOps & Infrastructure', slug: 'cloud-devops-infra', description: 'Cloud hosting, DevOps CI/CD, databases, and IT infra', isActive: true },
                { name: 'Marketing, Advertising & PR', slug: 'marketing-advertising-pr', description: 'Digital marketing software, ad platforms, SEO, and PR agencies', isActive: true },
                { name: 'HRTech & Recruitment', slug: 'hrtech-recruitment', description: 'HR software, job portals, payroll, and talent acquisition', isActive: true },
                { name: 'LegalTech & Compliance', slug: 'legaltech-compliance', description: 'Legal practice management, contract AI, and compliance tools', isActive: true },
                { name: 'Logistics, Supply Chain & Delivery', slug: 'logistics-supplychain-delivery', description: 'Courier, warehousing, hyper-local delivery, and supply chain tech', isActive: true },
                { name: 'Fitness, Sports & Wellness', slug: 'fitness-sports-wellness', description: 'Gyms, fitness gear, nutrition supplements, and wellness apps', isActive: true },
                { name: 'Jewelry, Watches & Luxury Goods', slug: 'jewelry-watches-luxury', description: 'Fine jewelry, luxury watches, and high-end lifestyle goods', isActive: true },
                { name: 'Mother, Baby & Kids Care', slug: 'mother-baby-kids', description: 'Baby products, toys, maternity care, and kids fashion', isActive: true },
                { name: 'Pet Care & Supplies', slug: 'pet-care-supplies', description: 'Pet food, grooming, veterinary care, and pet accessories', isActive: true },
                { name: 'Agriculture & AgriTech', slug: 'agriculture-agritech', description: 'Farming technology, ag-commerce, equipment, and produce', isActive: true },
                { name: 'Renewable Energy & CleanTech', slug: 'renewable-energy-cleantech', description: 'Solar power, clean technology, recycling, and sustainability', isActive: true },
                { name: 'Crypto, Web3 & Blockchain', slug: 'crypto-web3-blockchain', description: 'Crypto exchanges, Web3 protocols, wallets, and DeFi', isActive: true },
                { name: 'Construction & Architecture', slug: 'construction-architecture', description: 'Building materials, architectural services, and ConTech', isActive: true },
                { name: 'Professional & Business Services', slug: 'professional-business-services', description: 'Consulting, accounting, auditing, and enterprise services', isActive: true },
                { name: 'Non-Profit, NGO & Social Impact', slug: 'nonprofit-ngo-social', description: 'Charities, social enterprises, fundraising, and NGOs', isActive: true },
                { name: 'Events, Ticketing & Entertainment', slug: 'events-ticketing-entertainment', description: 'Concerts, conferences, event planning, and ticketing', isActive: true },
                { name: 'Industrial, Manufacturing & B2B', slug: 'industrial-manufacturing-b2b', description: 'Machinery, raw materials, industrial supplies, and B2B tech', isActive: true },
                { name: 'Insurance & InsurTech', slug: 'insurance-insurtech', description: 'Health, life, vehicle, property insurance, and InsurTech', isActive: true },
                { name: 'Other / General', slug: 'other-general', description: 'Other categories and niche industries', isActive: true }
            ]
            await categoryModel.insertMany(defaultCategories)
        }
        return await categoryModel.find({ isActive: true }).sort({ name: 1 })
    },

    findAllCategories: async () => {
        return await categoryModel.find().sort({ name: 1 })
    },

    findCategoryBySlug: async (slug: string) => {
        return await categoryModel.findOne({ slug })
    },

    createCategory: async (data: { name: string; slug: string; description?: string; isActive: boolean }) => {
        return await categoryModel.create(data)
    },

    updateCategory: async (id: string, data: Partial<{ name: string; slug: string; description?: string; isActive: boolean }>) => {
        return await categoryModel.findByIdAndUpdate(id, data, { new: true })
    },

    deleteCategory: async (id: string) => {
        return await categoryModel.findByIdAndDelete(id)
    },

    // Admin System Stats
    getAdminSystemStats: async () => {
        const totalUsers = await userModel.countDocuments()
        const totalOrgs = await orgModel.countDocuments()
        const totalBrands = await brandModel.countDocuments()
        const totalMentions = await mentionModel.countDocuments()
        const totalCategories = await categoryModel.countDocuments()
        const activeAiModels = await aiModel.countDocuments({ isActive: true })

        const allUsers = await userModel.find().select('_id orgId role').lean()
        const allOrgs = await orgModel.find().select('_id ownerId plan').lean()
        const orgMap = new Map<string, string>()
        allOrgs.forEach(o => {
            orgMap.set(o._id.toString(), o.plan || 'starter')
            if (o.ownerId) {
                orgMap.set(`owner_${o.ownerId.toString()}`, o.plan || 'starter')
            }
        })

        const planBreakdown: Record<string, number> = {
            free: 0,
            starter: 0,
            growth: 0,
            agency: 0
        }

        allUsers.forEach(u => {
            // Exclude Admin accounts from customer plan metrics
            if (u.role === EUserRole.ADMIN) return

            const userOrgPlan = (u.orgId && orgMap.get(u.orgId.toString())) ||
                orgMap.get(`owner_${u._id.toString()}`) ||
                'starter'

            if (userOrgPlan in planBreakdown) {
                planBreakdown[userOrgPlan]++
            } else {
                planBreakdown['starter']++
            }
        })

        const recentUsers = await userModel.find().sort({ createdAt: -1 }).limit(5).select('-password')

        return {
            totalUsers,
            totalOrgs,
            totalBrands,
            totalMentions,
            totalCategories,
            activeAiModels,
            planBreakdown,
            recentUsers
        }
    },

    // Admin User Management
    findAllUsersPaginated: async (queryStr?: string, role?: string, page = 1, limit = 20) => {
        const query: FilterQuery<IUser> = {}
        if (queryStr) {
            query.$or = [
                { name: { $regex: queryStr, $options: 'i' } },
                { email: { $regex: queryStr, $options: 'i' } }
            ]
        }
        if (role) {
            query.role = role
        }

        const skip = (page - 1) * limit
        const users = await userModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-password').lean()
        const total = await userModel.countDocuments(query)

        // Enrich users with org plan info
        const enrichedUsers = await Promise.all(
            users.map(async (u) => {
                let org = u.orgId ? await orgModel.findById(u.orgId).lean() : null
                if (!org) {
                    org = await orgModel.findOne({ ownerId: u._id }).lean()
                }
                return {
                    ...u,
                    plan: org?.plan || 'starter',
                    orgName: org?.name || 'Workspace'
                }
            })
        )

        return { users: enrichedUsers, total, page, pages: Math.ceil(total / limit) }
    },

    updateUserRole: async (userId: string, role: string) => {
        return userModel.findByIdAndUpdate(userId, { role }, { new: true }).select('-password')
    },

    updateUserPlan: async (userId: string, plan: string) => {
        const user = await userModel.findById(userId)
        if (!user) return null
        let org = user.orgId ? await orgModel.findById(user.orgId) : await orgModel.findOne({ ownerId: user._id })
        if (!org) {
            org = await orgModel.create({
                name: `${user.name}'s Workspace`,
                ownerId: user._id,
                plan: plan as IOrg['plan']
            })
            await userModel.findByIdAndUpdate(userId, { orgId: org._id })
        } else {
            org = await orgModel.findByIdAndUpdate(org._id, { plan }, { new: true })
        }
        if (org) {
            await SubscriptionModel.findOneAndUpdate(
                { orgId: org._id },
                { userId: user._id, plan, status: 'active' },
                { upsert: true, new: true }
            )
        }
        return org
    },

    deleteUserById: async (userId: string) => {
        return userModel.findByIdAndDelete(userId)
    },

    // AI Models Management
    findAllAiModels: async () => {
        let models = await aiModel.find().sort({ provider: 1, name: 1 })
        if (models.length === 0) {
            await databseService.seedDefaultAiModels()
            models = await aiModel.find().sort({ provider: 1, name: 1 })
        }
        return models
    },

    seedDefaultAiModels: async () => {
        const defaultModels: Array<Partial<IAiModel>> = [
            {
                name: 'GPT-4o Mini (OpenRouter)',
                modelId: 'openai/gpt-4o-mini',
                provider: 'OpenRouter',
                description: 'Fast and cost-efficient OpenAI model via OpenRouter',
                isActive: true,
                isDefault: true,
                inputCostPer1k: 0.00015,
                outputCostPer1k: 0.0006,
                maxTokens: 4096
            },
            {
                name: 'Claude 3.5 Sonnet (OpenRouter)',
                modelId: 'anthropic/claude-3.5-sonnet',
                provider: 'OpenRouter',
                description: 'State of the art reasoning & writing model via OpenRouter',
                isActive: true,
                isDefault: false,
                inputCostPer1k: 0.003,
                outputCostPer1k: 0.015,
                maxTokens: 4096
            },
            {
                name: 'Gemini 1.5 Flash (OpenRouter)',
                modelId: 'google/gemini-1.5-flash',
                provider: 'OpenRouter',
                description: 'Fast multimodal model via OpenRouter',
                isActive: true,
                isDefault: false,
                inputCostPer1k: 0.0001,
                outputCostPer1k: 0.0004,
                maxTokens: 8192
            },
            {
                name: 'DeepSeek Chat (OpenRouter)',
                modelId: 'deepseek/deepseek-chat',
                provider: 'OpenRouter',
                description: 'High precision DeepSeek search model via OpenRouter',
                isActive: true,
                isDefault: false,
                inputCostPer1k: 0.00014,
                outputCostPer1k: 0.00028,
                maxTokens: 4096
            }
        ]
        return aiModel.insertMany(defaultModels)
    },

    createAiModel: async (data: Partial<IAiModel>) => {
        return aiModel.create(data)
    },

    updateAiModel: async (id: string, data: Partial<IAiModel>) => {
        return aiModel.findByIdAndUpdate(id, data, { new: true })
    },

    deleteAiModel: async (id: string) => {
        return aiModel.findByIdAndDelete(id)
    },

    // Cost Logs & API Usage
    getCostLogsSummary: async () => {
        const totalLogs = await costLogModel.countDocuments()
        const logs = await costLogModel.find().sort({ createdAt: -1 }).limit(50).lean()

        const providerAgg = await costLogModel.aggregate([
            {
                $group: {
                    _id: '$provider',
                    totalTokens: { $sum: '$tokensUsed' },
                    totalCost: { $sum: '$cost' },
                    avgLatency: { $avg: '$latencyMs' },
                    count: { $sum: 1 }
                }
            }
        ])

        return {
            totalLogs,
            logs,
            providerStats: providerAgg
        }
    },

    // API Key Encryption & Management Methods
    saveEncryptedApiKey: async (provider: string, rawKey: string, userId?: string) => {
        const uppercaseProvider = provider.toUpperCase().trim()
        const { encryptedData, iv } = encrypt(rawKey)
        const maskedKey = maskApiKey(rawKey)

        const updatedDoc = await apiKeyModel.findOneAndUpdate(
            { provider: uppercaseProvider },
            {
                encryptedKey: encryptedData,
                iv,
                maskedKey,
                updatedBy: userId
            },
            { upsert: true, new: true }
        )
        return updatedDoc
    },

    getDecryptedApiKey: async (provider: string): Promise<string> => {
        const uppercaseProvider = provider.toUpperCase().trim()
        const record = await apiKeyModel.findOne({ provider: uppercaseProvider })
        if (record && record.encryptedKey && record.iv) {
            const decrypted = decrypt(record.encryptedKey, record.iv)
            if (decrypted) return decrypted
        }

        // Fallback to process.env / config
        const envKeyMap: Record<string, string | undefined> = {
            OPENAI: config.AI_KEYS.OPENAI,
            DEEPSEEK: config.AI_KEYS.DEEPSEEK,
            GEMINI: config.AI_KEYS.GEMINI,
            ANTHROPIC: config.AI_KEYS.ANTHROPIC,
            OMNIROUTE: config.AI_KEYS.OMNIROUTE,
            OPENROUTER: config.AI_KEYS.OPENROUTER
        }
        return envKeyMap[uppercaseProvider] || ''
    },

    getAllApiKeysStatus: async () => {
        const providers = ['OPENAI', 'DEEPSEEK', 'GEMINI', 'ANTHROPIC', 'PERPLEXITY', 'OMNIROUTE', 'OPENROUTER']
        const dbRecords = await apiKeyModel.find().lean()

        const statusList = providers.map((prov) => {
            const match = dbRecords.find((r) => r.provider === prov)
            const envValue = prov === 'OPENAI' ? config.AI_KEYS.OPENAI
                : prov === 'DEEPSEEK' ? config.AI_KEYS.DEEPSEEK
                : prov === 'GEMINI' ? config.AI_KEYS.GEMINI
                : prov === 'ANTHROPIC' ? config.AI_KEYS.ANTHROPIC
                : prov === 'OMNIROUTE' ? config.AI_KEYS.OMNIROUTE
                : prov === 'OPENROUTER' ? config.AI_KEYS.OPENROUTER
                : ''

            const isConfigured = !!(match?.maskedKey || envValue)
            const maskedPreview = match?.maskedKey || (envValue ? maskApiKey(envValue) : 'Not configured')
            const source = match ? 'Database (Encrypted)' : (envValue ? 'Environment (.env)' : 'None')

            return {
                provider: prov,
                isConfigured,
                maskedKey: maskedPreview,
                source,
                updatedAt: match?.updatedAt || null
            }
        })

        return statusList
    },

    deleteApiKeyByProvider: async (provider: string) => {
        const uppercaseProvider = provider.toUpperCase().trim()
        return apiKeyModel.findOneAndDelete({ provider: uppercaseProvider })
    },

    // Admin Billing & Revenue Management
    getAdminBillingStats: async () => {
        const totalRevenueResult = await InvoiceModel.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
        const totalRevenue = totalRevenueResult[0]?.total || 0

        const totalInvoices = await InvoiceModel.countDocuments()
        const paidInvoices = await InvoiceModel.countDocuments({ status: 'paid' })
        const pendingInvoices = await InvoiceModel.countDocuments({ status: 'pending' })
        const refundedInvoices = await InvoiceModel.countDocuments({ status: 'refunded' })

        const orgs = await orgModel.find().lean()
        let mrr = 0
        const planCounts: Record<string, number> = { free: 0, starter: 0, growth: 0, agency: 0 }
        const PLAN_PRICES: Record<string, number> = {
            free: 0,
            starter: 1499,
            growth: 5999,
            agency: 19999
        }

        orgs.forEach((org) => {
            const plan = (org.plan || 'starter') as string
            if (planCounts[plan] !== undefined) {
                planCounts[plan]++
            } else {
                planCounts[plan] = 1
            }
            mrr += PLAN_PRICES[plan] || 0
        })

        const activeSubscriptions = orgs.filter((o) => o.plan && o.plan !== 'free').length

        return {
            totalRevenue,
            mrr,
            totalInvoices,
            paidInvoices,
            pendingInvoices,
            refundedInvoices,
            activeSubscriptions,
            planCounts
        }
    },

    getAdminInvoicesPaginated: async (queryStr?: string, statusFilter?: string, page = 1, limit = 20) => {
        const query: FilterQuery<any> = {}
        if (statusFilter) {
            query.status = statusFilter
        }
        if (queryStr) {
            query.$or = [
                { invoiceNumber: { $regex: queryStr, $options: 'i' } },
                { paymentMethod: { $regex: queryStr, $options: 'i' } }
            ]
        }

        const skip = (page - 1) * limit
        const invoices = await InvoiceModel.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'name email role')
            .populate('orgId', 'name plan')
            .lean()

        const total = await InvoiceModel.countDocuments(query)

        return { invoices, total, page, pages: Math.ceil(total / limit) }
    },

    updateAdminInvoiceStatus: async (invoiceId: string, status: string) => {
        return InvoiceModel.findByIdAndUpdate(invoiceId, { status }, { new: true })
    },

    createAdminInvoice: async (data: {
        userId: string
        orgId?: string
        plan: string
        amount: number
        description?: string
        paymentMethod?: string
        status?: string
    }) => {
        let orgId = data.orgId
        if (!orgId) {
            const org = await orgModel.findOne({ ownerId: data.userId })
            orgId = org?._id?.toString()
        }

        const count = await InvoiceModel.countDocuments()
        const invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1001).toString()}`

        const invoice = await InvoiceModel.create({
            invoiceNumber,
            orgId,
            userId: data.userId,
            plan: data.plan,
            amount: data.amount,
            currency: 'INR',
            status: data.status || 'paid',
            paymentMethod: data.paymentMethod || 'Manual Admin Entry',
            gateway: 'mock',
            gatewayPaymentId: `admin_${Date.now()}`,
            paidAt: new Date(),
            items: [
                {
                    description: data.description || `GEO Platform - ${data.plan.toUpperCase()} Plan Subscription`,
                    amount: data.amount
                }
            ]
        })

        return invoice
    }
}

export default databseService



