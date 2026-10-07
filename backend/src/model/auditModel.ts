import mongoose from 'mongoose'
import { IAuditDocument } from '../types/auditTypes'

const auditGridItemSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        status: { type: String, required: true, trim: true },
        badgeType: {
            type: String,
            enum: ['badge-ok', 'badge-bad', 'badge-warn'],
            default: 'badge-warn'
        }
    },
    { _id: false }
)

const auditSchema = new mongoose.Schema<IAuditDocument>(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
            required: true,
            unique: true,
            index: true
        },
        healthScore: {
            type: Number,
            required: true,
            default: 58
        },
        holdingBack: {
            type: [String],
            default: []
        },
        crawlerAccess: {
            type: [auditGridItemSchema],
            default: []
        },
        structuredData: {
            type: [auditGridItemSchema],
            default: []
        },
        offSiteFootprint: {
            type: [auditGridItemSchema],
            default: []
        },
        marketplaceReadability: {
            type: [auditGridItemSchema],
            default: []
        },
        lastAuditedAt: {
            type: Date,
            default: Date.now
        },
        // AI crawler vs shopper comparison (aiViewService), run from the audit page
        aiView: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        // AI-readiness of product and collection pages (storeAuditService), run with the audit
        storeAudit: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        }
    },
    { timestamps: true }
)

export default mongoose.model<IAuditDocument>('Audit', auditSchema)
