import mongoose from 'mongoose'
import { IGeneratedFix } from '../types/fixTypes'

const itemSchema = new mongoose.Schema(
    {
        question: String,
        answer: String,
        heading: String,
        body: String,
        // No default: an empty array would make every prose item look like a table
        rows: { type: [{ _id: false, label: String, brand: String, competitor: String }], default: undefined },
        source: String
    },
    { _id: false }
)

const generatedFixSchema = new mongoose.Schema(
    {
        orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true },
        brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: ['faq', 'comparison'], required: true },
        kind: { type: String, default: null },
        competitor: { type: String, default: null },
        language: { type: String, enum: ['en', 'hi-en', 'hi'], default: 'en' },
        status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
        error: { type: String, default: null },
        note: { type: String, default: null },
        title: { type: String, default: null },
        pagesRead: [{ _id: false, url: String, ok: Boolean }],
        items: { type: [itemSchema], default: [] },
        createdAt: { type: Date, default: Date.now },
        // Set once when a worker claims the job, so a job delivered twice runs once
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null }
    },
    { versionKey: false }
)
// Monthly usage is counted per org by creation time
generatedFixSchema.index({ orgId: 1, createdAt: -1 })

export default mongoose.model<IGeneratedFix>('GeneratedFix', generatedFixSchema)
