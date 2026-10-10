import mongoose from 'mongoose'

// Small admin-editable settings that must change without a deploy
const appSettingSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        value: { type: mongoose.Schema.Types.Mixed }
    },
    { timestamps: true }
)
const appSettingModel = mongoose.model('AppSetting', appSettingSchema)

export const getSetting = async <T>(key: string, fallback: T): Promise<T> => {
    const doc = await appSettingModel.findOne({ key }).lean()
    return doc ? (doc.value as T) : fallback
}

export const setSetting = async (key: string, value: unknown) => {
    await appSettingModel.updateOne({ key }, { $set: { value } }, { upsert: true })
}

export default appSettingModel
