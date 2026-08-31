import { NextFunction, Request, Response } from 'express'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import aiService from '../service/aiService'
import leadModel from '../model/leadModel'

interface IFreeCheckRequest extends Request {
    body: {
        brandName?: string
        website?: string
        email?: string
    }
}

export default {
    /**
     * Free visibility checker — no auth required, heavily rate-limited
     * Runs 2-3 cheap queries against 2-3 AI models, returns a quick score
     */
    freeCheck: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { brandName, website, email } = req.body as IFreeCheckRequest['body']

            if (!brandName || !website) {
                return httpError(next, new Error('brandName and website are required'), req, 422)
            }

            const brandNameStr = brandName.trim()
            const websiteStr = website.trim()

            // Default queries — cheap, generic, high-intent
            const defaultQueries = [
                `Best ${brandNameStr} alternatives in India`,
                `Is ${brandNameStr} a good brand?`,
                `Top recommended brands like ${brandNameStr}`,
                `${brandNameStr} review honest`
            ]

            const models = ['Claude', 'GPT', 'Gemini']
            const results = []

            for (const query of defaultQueries) {
                const row: Record<string, any> = { query }

                for (const model of models) {
                    let rawText = null

                    if (model === 'Claude') {
                        rawText = await aiService.callClaude(query)
                    } else if (model === 'GPT') {
                        rawText = await aiService.callOpenAI(query)
                    } else if (model === 'Gemini') {
                        rawText = await aiService.callGemini(query)
                    }

                    const parsed = rawText
                        ? aiService.parseMentionFromText(rawText, brandNameStr)
                        : { mentioned: false, position: null, sentiment: 'Neutral' as const }

                    row[model.toLowerCase()] = parsed
                }

                results.push(row)
            }

            // Calculate quick visibility score
            const totalMentions = results.reduce((sum, r) => {
                return sum +
                    (r.claude?.mentioned ? 1 : 0) +
                    (r.gpt?.mentioned ? 1 : 0) +
                    (r.gemini?.mentioned ? 1 : 0)
            }, 0)

            const totalChecks = results.length * models.length
            const score = Math.round((totalMentions / Math.max(1, totalChecks)) * 100)

            // Capture lead if email provided
            let leadId = null
            if (email && email.trim()) {
                try {
                    const lead = await leadModel.create({
                        email: email.trim().toLowerCase(),
                        brandName: brandNameStr,
                        website: websiteStr,
                        score,
                        resultJson: JSON.stringify(results),
                        ip: req.ip || '',
                        userAgent: req.headers['user-agent'] || ''
                    })
                    leadId = lead._id
                } catch (err) {
                    // Lead capture failure should not block the check
                    console.error('Lead capture failed:', err)
                }
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandName: brandNameStr,
                website: websiteStr,
                score,
                results,
                leadId,
                nextStep: 'Sign up free to track this and 15+ more queries across all AI models weekly.',
                sampleQueries: defaultQueries.slice(0, 2)
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}