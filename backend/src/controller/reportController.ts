import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'

export default {
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

            httpResponse(req, res, 201, responceseMessage.SUCCESS, {
                report: newReport
            })
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

            const report = await databseService.findReportById(reportId)
            if (!report) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Report')), req, 404)
            }

            const brandName = brand.name
            const reportDate = report.date
            const score = report.score
            const meta = report.meta

            const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 320 >>
stream
BT
/F1 20 Tf
50 730 Td
(${brandName} - GEO AI Search Report) Tj
/F1 12 Tf
0 -35 Td
(Report Date: ${reportDate}) Tj
0 -20 Td
(Visibility & Health Score: ${score}/100) Tj
0 -20 Td
(Metadata: ${meta}) Tj
0 -35 Td
(Executive Summary:) Tj
0 -20 Td
(This report reflects your brand visibility across generative search engines,) Tj
0 -18 Td
(AI crawler accessibility ratings, and action item optimization metrics.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000246 00000 n 
0000000618 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
697
%%EOF`

            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="GEO_Report_${brandName.replace(/\s+/g, '_')}_${report._id}.pdf"`
            )
            res.status(200).send(Buffer.from(pdfString, 'binary'))
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
