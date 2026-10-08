import mongoose from 'mongoose'
import { IFixEventDocument } from '../types/fixEventTypes'

const fixEventSchema = new mongoose.Schema<IFixEventDocument>(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
            required: true
        },
        recommendationId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        // Copied from the recommendation so the name survives a recommendation rescan
        text: {
            type: String,
            required: true,
            trim: true
        },
        category: {
            type: String,
            default: ''
        },
        source: {
            type: String,
            enum: ['user', 'audit'],
            required: true
        },
        // The audit confirmed the work is in place
        verified: {
            type: Boolean,
            default: false
        },
        doneAt: {
            type: Date,
            required: true
        },
        // Set when the user unticks the recommendation; such events are ignored
        undoneAt: {
            type: Date,
            default: null
        },
        // Set once the result went out in the Monday email
        emailedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
)

fixEventSchema.index({ brandId: 1, doneAt: -1 })
fixEventSchema.index({ brandId: 1, recommendationId: 1 })

export default mongoose.model<IFixEventDocument>('FixEvent', fixEventSchema)
