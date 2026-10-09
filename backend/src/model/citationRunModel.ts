import mongoose from 'mongoose'
import { ICitationRunDocument } from '../types/citationTypes'

const pageSchema = new mongoose.Schema(
    {
        url: { type: String, required: true },
        domain: { type: String, default: '' },
        title: { type: String, default: '' },
        type: { type: String, enum: ['marketplace', 'video', 'own', 'competitor', 'article'], default: 'article' },
        citedIn: { type: [String], default: [] },
        brands: { type: [String], default: [] },
        brandFound: { type: Boolean, default: false },
        readFrom: { type: String, enum: ['page', 'answer'], default: 'page' }
    },
    { _id: false }
)

const citationRunSchema = new mongoose.Schema<ICitationRunDocument>(
    {
        brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
        week: { type: String, required: true },
        status: { type: String, enum: ['running', 'ok', 'failed'], default: 'running' },
        startedAt: { type: Date, default: Date.now },
        finishedAt: { type: Date, default: null },
        questions: { type: [new mongoose.Schema({ text: String, ok: Boolean }, { _id: false })], default: [] },
        pages: { type: [pageSchema], default: [] }
    },
    { timestamps: true }
)

// One run per brand per week: a repeated job can't run (and pay) twice
citationRunSchema.index({ brandId: 1, week: -1 }, { unique: true })

export default mongoose.model<ICitationRunDocument>('CitationRun', citationRunSchema)
