import api from './axios';

// Questions Indian shoppers ask AI. Templates and AI suggestions both come from the backend.
export type QueryLang = 'EN' | 'HI-EN';
export type QueryIntent = 'Best-of' | 'Price' | 'Occasion' | 'Comparison' | 'Direct' | 'How-to';

export interface SuggestedQuery {
  text: string;
  lang: QueryLang;
  intent: QueryIntent;
}

export interface QueryItem extends SuggestedQuery {
  id: string;
  enabled: boolean;
}

export const toQueryItems = (items: SuggestedQuery[]): QueryItem[] =>
  items.map((q, idx) => ({ ...q, id: `q-${Date.now()}-${idx}`, enabled: true }));

export async function fetchQueryTemplates(category: string, brandName?: string, businessType?: string, city?: string): Promise<SuggestedQuery[]> {
  const res = await api.get('/queries/templates', {
    params: { category, brand: brandName || '', businessType: businessType || '', city: city || '' },
  });
  return res.data?.data?.queries || [];
}

// Not saved by the server; `existing` holds unsaved queries on the page so they are not suggested again
export async function fetchAiQuerySuggestions(
  brandId: string,
  existing: string[]
): Promise<{ queries: SuggestedQuery[]; message?: string }> {
  const res = await api.post(`/brands/${brandId}/query-suggestions`, { existing });
  return { queries: res.data?.data?.queries || [], message: res.data?.data?.message };
}

// Tag for a query the user typed: Hinglish if it has a common Hindi word, else English
export const queryLang = (text: string): 'HI-EN' | 'EN' =>
  /\b(kaunsa|sasta|accha|hai|ke|liye|kaise)\b/i.test(text) ? 'HI-EN' : 'EN';
