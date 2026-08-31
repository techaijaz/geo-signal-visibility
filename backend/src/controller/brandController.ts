import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import {
    validateJoiSchema,
    validationCreateBrandBody,
    validationUpdateBrandBody
} from '../service/validationService'
import { EBrandRole, ICreateBrandRequestBody, IUpdateBrandRequestBody } from '../types/brandTypes'
import { EUserRole } from '../constent/userConstent'
import { getPlanLimits, type PlanName } from '../config/planLimits'

const extractDomain = (url: string): string => {
    if (!url) return ''
    let clean = url.trim().toLowerCase()
    clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '')
    clean = clean.replace(/\/$/, '')
    return clean.split('/')[0].split('?')[0]
}

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

            const effectivePlan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'starter') as PlanName)
            const planLimits = getPlanLimits(effectivePlan)

            // Check multi-brand plan limits
            const existingBrands = await databseService.findBrandsByOrgId(orgId)
            if (existingBrands.length >= planLimits.maxBrands) {
                return httpError(
                    next,
                    new Error(`Multi-brand feature is only available on the Agency plan. Your ${org.plan || 'starter'} plan is limited to ${planLimits.maxBrands} brand. Please upgrade to the Agency plan to add additional brands.`),
                    req,
                    403
                )
            }

            // Check plan limits for query count
            const queriesCount = value.queries?.filter(q => q.enabled !== false).length || 0

            if (queriesCount > planLimits.maxQueries) {
                return httpError(
                    next,
                    new Error(`Your ${org.plan} plan allows maximum ${planLimits.maxQueries} queries. You tried to add ${queriesCount}. Please upgrade your plan or reduce queries.`),
                    req,
                    403
                )
            }

            // Check plan limits for competitors
            const maxCompetitors = planLimits.maxCompetitors ?? 5
            if (value.competitors && value.competitors.length > maxCompetitors) {
                return httpError(
                    next,
                    new Error(`Your ${org.plan || 'starter'} plan allows maximum ${maxCompetitors} competitors. You tried to add ${value.competitors.length}. Please upgrade your plan or reduce competitors.`),
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
                        return httpError(
                            next,
                            new Error(`You cannot add your own brand ("${value.name}") as a competitor.`),
                            req,
                            422
                        )
                    }

                    if ((brandDomain && compDomain && compDomain === brandDomain) || (brandDomain && compNameLower === brandDomain)) {
                        return httpError(
                            next,
                            new Error(`You cannot add your brand's website ("${value.website}") as a competitor.`),
                            req,
                            422
                        )
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

            const effectivePlan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'starter') as PlanName)
            const planLimits = getPlanLimits(effectivePlan)

            // If queries are updated, check plan limits
            if (value.queries) {
                const queriesCount = value.queries.filter(q => q.enabled !== false).length

                if (queriesCount > planLimits.maxQueries) {
                    return httpError(
                        next,
                        new Error(`Your ${org.plan} plan allows maximum ${planLimits.maxQueries} queries. You tried to save ${queriesCount}. Please upgrade your plan or reduce queries.`),
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
                        new Error(`Your ${org.plan || 'starter'} plan allows maximum ${maxCompetitors} competitors. You tried to save ${value.competitors.length}. Please upgrade your plan or reduce competitors.`),
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

            const mentions = await databseService.findMentionsByBrandId(id)
            const userBrandName = `${brand.name} (you)`

            const compNames = brand.competitors && brand.competitors.length > 0
                ? brand.competitors.map(c => c.name)
                : []

            if (mentions.length === 0) {
                const shareOfVoice = [
                    { name: brand.name, label: userBrandName, percentage: 100, color: '#FFC857', isUserBrand: true },
                    ...compNames.map((cName, idx) => ({
                        name: cName,
                        label: cName,
                        percentage: 0,
                        color: idx === 0 ? '#D97757' : '#3A4256',
                        isUserBrand: false
                    }))
                ]

                const headToHead = [
                    { name: userBrandName, mentionRate: '0%', avgPosition: '—', trend: 'flat', isUserBrand: true },
                    ...compNames.map(cName => ({
                        name: cName,
                        mentionRate: '0%',
                        avgPosition: '—',
                        trend: 'flat',
                        isUserBrand: false
                    }))
                ]

                const summary = `No scan data available yet for ${brand.name}. Run an AI scan to compare Share of Voice against competitors.`

                return httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                    brandId: brand._id,
                    brandName: brand.name,
                    shareOfVoice,
                    headToHead,
                    summary
                })
            }

            // Real mentions calculation
            const totalMentionsCount = mentions.filter(m => m.mentioned).length
            const userMentionsCount = mentions.filter(m => m.mentioned && m.queryText.toLowerCase().includes(brand.name.toLowerCase())).length
            
            const userSov = totalMentionsCount > 0 ? Math.round((userMentionsCount / totalMentionsCount) * 100) : 100

            const shareOfVoice = [
                { name: brand.name, label: userBrandName, percentage: userSov, color: '#FFC857', isUserBrand: true },
                ...compNames.map((cName, idx) => ({
                    name: cName,
                    label: cName,
                    percentage: totalMentionsCount > 0 ? Math.max(0, Math.round((100 - userSov) / Math.max(1, compNames.length))) : 0,
                    color: idx === 0 ? '#D97757' : '#3A4256',
                    isUserBrand: false
                }))
            ]

            const userMentionRate = `${Math.round((userMentionsCount / Math.max(1, mentions.length)) * 100)}%`

            const headToHead = [
                { name: userBrandName, mentionRate: userMentionRate, avgPosition: '#1.5', trend: 'flat', isUserBrand: true },
                ...compNames.map(cName => ({
                    name: cName,
                    mentionRate: '0%',
                    avgPosition: '—',
                    trend: 'flat',
                    isUserBrand: false
                }))
            ]

            const summary = `${brand.name} has ${userMentionRate} mention rate across tracked AI queries.`

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
