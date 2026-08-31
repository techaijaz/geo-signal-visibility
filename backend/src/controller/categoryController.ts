import { Request, Response, NextFunction } from 'express'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'

export default {
    getCategories: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const categories = await databseService.findActiveCategories()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { categories })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getAllCategories: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const categories = await databseService.findAllCategories()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { categories })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    createCategory: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { name, slug, description } = req.body

            if (!name || !slug) {
                return httpError(next, new Error('Name and slug are required'), req, 422)
            }

            const existingCategory = await databseService.findCategoryBySlug(slug)
            if (existingCategory) {
                return httpError(next, new Error('Category with this slug already exists'), req, 409)
            }

            const category = await databseService.createCategory({ name, slug, description, isActive: true })
            httpResponse(req, res, 201, responceseMessage.SUCCESS, category)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    updateCategory: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params
            const { name, slug, description, isActive } = req.body

            const category = await databseService.updateCategory(id, { name, slug, description, isActive })
            if (!category) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Category')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, category)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    deleteCategory: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params

            const category = await databseService.deleteCategory(id)
            if (!category) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Category')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, { _id: id })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
