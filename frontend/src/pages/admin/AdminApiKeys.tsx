import { useState, useEffect } from 'react';
import api from '../../utils/axios';

interface ApiKeyStatus {
  provider: string;
  isConfigured: boolean;
  maskedKey: string;
  source: string;
  updatedAt?: string;
}

export default function AdminApiKeys() {
  const [keys, setKeys] = useState<ApiKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('OPENAI');
  const [inputKey, setInputKey] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/api-keys');
      setKeys(res.data.data.apiKeys || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to fetch API keys' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (provider: string) => {
    setSelectedProvider(provider);
    setInputKey('');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;

    try {
      const res = await api.post('/admin/api-keys', {
        provider: selectedProvider,
        apiKey: inputKey.trim()
      });

      setMessage({
        type: 'success',
        text: res.data.data?.message || `Successfully encrypted & saved API key for ${selectedProvider}`
      });
      setIsModalOpen(false);
      fetchApiKeys();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to save API key' });
    }
  };

  const handleDeleteCustomKey = async (provider: string) => {
    if (!window.confirm(`Are you sure you want to remove the custom encrypted DB key for ${provider}?`)) return;

    try {
      await api.delete(`/admin/api-keys/${provider}`);
      setMessage({ type: 'success', text: `Removed custom DB key for ${provider}. Falling back to .env if set.` });
      fetchApiKeys();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to remove API key' });
    }
  };

  const providerDetails: Record<string, { name: string; color: string; desc: string }> = {
    OPENAI: { name: 'OpenAI GPT', color: '#3FBF8F', desc: 'Powers GPT-4o, GPT-4o Mini models' },
    DEEPSEEK: { name: 'DeepSeek AI', color: '#0066FF', desc: 'Powers DeepSeek v4 Flash & Pro reasoning models' },
    GEMINI: { name: 'Google Gemini', color: '#6C8EF5', desc: 'Powers Gemini 2.0 Flash & 1.5 Pro models' },
    ANTHROPIC: { name: 'Anthropic Claude', color: '#D97757', desc: 'Powers Claude 3.5 Sonnet & Opus models' },
    PERPLEXITY: { name: 'Perplexity AI', color: '#FFC857', desc: 'Powers Sonar web search-grounded models' },
    OMNIROUTE: { name: 'OmniRoute LLM Router', color: '#A855F7', desc: 'Unified Router for dynamic multi-provider routing' }
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 700 }}>API Keys Manager</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0 0', fontSize: '14px' }}>
            Configure LLM Provider API keys dynamically. Keys are encrypted using **AES-256** before being saved to MongoDB.
          </p>
        </div>
      </div>

      {message && (
        <div 
          style={{ 
            marginBottom: '20px', 
            padding: '12px 16px', 
            borderRadius: '8px', 
            background: message.type === 'success' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
            border: `1px solid ${message.type === 'success' ? 'var(--good)' : 'var(--bad)'}`,
            color: message.type === 'success' ? 'var(--good)' : 'var(--bad)',
            fontSize: '13.5px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Security Banner */}
      <div 
        style={{ 
          background: 'linear-gradient(90deg, rgba(255,200,87,0.08), rgba(63,191,143,0.08))', 
          border: '1px solid var(--amber-line)', 
          borderRadius: '12px', 
          padding: '16px 20px',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}
      >
        <span style={{ fontSize: '28px' }}>🔐</span>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--amber)', fontSize: '14px', marginBottom: '2px' }}>
            AES-256 Database Encryption Active
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '12.5px', lineHeight: 1.4 }}>
            All API keys are encrypted at rest using AES-256-CBC. Raw keys are never stored in plain text and are decrypted securely only during runtime AI scan calls.
          </div>
        </div>
      </div>

      {/* Provider Keys Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
          Loading provider key statuses...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {keys.map((k) => {
            const meta = providerDetails[k.provider] || { name: k.provider, color: 'var(--text)', desc: 'AI Provider' };
            return (
              <div
                key={k.provider}
                style={{
                  background: 'var(--surface)',
                  border: k.isConfigured ? '1px solid var(--line)' : '1px dashed var(--line-soft)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  {/* Provider Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: `${meta.color}22`,
                        color: meta.color,
                        border: `1px solid ${meta.color}44`
                      }}
                    >
                      {meta.name}
                    </span>

                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: k.isConfigured ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                        color: k.isConfigured ? 'var(--good)' : '#F87171'
                      }}
                    >
                      {k.isConfigured ? 'Active' : 'Missing'}
                    </span>
                  </div>

                  <p style={{ fontSize: '12.5px', color: 'var(--text-dim)', margin: '0 0 16px 0' }}>
                    {meta.desc}
                  </p>

                  {/* Masked Key Display */}
                  <div
                    style={{
                      background: 'var(--ink-2)',
                      border: '1px solid var(--line-soft)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      marginBottom: '16px'
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Key Preview ({k.source})
                    </div>
                    <div className="mono" style={{ fontSize: '13px', color: k.isConfigured ? 'var(--amber)' : 'var(--text-faint)' }}>
                      {k.maskedKey}
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid var(--line-soft)' }}>
                  {k.source.includes('Database') && (
                    <button
                      onClick={() => handleDeleteCustomKey(k.provider)}
                      className="btn"
                      style={{ padding: '6px 12px', fontSize: '12px', color: '#F87171', borderColor: 'rgba(248,113,113,0.3)' }}
                    >
                      Remove Custom Key
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenModal(k.provider)}
                    className="btn btn-primary"
                    style={{ padding: '6px 14px', fontSize: '12px' }}
                  >
                    {k.isConfigured ? '🔑 Update API Key' : '➕ Add API Key'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px'
          }}
        >
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', maxWidth: '480px', width: '100%' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px' }}>
              Add Encrypted API Key: {providerDetails[selectedProvider]?.name || selectedProvider}
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '12.5px', margin: '0 0 20px 0' }}>
              The key will be encrypted using AES-256 before storing in the database.
            </p>

            <form onSubmit={handleSaveKey} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  {selectedProvider} API Secret Key
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder={`e.g. ${selectedProvider.toLowerCase() === 'openai' ? 'sk-proj-...' : 'sk-...'}`}
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      padding: '10px 40px 10px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontFamily: 'JetBrains Mono, monospace'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    {showPassword ? '👁️' : '🙈'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  🔒 Encrypt & Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
