import { timeAgo } from '../utils/timeAgo';

export interface ScanError {
  message: string;
  at: string;
}

// Engines that gave no answer in the latest scan: the scan still counts, but the score misses them
function SilentModelsNote({ models }: { models: string[] }) {
  return (
    <div role="status" style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontSize: '13px' }}>
      <strong>{models.join(', ')} didn't answer in the last scan.</strong> Your results use the other AI engines only. We'll try again in the next scan.
    </div>
  );
}

// Shown while the brand's latest scan saved nothing; the backend clears it after the next good scan.
// When the scan worked but some engines were silent, a yellow note says which ones.
export default function ScanErrorBanner({ error, silentModels }: { error?: ScanError | null; silentModels?: string[] }) {
  if (!error) return silentModels?.length ? <SilentModelsNote models={silentModels} /> : null;
  return (
    <div role="alert" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', fontSize: '13.5px' }}>
      <strong>Last scan failed{timeAgo(error.at) ? ` (${timeAgo(error.at)})` : ''}.</strong> {error.message}
    </div>
  );
}
