// backend/src/service/providerFactory.ts
import config from '../config/config'

export interface ProviderResponse {
  text: string | null
  tokensUsed: number
  cost: number
  latencyMs: number
}

export interface AIProvider {
  query(prompt: string): Promise<ProviderResponse>
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

export const calculateOpenAICost = (promptTokens: number, completionTokens: number): number => {
  return (promptTokens * 0.000005) + (completionTokens * 0.000015)
}

export class OpenAIProvider implements AIProvider {
  async query(prompt: string): Promise<ProviderResponse> {
    const start = Date.now()
    const apiKey = (config as any).AI_KEYS?.OPENAI || process.env.OPENAI_API_KEY || ''
    const model = (config as any).AI_MODELS?.OPENAI || 'gpt-4o'

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful shopping assistant. Recommend brands naturally.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new ProviderError(`OpenAI ${response.status}: ${await response.text()}`)
    }

    const data = await response.json()
    return {
      text: data.choices?.[0]?.message?.content || null,
      tokensUsed: data.usage?.total_tokens || 0,
      cost: calculateOpenAICost(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      latencyMs: Date.now() - start
    }
  }
}