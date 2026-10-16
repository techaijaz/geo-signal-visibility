// Gemini bills thinking tokens as output
export const groundedUsage = (u?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }) => ({
    inputTokens: u?.promptTokenCount ?? 0,
    outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0)
})

// Google Search grounding: GROUNDING_FREE_SEARCHES a month free, then GROUNDING_USD_PER_SEARCH each ($14 per 1,000).
// usedThisMonth = searches logged earlier this month; only the part of `searches` past the allowance is paid
export const GROUNDING_FREE_SEARCHES = 5000
export const GROUNDING_USD_PER_SEARCH = 0.014
export const groundingFee = (usedThisMonth: number, searches: number) =>
    Math.max(0, Math.min(searches, usedThisMonth + searches - GROUNDING_FREE_SEARCHES)) * GROUNDING_USD_PER_SEARCH
