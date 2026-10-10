import api from './axios';

const KEY = 'signal.freeCheckId';

export interface FreeCheckHandoff {
  email: string;
  url: string;
  brandName: string;
  category: string;
  questions: string[];
}

// The website's free check survives signup → email confirmation → login, so onboarding can pre-fill it
export const saveFreeCheckId = (id: string) => {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked: no pre-fill */
  }
};

export const clearFreeCheck = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
};

export async function loadFreeCheck(): Promise<FreeCheckHandoff | null> {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!id) return null;
  try {
    const d = (await api.get(`/public/free-check/${encodeURIComponent(id)}`)).data.data;
    if (!d?.verified) return null;
    return {
      email: d.email,
      url: d.url,
      brandName: d.brandName,
      category: d.category,
      questions: (d.questions as Array<{ text: string }>).map((q) => q.text),
    };
  } catch {
    return null;
  }
}
