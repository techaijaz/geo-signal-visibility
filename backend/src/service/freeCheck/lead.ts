import leadModel from '../../model/leadModel'

// A free-checker lead that becomes an account; never creates a lead
export const markLeadSignedUp = async (email: string) => {
    await leadModel.updateOne({ email: email.trim().toLowerCase(), signedUpAt: null }, { $set: { signedUpAt: new Date() } })
}
