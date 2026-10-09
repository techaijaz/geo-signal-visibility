import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { validateJoiSchema, validationCreateBrandBody, validationUpdateBrandBody } from '../service/validationService'
import { EBrandRole, ICreateBrandRequestBody, IUpdateBrandRequestBody } from '../types/brandTypes'
import { EUserRole } from '../constent/userConstent'
import { getPlanLimits, type PlanName } from '../config/planLimits'
import { computeCompetitorStats, computeLostTo, loadScanPair } from '../service/competitorService'
import { saveBrandsNamed } from '../service/brandExtractionService'
import { withAiCallContext } from '../service/costLogService'
import recommendationModel from '../model/recommendationModel'
import costLogModel from '../model/costLogModel'
import { deleteBrandFixEvents } from '../service/fixEventService'
import citationRunModel from '../model/citationRunModel'
import { CITATION_QUESTIONS, citationView } from '../service/citationService'
import type { ICitationRun } from '../types/citationTypes'
import { detectVertical, suggestQueries as suggestQueriesWithAi, templateQueries } from '../service/querySuggestionService'

// AI query suggestions per brand per rolling 24 hours, counted from cost logs so restarts don't reset it
const AI_SUGGESTIONS_PER_DAY = 10

const extractDomain = (url: string): string => {
    if (!url) return ''
    let clean = url.trim().toLowerCase()
    clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '')
    clean = clean.replace(/\/$/, '')
    return clean.split('/')[0].split('?')[0]
}

// Callers pass the returned org document where an org id is expected; Mongoose casts it to its _id.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ensureUserOrg = async (userId: string, userName: string): Promise<any> => {
    let org = await databseService.findOrgByOwnerId(userId)
    if (!org) {
        org = await databseService.createOrg({
            name: `${userName}'s Workspace`,
            ownerId: userId,
            whiteLabelEnabled: false
        })
        await databseService.updateUserOrgId(userId, org._id.toString())
    }
    return org
}

export default {
    getWorkspaceBrands: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const orgId = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)

            const brands = await databseService.findBrandsByOrgId(orgId)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                orgId,
                brands
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    createBrand: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { error, value } = validateJoiSchema<ICreateBrandRequestBody>(validationCreateBrandBody, req.body)
            if (error) {
                return httpError(next, new Error(error), req, 422)
            }

            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const orgId = org._id.toString()

            const effectivePlan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'free') as PlanName)
            const planLimits = getPlanLimits(effectivePlan)

            // Check multi-brand plan limits
            const existingBrands = await databseService.findBrandsByOrgId(orgId)
            if (existingBrands.length >= planLimits.maxBrands) {
                return httpError(
                    next,
                    new Error(
                        `Your ${org.plan || 'free'} plan allows up to ${planLimits.maxBrands} brand${planLimits.maxBrands === 1 ? '' : 's'}. Please upgrade your plan to add more brands.`
                    ),
                    req,
                    403
                )
            }

            // Check plan limits for query count
            const queriesCount = value.queries?.filter((q) => q.enabled !== false).length || 0

            if (queriesCount > planLimits.maxQueries) {
                return httpError(
                    next,
                    new Error(
                        `Your ${org.plan} plan allows maximum ${planLimits.maxQueries} queries. You tried to add ${queriesCount}. Please upgrade your plan or reduce queries.`
                    ),
                    req,
                    403
                )
            }

            // Check plan limits for competitors
            const maxCompetitors = planLimits.maxCompetitors ?? 5
            if (value.competitors && value.competitors.length > maxCompetitors) {
                return httpError(
                    next,
                    new Error(
                        `Your ${org.plan || 'free'} plan allows maximum ${maxCompetitors} competitors. You tried to add ${value.competitors.length}. Please upgrade your plan or reduce competitors.`
                    ),
                    req,
                    403
                )
            }

            // Validate competitors do not contain own brand name or website
            const brandNameLower = value.name.trim().toLowerCase()
            const brandDomain = extractDomain(value.website)

            if (value.competitors) {
                for (const comp of value.competitors) {
                    const compNameLower = comp.name.trim().toLowerCase()
                    const compDomain = extractDomain(comp.name)

                    if (compNameLower === brandNameLower) {
                        return httpError(next, new Error(`You cannot add your own brand ("${value.name}") as a competitor.`), req, 422)
                    }

                    if ((brandDomain && compDomain && compDomain === brandDomain) || (brandDomain && compNameLower === brandDomain)) {
                        return httpError(next, new Error(`You cannot add your brand's website ("${value.website}") as a competitor.`), req, 422)
                    }
                }
            }

            const brandPayload = {
                orgId,
                name: value.name,
                website: value.website,
                category: value.category,
                businessType: value.businessType,
                region: value.region || 'India',
                role: value.role || EBrandRole.OWNER,
                competitors: value.competitors || [],
                queries: value.queries || [],
                languages: value.languages || ['en', 'hi-en']
            }

            const newBrand = await databseService.createBrand(brandPayload)
            httpResponse(req, res, 201, responceseMessage.SUCCESS, newBrand)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getBrandById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id } = req.params
            const orgId = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)

            const brand = await databseService.findBrandByIdAndOrgId(id, orgId)
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, brand)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    updateBrand: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id } = req.params
            const { error, value } = validateJoiSchema<IUpdateBrandRequestBody>(validationUpdateBrandBody, req.body)
            if (error) {
                return httpError(next, new Error(error), req, 422)
            }

            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const orgId = org._id.toString()

            const existingBrand = await databseService.findBrandByIdAndOrgId(id, orgId)
            if (!existingBrand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const effectivePlan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'free') as PlanName)
            const planLimits = getPlanLimits(effectivePlan)

            // If queries are updated, check plan limits
            if (value.queries) {
                const queriesCount = value.queries.filter((q) => q.enabled !== false).length

                if (queriesCount > planLimits.maxQueries) {
                    return httpError(
                        next,
                        new Error(
                            `Your ${org.plan} plan allows maximum ${planLimits.maxQueries} queries. You tried to save ${queriesCount}. Please upgrade your plan or reduce queries.`
                        ),
                        req,
                        403
                    )
                }
            }

            // If competitors are updated, check plan limits & self-brand validation
            if (value.competitors) {
                const maxCompetitors = planLimits.maxCompetitors ?? 5
                if (value.competitors.length > maxCompetitors) {
                    return httpError(
                        next,
                        new Error(
                            `Your ${org.plan || 'free'} plan allows maximum ${maxCompetitors} competitors. You tried to save ${value.competitors.length}. Please upgrade your plan or reduce competitors.`
                        ),
                        req,
                        403
                    )
                }

                const brandNameLower = (value.name || existingBrand.name).trim().toLowerCase()
                const brandDomain = extractDomain(value.website || existingBrand.website)

                for (const comp of value.competitors) {
                    const compNameLower = comp.name.trim().toLowerCase()
                    const compDomain = extractDomain(comp.name)

                    if (compNameLower === brandNameLower) {
                        return httpError(
                            next,
                            new Error(`You cannot add your own brand ("${value.name || existingBrand.name}") as a competitor.`),
                            req,
                            422
                        )
                    }

                    if ((brandDomain && compDomain && compDomain === brandDomain) || (brandDomain && compNameLower === brandDomain)) {
                        return httpError(
                            next,
                            new Error(`You cannot add your brand's website ("${value.website || existingBrand.website}") as a competitor.`),
                            req,
                            422
                        )
                    }
                }
            }

            const updatedBrand = await databseService.updateBrandByIdAndOrgId(id, orgId, value)
            if (!updatedBrand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, updatedBrand)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    deleteBrand: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id } = req.params
            const orgId = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)

            const deletedBrand = await databseService.deleteBrandByIdAndOrgId(id, orgId)
            if (!deletedBrand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }
            await deleteBrandFixEvents(id)
            await citationRunModel.deleteMany({ brandId: id })

            httpResponse(req, res, 200, responceseMessage.SUCCESS, { _id: id })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // Where AI reads (#9): the latest weekly Gemini + Google Search check
    getCitations: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id } = req.params
            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const brand = await databseService.findBrandByIdAndOrgId(id, org)
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }
            const plan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'free') as PlanName)
            if (CITATION_QUESTIONS[plan] === 0) {
                return httpResponse(req, res, 200, responceseMessage.SUCCESS, { locked: true })
            }
            const runs = await citationRunModel.find({ brandId: brand._id }).sort({ week: -1 }).limit(8).lean()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, citationView(runs as unknown as ICitationRun[]))
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getLostTo: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id } = req.params
            const orgId = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const brand = await databseService.findBrandByIdAndOrgId(id, orgId)
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }
            let { current } = await loadScanPair(id, brand.lastScanId)
            // Scans from before this feature: extract once and keep the result
            if (current.some((m) => m.rawText) && !current.some((m) => Array.isArray(m.brandsNamed))) {
                await withAiCallContext({ brandId: id, purpose: 'brands' }, () => saveBrandsNamed(current as never[], brand.name))
                current = (await loadScanPair(id, brand.lastScanId)).current
            }
            const recs = await recommendationModel
                .find({ brandId: id, isCompleted: { $ne: true }, impact: 'High impact' })
                .select('text')
                .limit(3)
                .lean()
            const competitors = brand.competitors || []
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                ...computeLostTo(
                    current,
                    brand.name,
                    competitors.map((c) => c.name),
                    recs
                ),
                trackedCompetitors: competitors.map((c) => ({ name: c.name, website: c.website || '' }))
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    // Curated Indian buyer questions for a category; no AI, so onboarding can call it before a brand exists
    getQueryTemplates: (req: Request, res: Response, next: NextFunction) => {
        try {
            const category = typeof req.query.category === 'string' ? req.query.category.slice(0, 100) : ''
            const brand = typeof req.query.brand === 'string' ? req.query.brand.slice(0, 100) : ''
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                vertical: detectVertical(category),
                queries: templateQueries(category, brand)
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    // AI ideas for more buyer questions. Not saved: the user adds the ones they want and saves as usual
    suggestQueries: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id } = req.params
            const orgId = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const brand = await databseService.findBrandByIdAndOrgId(id, orgId)
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
            const usedToday = await costLogModel.countDocuments({ brandId: brand._id, purpose: 'queries', createdAt: { $gt: since } })
            if (usedToday >= AI_SUGGESTIONS_PER_DAY) {
                return httpError(
                    next,
                    new Error(`You can ask for AI suggestions ${AI_SUGGESTIONS_PER_DAY} times a day. Try again tomorrow.`),
                    req,
                    429
                )
            }
            // Unsaved edits on the page count as existing too
            const body = (req.body || {}) as { existing?: unknown }
            const unsaved = Array.isArray(body.existing) ? body.existing.filter((t): t is string => typeof t === 'string').slice(0, 200) : []
            const existing = [...(brand.queries || []).map((q) => q.text), ...unsaved]
            const queries = await withAiCallContext({ brandId: id, purpose: 'queries' }, () =>
                suggestQueriesWithAi({ name: brand.name, website: brand.website, category: brand.category, region: brand.region }, existing)
            )
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                queries,
                ...(queries.length ? {} : { message: 'AI suggestions are not available right now. Try again in a while.' })
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    getCompetitorComparison: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id } = req.params
            const orgId = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)

            const brand = await databseService.findBrandByIdAndOrgId(id, orgId)
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            // Brand vs competitors from the real AI answers of the latest scan (same numbers as the PDF report)
            const { current, previous } = await loadScanPair(id, brand.lastScanId)
            const competitorNames = (brand.competitors || []).map((c) => c.name)
            const stats = computeCompetitorStats(brand.name, competitorNames, current, previous)
            const countable = stats.answerTextAvailable
            const palette = ['#D97757', '#6C8EF5', '#3FBF8F', '#A855F7', '#20B8CD', '#7A8587']

            const shareOfVoice = stats.rows
                .filter((r) => r.isYou || countable)
                .map((r, i) => ({
                    name: r.name,
                    label: r.isYou ? `${r.name} (you)` : r.name,
                    percentage: countable ? r.share : r.answersNamed > 0 ? 100 : 0,
                    color: r.isYou ? '#FFC857' : palette[(i - 1) % palette.length],
                    isUserBrand: r.isYou
                }))
                .sort((x, y) => y.percentage - x.percentage)

            const headToHead = stats.rows.map((r) => ({
                name: r.isYou ? `${r.name} (you)` : r.name,
                mentionRate: stats.totalAnswers === 0 || (!r.isYou && !countable) ? '—' : `${r.mentionRate}%`,
                avgPosition: r.avgPosition === null ? '—' : `#${r.avgPosition}`,
                trend: r.trend ?? '—',
                isUserBrand: r.isYou
            }))

            let summary: string
            if (stats.totalAnswers === 0) {
                summary = 'No scan data yet. Run an AI scan to compare your share of voice against competitors.'
            } else if (competitorNames.length === 0) {
                summary = `Add competitors in Settings to see how often AI names them compared with ${brand.name}.`
            } else if (!countable) {
                summary = `Competitor counts appear after your next scan. ${brand.name} was named in ${stats.rows[0].mentionRate}% of AI answers in the last scan.`
            } else {
                const leader = [...stats.rows].sort((x, y) => y.answersNamed - x.answersNamed)[0]
                const you = stats.rows[0]
                summary = leader.isYou
                    ? `${brand.name} is named most often: in ${you.mentionRate}% of ${stats.totalAnswers} AI answers, ahead of every tracked competitor.`
                    : `${leader.name} is named most often (${leader.mentionRate}% of AI answers). ${brand.name} is named in ${you.mentionRate}%.`
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandId: brand._id,
                brandName: brand.name,
                shareOfVoice,
                headToHead,
                summary
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
