import counterModel from '../../model/counterModel'

const IST_MS = 330 * 60 * 1000

// Indian financial year (April–March) of a moment, in IST: '2026-27'
export const financialYear = (d: Date) => {
    const ist = new Date(d.getTime() + IST_MS)
    const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

// SAI/2026-27/0001: one atomic counter per financial year, so two payments never share a number
export const nextInvoiceNumber = async (d = new Date()) => {
    const fy = financialYear(d)
    const c = await counterModel.findOneAndUpdate({ _id: `invoice:${fy}` }, { $inc: { seq: 1 } }, { upsert: true, new: true })
    return `SAI/${fy}/${String(c!.seq).padStart(4, '0')}`
}
