import mongoose from 'mongoose'

// A verified email from the free checker; kept after its checks expire
export interface ILead {
    email: string
    domain: string
    brandName: string
    category: string
    market: string
    country: string
    checkIds: string[]
    marketingConsent: boolean
    consentAt: Date | null
    verifiedAt: Date
    signedUpAt: Date | null
    createdAt?: Date
}

const leadSchema = new mongoose.Schema<ILead>(
    {
        email: { type: String, required: true, unique: true },
        domain: { type: String, default: '' },
        brandName: { type: String, default: '' },
        category: { type: String, default: '' },
        market: { type: String, default: 'IN' },
        country: { type: String, default: '' },
        checkIds: { type: [String], default: [] },
        marketingConsent: { type: Boolean, default: false },
        consentAt: { type: Date, default: null },
        verifiedAt: { type: Date, required: true },
        signedUpAt: { type: Date, default: null }
    },
    { timestamps: true }
)

export default mongoose.model<ILead>('Lead', leadSchema)
