// Mirrors the backend's siteProfile type (the brand API already sends the computed sellsProducts)
export type SiteType = 'shop' | 'service' | 'local' | 'saas' | 'media';
const TYPES: Record<string, SiteType> = { service: 'service', local_business: 'local', saas: 'saas', content_media: 'media' };
export const siteTypeOf = (businessType?: string): SiteType => TYPES[businessType || ''] || 'shop';
export const hasCity = (businessType?: string) => businessType === 'service' || businessType === 'local_business';

export const listingsCopy = (t: SiteType) => {
  if (t === 'shop')
    return {
      title: 'Marketplace & Sales Channels',
      tip: 'Verifies linked sales platforms (IndiaMART, Amazon, Flipkart, Shopify, G2, etc.).',
      impact: 'AI shopping assistants fetch product specs and reviews directly from these linked marketplaces to recommend your products.',
      sub: 'AI engines (ChatGPT, Gemini, Perplexity) fetch product listings and reviews directly from platforms linked on your website (IndiaMART, Amazon, Shopify, G2, etc.)',
    };
  const names = t === 'saas' ? 'G2 and Capterra' : t === 'media' ? 'Google News and Wikipedia' : 'Google Business Profile, Justdial, Practo and Sulekha';
  return {
    title: 'Listings & directories',
    tip: `Checks links from your website to ${names}.`,
    impact: `AI answers often quote ${names} when they recommend a business like yours.`,
    sub: `AI engines (ChatGPT, Gemini, Perplexity) read listings on ${names} when they are linked from your website.`,
  };
};

export const queryExample = (t: SiteType) =>
  t === 'service' || t === 'local'
    ? 'Best dental clinic in Mumbai'
    : t === 'saas'
      ? 'Best invoicing software for small business'
      : t === 'media'
        ? 'Most reliable cricket news website'
        : 'Best skincare product for dry skin';
