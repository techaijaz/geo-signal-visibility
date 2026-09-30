import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { generateReportPdf } from '../service/reportService/pdfService'
import { buildReportData } from '../service/reportService/reportData'
import { verifyUnsubscribeToken } from '../service/reportService/weeklyReport'
import reportShareModel from '../model/reportShareModel'
import mongoose from 'mongoose'

const unsubscribePage = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#F2F4F1;font-family:Arial,Helvetica,sans-serif;color:#0F2629;display:grid;place-items:center;min-height:100vh">
<main style="max-width:440px;padding:32px;background:#fff;border:1px solid #D3DBD8;border-radius:12px"><h1 style="font-size:22px;margin:0 0 10px">${title}</h1><p style="margin:0;color:#52676A;line-height:1.5">${body}</p></main></body></html>`

export default {
    // Public link from the weekly email (GET) and one-click unsubscribe from mail clients (POST)
    unsubscribeWeeklyReport: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const src = { ...req.query, ...(req.body || {}) } as Record<string, unknown>
            const brandId = String(src.b || '')
            const email = String(src.e || '').toLowerCase()
            const token = String(src.t || '')
            res.type('html')
            if (!mongoose.isValidObjectId(brandId) || !email || !verifyUnsubscribeToken(brandId, email, token)) {
                res.status(400).send(unsubscribePage('This link is not valid', 'The unsubscribe link is incomplete or has been changed. Use the link from the latest weekly email, or reply to that email and we will remove you.'))
                return
            }
            await reportShareModel.updateOne({ brandId }, { $addToSet: { unsubscribed: email } }, { upsert: true })
            res.status(200).send(unsubscribePage('You are unsubscribed', `${email.replace(/[<>&"]/g, '')} will no longer get the weekly AI visibility report for this brand.`))
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getBrandReports: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params

            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const reports = await databseService.findReportsByBrandId(brandId)
            const sharedEmails = await databseService.getSharedEmailsByBrandId(brandId)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandId,
                brandName: brand.name,
                reports,
                sharedEmails
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    generateReport: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params

            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const newReport = await databseService.generateBrandReport(brandId)

            const { data: _snapshot, ...report } = newReport.toObject()
            httpResponse(req, res, 201, responceseMessage.SUCCESS, { report })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    downloadReportPdf: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId, reportId } = req.params

            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const report = await databseService.findReportByIdForBrand(reportId, brandId)
            if (!report) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Report')), req, 404)
            }

            // Reports created before snapshots existed get one from the current data, saved for next time
            if (!report.data) {
                report.data = await buildReportData(brandId)
                await report.save()
            }
            const pdf = await generateReportPdf(report.data)
            // Header values must be ASCII; brand names can contain ₹, Hindi or quotes
            const safeName = brand.name.replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'Brand'

            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Disposition', `attachment; filename="GEO_Report_${safeName}_${report._id}.pdf"`)
            res.status(200).send(pdf)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    addShareEmail: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params
            const { email } = req.body

            if (!email || typeof email !== 'string' || !email.trim()) {
                return httpError(next, new Error('Email is required'), req, 400)
            }

            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const updatedEmails = await databseService.addSharedEmailToBrand(brandId, email.trim().toLowerCase())

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                sharedEmails: updatedEmails
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    removeShareEmail: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId, email } = req.params

            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const updatedEmails = await databseService.removeSharedEmailFromBrand(brandId, decodeURIComponent(email).toLowerCase())

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                sharedEmails: updatedEmails
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
