import { useState, useEffect } from 'react';
import api from '../../utils/axios';

interface AiModelRecord {
  _id: string;
  name: string;
  modelId: string;
  provider: string;
  description?: string;
  isActive: boolean;
  isDefault: boolean;
  inputCostPer1k: number;
  outputCostPer1k: number;
  maxTokens: number;
}

export default function AdminModels() {
  const [models, setModels] = useState<AiModelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AiModelRecord | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    modelId: '',
    provider: 'OpenAI',
    description: '',
    isActive: true,
    isDefault: false,
    inputCostPer1k: 0.0015,
    outputCostPer1k: 0.002,
    maxTokens: 4000
  });

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/ai-models');
      setModels(res.data.data.models || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Error fetching models' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (model: AiModelRecord) => {
    try {
      await api.patch(`/admin/ai-models/${model._id}`, { isActive: !model.isActive });
      setMessage({
        type: 'success',
        text: `Model ${model.name} set to ${!model.isActive ? 'Active' : 'Inactive'}`
      });
      fetchModels();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to toggle status' });
    }
  };

  const handleOpenAddModal = () => {
    setEditingModel(null);
    setFormData({
      name: '',
      modelId: '',
      provider: 'OpenAI',
      description: '',
      isActive: true,
      isDefault: false,
      inputCostPer1k: 0.0015,
      outputCostPer1k: 0.002,
      maxTokens: 4000
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (model: AiModelRecord) => {
    setEditingModel(model);
    setFormData({
      name: model.name,
      modelId: model.modelId,
      provider: model.provider || 'Other',
      description: model.description || '',
      isActive: model.isActive,
      isDefault: model.isDefault,
      inputCostPer1k: model.inputCostPer1k || 0.0015,
      outputCostPer1k: model.outputCostPer1k || 0.002,
      maxTokens: model.maxTokens || 4000
    });
    setIsModalOpen(true);
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingModel) {
        await api.patch(`/admin/ai-models/${editingModel._id}`, formData);
      } else {
        await api.post('/admin/ai-models', formData);
      }

      setMessage({
        type: 'success',
        text: editingModel ? `Updated model ${formData.name}` : `Added new model ${formData.name}`
      });
      setIsModalOpen(false);
      fetchModels();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to save model' });
    }
  };

  const handleDeleteModel = async (model: AiModelRecord) => {
    if (!window.confirm(`Are you sure you want to delete AI Model "${model.name}"?`)) return;
    try {
      await api.delete(`/admin/ai-models/${model._id}`);
      setMessage({ type: 'success', text: `Deleted model ${model.name}` });
      fetchModels();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to delete model' });
    }
  };

  const providerColors: Record<string, string> = {
    OpenAI: '#3FBF8F',
    DeepSeek: '#0066FF',
    Google: '#6C8EF5',
    Anthropic: '#D97757',
    Perplexity: '#FFC857',
    OmniRoute: '#A855F7',
    Other: '#94A3B8'
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 700 }}>AI Models Manager</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0 0', fontSize: '14px' }}>
            Configure and enable/disable LLM providers (OpenAI, DeepSeek, Gemini, Claude, Perplexity) used in AI visibility scans.
          </p>
        </div>
        <button onClick={handleOpenAddModal} className="btn btn-primary" style={{ fontSize: '13.5px' }}>
          + Add New AI Model
        </button>
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

      {/* Models Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
          Loading AI models...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {models.map((m) => (
            <div
              key={m._id}
              style={{
                background: 'var(--surface)',
                border: m.isActive ? '1px solid var(--line)' : '1px dashed var(--line-soft)',
                borderRadius: '12px',
                padding: '20px',
                opacity: m.isActive ? 1 : 0.65,
                position: 'relative'
              }}
            >
              {/* Header: Provider badge & Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: `${providerColors[m.provider] || '#888'}22`,
                    color: providerColors[m.provider] || 'var(--text)',
                    border: `1px solid ${providerColors[m.provider] || '#888'}44`
                  }}
                >
                  {m.provider}
                </span>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={m.isActive}
                    onChange={() => handleToggleActive(m)}
                  />
                  <span style={{ fontSize: '12px', color: m.isActive ? 'var(--good)' : 'var(--text-dim)' }}>
                    {m.isActive ? 'Active' : 'Disabled'}
                  </span>
                </label>
              </div>

              {/* Title & Slug */}
              <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', fontWeight: 600 }}>{m.name}</h3>
              <div className="mono" style={{ fontSize: '12px', color: 'var(--amber)', marginBottom: '10px' }}>
                {m.modelId}
              </div>

              {m.description && (
                <p style={{ fontSize: '12.5px', color: 'var(--text-dim)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                  {m.description}
                </p>
              )}

              {/* Pricing Rates */}
              <div 
                style={{ 
                  background: 'var(--ink-2)', 
                  borderRadius: '8px', 
                  padding: '10px 12px', 
                  fontSize: '11.5px', 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  border: '1px solid var(--line-soft)'
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Input: </span>
                  <span className="mono">${m.inputCostPer1k}/1k tokens</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Output: </span>
                  <span className="mono">${m.outputCostPer1k}/1k tokens</span>
                </div>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleOpenEditModal(m)}
                  className="btn"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  ✏️ Edit Details
                </button>
                <button
                  onClick={() => handleDeleteModel(m)}
                  className="btn"
                  style={{ padding: '6px 12px', fontSize: '12px', color: '#F87171', borderColor: 'rgba(248,113,113,0.3)' }}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
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
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
              {editingModel ? `Edit ${editingModel.name}` : 'Add New AI Model'}
            </h3>

            <form onSubmit={handleSubmitModal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Model Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DeepSeek v4 Pro"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Model ID / API Slug</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. deepseek-v4-pro or gpt-4o"
                  value={formData.modelId}
                  onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Provider</label>
                <select
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                >
                  <option value="OpenAI">OpenAI</option>
                  <option value="DeepSeek">DeepSeek</option>
                  <option value="Google">Google (Gemini)</option>
                  <option value="Anthropic">Anthropic (Claude)</option>
                  <option value="Perplexity">Perplexity</option>
                  <option value="OmniRoute">OmniRoute</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Description</label>
                <textarea
                  rows={2}
                  placeholder="Short description of capabilities..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Input Cost ($/1k tokens)</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={formData.inputCostPer1k}
                    onChange={(e) => setFormData({ ...formData, inputCostPer1k: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Output Cost ($/1k tokens)</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={formData.outputCostPer1k}
                    onChange={(e) => setFormData({ ...formData, outputCostPer1k: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  <span style={{ fontSize: '13px' }}>Active / Enabled</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingModel ? 'Save Changes' : 'Create AI Model'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
