import mongoose from 'mongoose'

// Short mutual-exclusion locks keyed by _id (e.g. "sub:<orgId>"); stale ones expire on their own
const lockSchema = new mongoose.Schema(
    { _id: { type: String, required: true }, at: { type: Date, default: Date.now, expires: 300 } },
    { versionKey: false }
)

export default mongoose.model<{ _id: string; at: Date }>('Lock', lockSchema)
