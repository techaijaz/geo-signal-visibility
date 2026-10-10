export type FreeCheckEngine = 'ChatGPT' | 'Gemini'
export type FreeCheckStatus = 'queued' | 'running' | 'done' | 'failed' | 'waiting-email' | 'scheduled'

export interface IFreeCheckAnswer {
    engine: FreeCheckEngine
    ok: boolean
    named: boolean
    position: number | null
    brands: string[]
}

export interface IFreeCheckQuestion {
    text: string
    answers: IFreeCheckAnswer[]
}

export interface IFreeCheck {
    checkId: string
    url: string
    domain: string
    brandName: string
    category: string
    market: 'IN'
    questions: IFreeCheckQuestion[]
    ipHash: string
    country: string
    status: FreeCheckStatus
    email: string | null
    verifiedAt: Date | null
    otpHash: string | null
    otpExpiresAt: Date | null
    otpAttempts: number
    consentRequested?: boolean
    budgetDay?: string | null // the IST day whose budget this check used
    createdAt?: Date
}
