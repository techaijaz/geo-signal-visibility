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
import { computeCompetitorStats, loadScanPair } from '../service/competitorService'

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

            httpResponse(req, res, 200, responceseMessage.SUCCESS, { _id: id })
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
