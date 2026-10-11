export type FixType = 'faq' | 'comparison'
export type FixLanguage = 'en' | 'hi-en' | 'hi'
export type FixStatus = 'pending' | 'done' | 'failed'

// FAQ items use question/answer; comparison items use heading/body, and the difference table uses rows
export interface IFixItem {
    question?: string
    answer?: string
    heading?: string
    body?: string
    rows?: Array<{ label: string; brand: string; competitor: string }>
    source?: string
}

export interface IGeneratedFix {
    _id: unknown
    orgId: unknown
    brandId: unknown
    userId: unknown
    type: FixType
    kind?: string | null
    competitor?: string | null
    language: FixLanguage
    status: FixStatus
    error?: string | null
    note?: string | null
    title?: string | null
    pagesRead: Array<{ url: string; ok: boolean }>
    items: IFixItem[]
    createdAt: Date
    finishedAt?: Date | null
}
