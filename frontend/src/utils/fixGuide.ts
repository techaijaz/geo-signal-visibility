export interface FixGuideData {
  kind: string;
  who: 'you' | 'developer';
  title: string;
  steps: { shopify: string[]; other: string[] };
  forDeveloper: string;
}
export type DeveloperTask =
  | { type: 'recommendation'; id: string }
  | { type: 'store-audit' | 'collection' | 'ai-view' | 'feed'; key: string; url?: string }
  | { type: 'fix'; id: string };
export interface GuideContext {
  guides: Record<string, FixGuideData>;
  isShopify: boolean;
  developerEmail: string;
  lastSent?: Record<string, { to: string; at: string }>;
}
// Must match backend developerTask.taskKey
export const taskKey = (t: DeveloperTask) => ('id' in t ? `${t.type}:${t.id}` : `${t.type}:${t.key}:${t.url || ''}`);

// Plain text for WhatsApp: the task, the steps for this store, the developer note and any code
export const copyTextFor = (what: string, guide: FixGuideData, isShopify: boolean, code?: string) =>
  [
    what,
    '',
    'Steps:',
    ...(isShopify ? guide.steps.shopify : guide.steps.other).map((s, i) => `${i + 1}. ${s}`),
    '',
    `For the developer: ${guide.forDeveloper}`,
    ...(code ? ['', 'Code:', code] : [])
  ].join('\n');
