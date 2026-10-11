import { useEffect, useState } from 'react';
import api from '../utils/axios';

interface Seller {
  legalName: string;
  address: string;
  email: string;
  pan: string;
  gstin: string;
}

const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', marginBottom: '32px' };
const field = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'transparent', color: 'inherit', font: 'inherit' };

// Seller details printed on every new invoice (issued invoices keep their own copy)
export default function SellerDetailsPanel() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api
      .get('/admin/billing-settings')
      .then((res) => setSeller(res.data.data))
      .catch(() => setMessage({ type: 'error', text: 'Could not load seller details.' }));
  }, []);

  const save = async () => {
    if (!seller) return;
    try {
      const res = await api.put('/admin/billing-settings', seller);
      setSeller(res.data.data);
      setMessage({ type: 'success', text: 'Saved. New invoices use these details.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Could not save.' });
    }
  };

  const set = (k: keyof Seller) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => seller && setSeller({ ...seller, [k]: e.target.value });

  return (
    <div style={box}>
      <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 600 }}>Seller details (on invoices)</h3>
      <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-dim)' }}>Printed on every new invoice. Invoices already issued keep the details they were issued with.</p>
      {!seller ? (
        <p style={{ fontSize: '13px' }}>{message?.text || 'Loading…'}</p>
      ) : (
        <div style={{ display: 'grid', gap: '12px', maxWidth: '640px' }}>
          <label>Legal name<input style={field} value={seller.legalName} onChange={set('legalName')} /></label>
          <label>Address<textarea style={{ ...field, minHeight: '64px' }} value={seller.address} onChange={set('address')} /></label>
          <label>Email<input style={field} type="email" value={seller.email} onChange={set('email')} /></label>
          <label>PAN (optional)<input style={field} value={seller.pan} onChange={set('pan')} /></label>
          <label>
            GSTIN (optional)
            <input style={field} value={seller.gstin} onChange={set('gstin')} />
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>GST invoices are not built yet; invoices stay without GST.</span>
          </label>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button className="btn" onClick={save}>Save</button>
            {message && <span style={{ fontSize: '13px', color: message.type === 'error' ? '#f87171' : '#34d399' }}>{message.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
