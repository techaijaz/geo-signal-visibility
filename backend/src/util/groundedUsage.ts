// Gemini bills thinking tokens as output
export const groundedUsage = (u?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }) => ({
    inputTokens: u?.promptTokenCount ?? 0,
    outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0)
})
