import { Schema, model } from 'mongoose'

export interface ICategory {
    _id?: string
    name: string
    slug: string
    description?: string
    isActive: boolean
    createdAt?: Date
    updatedAt?: Date
}

const categorySchema = new Schema<ICategory>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
)

export default model<ICategory>('Category', categorySchema)
