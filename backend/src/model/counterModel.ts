import mongoose from 'mongoose'

// Atomic sequences (invoice numbers per financial year)
const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false })

export default mongoose.model<{ _id: string; seq: number }>('Counter', counterSchema)
