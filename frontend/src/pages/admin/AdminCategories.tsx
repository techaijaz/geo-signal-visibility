import { useState, useEffect } from 'react';
import api from '../../utils/axios';

interface CategoryRecord {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    isActive: true
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/categories');
      setCategories(res.data.data.categories || res.data.data || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Error loading categories' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingCategory(null);
    setFormData({ name: '', slug: '', description: '', isActive: true });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: CategoryRecord) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      isActive: cat.isActive
    });
    setIsModalOpen(true);
  };

  const handleNameChange = (nameVal: string) => {
    const slugVal = nameVal
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    setFormData((prev) => ({
      ...prev,
      name: nameVal,
      slug: editingCategory ? prev.slug : slugVal
    }));
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await api.patch(`/admin/categories/${editingCategory._id}`, formData);
      } else {
        await api.post('/admin/categories', formData);
      }

      setMessage({
        type: 'success',
        text: editingCategory ? `Updated category "${formData.name}"` : `Added category "${formData.name}"`
      });
      setIsModalOpen(false);
      fetchCategories();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to save category' });
    }
  };

  const handleDeleteCategory = async (cat: CategoryRecord) => {
    if (!window.confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;
    try {
      await api.delete(`/admin/categories/${cat._id}`);
      setMessage({ type: 'success', text: `Deleted category "${cat.name}"` });
      fetchCategories();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to delete category' });
    }
  };

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 700 }}>Category Management</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0 0', fontSize: '14px' }}>
            Manage industry and product categories used for brand classification and category benchmark metrics ({categories.length} total categories).
          </p>
        </div>
        <button onClick={handleOpenAddModal} className="btn btn-primary" style={{ fontSize: '13.5px' }}>
          + Add New Category
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

      {/* Search Input */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Filter categories by name or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '400px',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            color: 'var(--text)',
            padding: '9px 14px',
            borderRadius: '8px',
            fontSize: '13px'
          }}
        />
      </div>

      {/* Categories Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading categories...
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--ink-2)', borderBottom: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                <th style={{ padding: '12px 16px' }}>Category Name</th>
                <th style={{ padding: '12px 16px' }}>Slug</th>
                <th style={{ padding: '12px 16px' }}>Description</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.length > 0 ? (
                filteredCategories.map((cat) => (
                  <tr key={cat._id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600 }}>{cat.name}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className="mono" style={{ fontSize: '12px', color: 'var(--amber)' }}>
                        {cat.slug}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-dim)', maxWidth: '300px' }}>
                      {cat.description || '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: cat.isActive ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)',
                          color: cat.isActive ? 'var(--good)' : 'var(--text-dim)',
                          border: '1px solid var(--line)'
                        }}
                      >
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleOpenEditModal(cat)}
                          className="btn"
                          style={{ padding: '5px 10px', fontSize: '11.5px' }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          className="btn"
                          style={{ padding: '5px 10px', fontSize: '11.5px', color: '#F87171', borderColor: 'rgba(248,113,113,0.3)' }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    No categories found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

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
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', maxWidth: '460px', width: '100%' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
              {editingCategory ? `Edit ${editingCategory.name}` : 'Add New Category'}
            </h3>

            <form onSubmit={handleSubmitModal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SaaS & Software"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Slug</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. saas-software"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Description</label>
                <textarea
                  rows={2}
                  placeholder="Description of brands under this category..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <span style={{ fontSize: '13px' }}>Active / Published</span>
              </label>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
