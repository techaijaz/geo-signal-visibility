import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { EUserRole } from '../constent/userConstent'
import freeCheckModel from '../model/freeCheckModel'
import leadModel from '../model/leadModel'
import { getSetting, setSetting } from '../model/appSettingModel'
import { KEYS, redisStore, type IFreeCheckStore } from '../service/freeCheck/store'
import { istDay } from '../service/freeCheck/helpers'

const adminController = {
    getStats: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const stats = await databseService.getAdminSystemStats()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, stats)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getUsers: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { q, role, page, limit } = req.query
            const pageNum = parseInt(page as string, 10) || 1
            const limitNum = parseInt(limit as string, 10) || 20

            const result = await databseService.findAllUsersPaginated(q as string, role as string, pageNum, limitNum)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, result)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    updateUserRole: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params
            const { role } = req.body

            if (![EUserRole.USER, EUserRole.ADMIN].includes(role)) {
                return httpError(next, new Error('Invalid user role specified'), req, 422)
            }

            const updatedUser = await databseService.updateUserRole(id, role)
            if (!updatedUser) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, updatedUser)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    updateUserPlan: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params
            const { plan } = req.body

            if (!['free', 'starter', 'growth', 'agency'].includes(plan)) {
                return httpError(next, new Error('Invalid plan selected'), req, 422)
            }

            const updatedOrg = await databseService.updateUserPlan(id, plan)
            if (!updatedOrg) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User/Workspace')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, { plan: updatedOrg.plan })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    deleteUser: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params
            const deleted = await databseService.deleteUserById(id)
            if (!deleted) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User')), req, 404)
            }
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { _id: id })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // AI Models
    getAiModels: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const models = await databseService.findAllAiModels()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { models })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    createAiModel: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { name, modelId, provider, description, isActive, isDefault, inputCostPer1k, outputCostPer1k, maxTokens } = req.body

            if (!name || !modelId || !provider) {
                return httpError(next, new Error('Name, modelId, and provider are required'), req, 422)
            }

            const newModel = await databseService.createAiModel({
                name,
                modelId,
                provider,
                description,
                isActive: isActive ?? true,
                isDefault: isDefault ?? false,
                inputCostPer1k: Number(inputCostPer1k) || 0.0015,
                outputCostPer1k: Number(outputCostPer1k) || 0.002,
                maxTokens: Number(maxTokens) || 4000
            })

            httpResponse(req, res, 201, responceseMessage.SUCCESS, newModel)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    updateAiModel: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params
            const updatedModel = await databseService.updateAiModel(id, req.body)
            if (!updatedModel) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('AI Model')), req, 404)
            }
            httpResponse(req, res, 200, responceseMessage.SUCCESS, updatedModel)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    deleteAiModel: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params
            const deleted = await databseService.deleteAiModel(id)
            if (!deleted) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('AI Model')), req, 404)
            }
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { _id: id })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // Free checker: today's use against the limit, leads, 7-day funnel
    freeCheckDeps: { store: null as IFreeCheckStore | null },

    getFreeCheck: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const store = adminController.freeCheckDeps.store ?? redisStore()
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            const [limit, used, checks, verified, signups, leads] = await Promise.all([
                getSetting('freeCheckDailyLimit', 150),
                store.get(KEYS.global + istDay()).catch(() => '0'),
                freeCheckModel.countDocuments({ createdAt: { $gte: since } }),
                freeCheckModel.countDocuments({ createdAt: { $gte: since }, verifiedAt: { $ne: null } }),
                leadModel.countDocuments({ signedUpAt: { $gte: since } }),
                leadModel.find().sort({ createdAt: -1 }).limit(200).lean()
            ])
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                today: { used: Number(used || 0), limit },
                funnel: { checks, verified, signups },
                leads
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    setFreeCheckLimit: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const raw = (req.body as { limit?: unknown }).limit
            const limit = typeof raw === 'number' ? raw : Number.NaN
            if (!Number.isInteger(limit) || limit < 0 || limit > 5000)
                return httpError(next, new Error('Limit must be a whole number from 0 to 5000'), req, 400)
            await setSetting('freeCheckDailyLimit', limit)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { limit })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getFreeCheckLeadsCsv: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const leads = await leadModel.find().sort({ createdAt: -1 }).lean()
            // Quoted cells; a leading = + - @ is neutralised so a spreadsheet never runs it as a formula
            const cell = (v: unknown) =>
                `"${String(v ?? '')
                    .replace(/^([=+\-@])/, "'$1")
                    .replace(/"/g, '""')}"`
            const rows = leads.map((l) =>
                [
                    l.email,
                    l.domain,
                    l.brandName,
                    l.category,
                    l.country,
                    l.marketingConsent,
                    l.verifiedAt?.toISOString(),
                    l.signedUpAt?.toISOString() ?? '',
                    l.createdAt?.toISOString()
                ]
                    .map(cell)
                    .join(',')
            )
            res.setHeader('Content-Type', 'text/csv; charset=utf-8')
            res.setHeader('Content-Disposition', 'attachment; filename="free-check-leads.csv"')
            res.send(['email,site,brand,category,country,consent,verified,signed_up,created', ...rows].join('\n'))
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // Cost Logs
    getCostLogs: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const logsData = await databseService.getCostLogsSummary()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, logsData)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // API Keys Encrypted Management
    getApiKeys: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const keysStatus = await databseService.getAllApiKeysStatus()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { apiKeys: keysStatus })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    saveApiKey: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { provider, apiKey } = req.body
            if (!provider || !apiKey) {
                return httpError(next, new Error('Provider and apiKey are required'), req, 422)
            }

            const updatedDoc = await databseService.saveEncryptedApiKey(provider, apiKey, (req as IAuthenticatedRequest).authenticatedUser?._id)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                provider: updatedDoc.provider,
                maskedKey: updatedDoc.maskedKey,
                message: `Successfully encrypted and saved API key for ${updatedDoc.provider}`
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    deleteApiKey: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { provider } = req.params
            await databseService.deleteApiKeyByProvider(provider)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { provider, message: `Removed custom API key for ${provider}` })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // Admin Billing & Invoices Management
    getBillingStats: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const stats = await databseService.getAdminBillingStats()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, stats)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getAdminInvoices: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { q, status, page, limit } = req.query
            const pageNum = parseInt(page as string, 10) || 1
            const limitNum = parseInt(limit as string, 10) || 20

            const result = await databseService.getAdminInvoicesPaginated(q as string, status as string, pageNum, limitNum)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, result)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    updateInvoiceStatus: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params
            const { status } = req.body

            if (!['paid', 'pending', 'failed', 'refunded'].includes(status)) {
                return httpError(next, new Error('Invalid invoice status'), req, 422)
            }

            const updatedInvoice = await databseService.updateAdminInvoiceStatus(id, status)
            if (!updatedInvoice) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Invoice')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, updatedInvoice)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    createAdminInvoice: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId, orgId, plan, amount, description, paymentMethod, status } = req.body

            if (!userId || !plan || amount === undefined) {
                return httpError(next, new Error('User, plan, and amount are required'), req, 422)
            }

            const newInvoice = await databseService.createAdminInvoice({
                userId,
                orgId,
                plan,
                amount: Number(amount),
                description,
                paymentMethod,
                status
            })

            httpResponse(req, res, 201, responceseMessage.SUCCESS, newInvoice)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}

export default adminController
