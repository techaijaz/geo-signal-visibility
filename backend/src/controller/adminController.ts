import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { EUserRole } from '../constent/userConstent'

export default {
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

            const result = await databseService.findAllUsersPaginated(
                q as string,
                role as string,
                pageNum,
                limitNum
            )
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

            const updatedDoc = await databseService.saveEncryptedApiKey(
                provider,
                apiKey,
                (req as IAuthenticatedRequest).authenticatedUser?._id
            )

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

            const result = await databseService.getAdminInvoicesPaginated(
                q as string,
                status as string,
                pageNum,
                limitNum
            )
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
