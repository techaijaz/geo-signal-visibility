import { timeAgo } from '../utils/timeAgo';

export interface ScanError {
  message: string;
  at: string;
}

// Shown while the brand's latest scan saved nothing; the backend clears it after the next good scan
export default function ScanErrorBanner({ error }: { error?: ScanError | null }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', fontSize: '13.5px' }}>
      <strong>Last scan failed{timeAgo(error.at) ? ` (${timeAgo(error.at)})` : ''}.</strong> {error.message}
    </div>
  );
}
