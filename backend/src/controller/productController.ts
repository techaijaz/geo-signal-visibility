// Products a brand tracks in AI answers: list, save, import from Shopify, AI short names, visibility
import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { EUserRole } from '../constent/userConstent'
import { getPlanLimits, type PlanName } from '../config/planLimits'
import { validateJoiSchema, validationSaveProductsBody, validationShortNamesBody } from '../service/validationService'
import { loadScanPair } from '../service/competitorService'
import { withAiCallContext } from '../service/costLogService'
import { auditService } from '../service/auditService'
import {
    aiShortNames,
    canSaveProducts,
    cleanProductList,
    computeProductVisibility,
    fetchShopifyProducts,
    mergeRefresh,
    suggestProductQuestions
} from '../service/productService'
import brandModel from '../model/brandModel'
import auditModel from '../model/auditModel'
import { aiReadyFor, type IStoreAudit } from '../service/storeAuditService'
import { feedScoreFor, runFeedHealth, type IFeedHealth } from '../service/feedHealthService'
import costLogModel from '../model/costLogModel'
import { IBrandProduct } from '../types/brandTypes'

const AI_NAMES_PER_DAY = 10
const FEED_EVERY_MS = 10 * 60 * 1000

// The brand (in the user's own workspace) and the plan's product limit, or an error response
const loadBrand = async (req: Request, next: NextFunction) => {
    const { authenticatedUser } = req as IAuthenticatedRequest
    const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
    if (!org) {
        httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
        return null
    }
    const brand = await databseService.findBrandByIdAndOrgId(req.params.id, org._id.toString())
    if (!brand) {
        httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
        return null
    }
    const plan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'free') as PlanName)
    return { brand, plan, maxProducts: getPlanLimits(plan).maxProducts }
}

const originOf = (website: string) => new URL(auditService.cleanUrl(website)).origin

export default {
    getProducts: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { products: found.brand.products || [], maxProducts: found.maxProducts })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    saveProducts: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ products: IBrandProduct[] }>(validationSaveProductsBody, req.body)
            if (error) return httpError(next, new Error(error), req, 422)
            const found = await loadBrand(req, next)
            if (!found) return
            if (!canSaveProducts(value.products.length, (found.brand.products || []).length, found.maxProducts)) {
                return httpError(
                    next,
                    new Error(
                        `Your ${found.plan} plan allows maximum ${found.maxProducts} products. You tried to save ${value.products.length}. Please upgrade your plan or remove products.`
                    ),
                    req,
                    403
                )
            }
            await brandModel.updateOne({ _id: found.brand._id }, { $set: { products: value.products } })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { products: value.products })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // Reads the store's catalogue; saves nothing
    importProducts: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const { shopify, raw, truncated } = await fetchShopifyProducts(found.brand.website)
            const products = shopify ? cleanProductList(raw, found.brand.name, originOf(found.brand.website)) : []
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                shopify,
                products,
                hidden: products.filter((p) => p.hidden).length,
                truncated
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    shortNames: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ titles: string[] }>(validationShortNamesBody, req.body)
            if (error) return httpError(next, new Error(error), req, 422)
            const found = await loadBrand(req, next)
            if (!found) return
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
            const used = await costLogModel.countDocuments({ brandId: found.brand._id, purpose: 'products', createdAt: { $gte: since } })
            if (used >= AI_NAMES_PER_DAY) {
                return httpError(
                    next,
                    new Error(`Product names can be cleaned with AI ${AI_NAMES_PER_DAY} times a day. Edit the names by hand or try again tomorrow.`),
                    req,
                    429
                )
            }
            const names = await withAiCallContext({ brandId: String(found.brand._id), purpose: 'products' }, () =>
                aiShortNames(value.titles, found.brand.name)
            )
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { names })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // Store facts (price, link, photo, title) update; names the user edited stay
    refreshProducts: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const { shopify, raw } = await fetchShopifyProducts(found.brand.website)
            if (!shopify) return httpError(next, new Error('Shopify store not found. Add products manually.'), req, 422)
            const merged = mergeRefresh(
                (found.brand.products || []) as IBrandProduct[],
                cleanProductList(raw, found.brand.name, originOf(found.brand.website))
            )
            await brandModel.updateOne({ _id: found.brand._id }, { $set: { products: merged } })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { products: merged })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // Feed health from the Products page; cheap (no AI), so no daily quota, but at most once per 10 minutes
    checkFeed: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const { brand } = found
            const saved = (await auditModel.findOne({ brandId: brand._id }).select('feedHealth').lean()) as { feedHealth?: IFeedHealth | null } | null
            const last = saved?.feedHealth?.checkedAt ? new Date(saved.feedHealth.checkedAt).getTime() : 0
            if (saved?.feedHealth && Date.now() - last < FEED_EVERY_MS) {
                return httpResponse(req, res, 200, responceseMessage.SUCCESS, { feedHealth: saved.feedHealth, saved: true, fresh: false })
            }
            const feedHealth = await runFeedHealth(brand.website)
            // Saved only on an existing audit (no upsert: a bare audit would stop the brand's first real audit)
            const result = await auditModel.updateOne({ brandId: brand._id }, { $set: { feedHealth } })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { feedHealth, saved: result.matchedCount > 0, fresh: true })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getVisibility: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const { brand, maxProducts } = found
            const products = (brand.products || []) as IBrandProduct[]
            const { current, previous } = await loadScanPair(req.params.id, brand.lastScanId)
            const result = computeProductVisibility(current, previous, brand.name, products, maxProducts)
            const existing = (brand.queries || []).map((q) => q.text)
            const notSeen = new Set(result.products.filter((r) => !r.answers && !r.overLimit && !r.genericName).map((r) => r.shortName))
            const suggestions = Object.fromEntries(
                products.filter((p) => notSeen.has(p.shortName)).map((p) => [p.shortName, suggestProductQuestions(p, existing)])
            )
            // Each product's AI-readiness from the latest store audit (null until the first one)
            const storeAudit = (await auditModel.findOne({ brandId: brand._id }).select('storeAudit').lean())?.storeAudit as
                | IStoreAudit
                | null
                | undefined
            const feedHealth = (await auditModel.findOne({ brandId: brand._id }).select('feedHealth').lean())?.feedHealth as
                | IFeedHealth
                | null
                | undefined
            const rows = result.products.map((r) => ({ ...r, aiReady: aiReadyFor(r.url, storeAudit), feed: feedScoreFor(r.url, feedHealth) }))
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { ...result, products: rows, suggestions })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
