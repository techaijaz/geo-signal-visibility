import { getSetting, setSetting } from '../../model/appSettingModel'

export interface ISeller {
    legalName: string
    address: string
    email: string
    pan: string
    gstin: string
}

// Until the company is formed the proprietor sells (user, 11 Oct 2026); edited in Admin → Billing
export const DEFAULT_SELLER: ISeller = {
    legalName: 'Aijaz Ahmad, trading as GeoSignal AI',
    address: '422, Madhavpur, Fakharpur, Bahraich 271902, Uttar Pradesh, India',
    email: 'support@geosignalai.com',
    pan: '',
    gstin: ''
}

export const getSeller = async (): Promise<ISeller> => ({ ...DEFAULT_SELLER, ...(await getSetting<Partial<ISeller>>('billingSeller', {})) })
export const saveSeller = (s: ISeller) => setSetting('billingSeller', s)
