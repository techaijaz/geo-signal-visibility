import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../utils/axios';

interface ReportItem {
  _id: string;
  date: string;
  meta: string;
  score: number;
}

interface OutletContextType {
  currentBrand: { _id?: string; name: string; role?: string };
  brands: Array<{ _id?: string; name: string; role?: string }>;
}

const Reports: React.FC = () => {
  const context = useOutletContext<OutletContextType>();
  const activeBrandId = context?.currentBrand?._id;

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchReportsData = async () => {
      if (!activeBrandId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await api.get(`/brands/${activeBrandId}/reports`);
        if (isMounted && res.data?.data) {
          setReports(res.data.data.reports || []);
          setSharedEmails(res.data.data.sharedEmails || []);
        }
      } catch (err) {
        console.error('Failed to fetch reports from backend', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchReportsData();

    return () => {
      isMounted = false;
    };
  }, [activeBrandId]);

  const handleGenerateReport = async () => {
    if (!activeBrandId || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await api.post(`/brands/${activeBrandId}/reports/generate`);
      if (res.data?.data?.report) {
        setReports((prev) => [res.data.data.report, ...prev]);
      }
    } catch (err) {
      console.error('Failed to generate report', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (id: string) => {
    if (!activeBrandId || downloadingId) return;
    setDownloadingId(id);
    try {
      const response = await api.get(`/brands/${activeBrandId}/reports/${id}/download`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const reportItem = reports.find((r) => r._id === id);
      const brandName = context?.currentBrand?.name || 'Brand';
      const cleanDate = (reportItem?.date || 'report').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `GEO_Report_${brandName.replace(/\s+/g, '_')}_${cleanDate}.pdf`;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report PDF', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleAddShareEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = shareEmail.trim();
    if (!trimmed || !activeBrandId || isSubmittingEmail) return;

    setIsSubmittingEmail(true);
    try {
      const res = await api.post(`/brands/${activeBrandId}/reports/share`, { email: trimmed });
      if (res.data?.data?.sharedEmails) {
        setSharedEmails(res.data.data.sharedEmails);
      }
      setShareEmail('');
    } catch (err) {
      console.error('Failed to add share email', err);
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleRemoveShareEmail = async (email: string) => {
    if (!activeBrandId) return;
    try {
      const encodedEmail = encodeURIComponent(email);
      const res = await api.delete(`/brands/${activeBrandId}/reports/share/${encodedEmail}`);
      if (res.data?.data?.sharedEmails) {
        setSharedEmails(res.data.data.sharedEmails);
      } else {
        setSharedEmails((prev) => prev.filter((e) => e !== email));
      }
    } catch (err) {
      console.error('Failed to remove share email', err);
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
        <span className="rescan-icon spinning" style={{ fontSize: '24px', display: 'inline-block', marginBottom: '10px' }}>
          ⚙
        </span>
        <p>Loading brand report history...</p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <h3>Generate a report</h3>
        <p className="sub">
          A shareable snapshot of your visibility score, mentions, and open recommendations for{' '}
          <strong>{context?.currentBrand?.name || 'your brand'}</strong>
        </p>
        <div className="onb-actions" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
          <span className="mono" style={{ color: 'var(--text-dim)', fontSize: '12.5px' }}>
            Auto-emailed every Monday, 9:00 AM
          </span>
          <button
            className="btn btn-primary"
            onClick={handleGenerateReport}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate report now'}
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Report history</h3>
        <p className="sub">Past scans, ready to download or share with your team</p>

        {reports.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '14px', padding: '12px 0' }}>
            No reports generated yet. Click "Generate report now" above to generate your first snapshot.
          </p>
        ) : (
          reports.map((report) => (
            <div key={report._id} className="report-row">
              <div className="r-left">
                <span className="r-date">{report.date}</span>
                <span className="r-meta">{report.meta}</span>
              </div>
              <span className="r-score">{report.score}</span>
              <button
                className="btn"
                onClick={() => handleDownload(report._id)}
                disabled={downloadingId === report._id}
              >
                {downloadingId === report._id ? 'Downloading...' : 'Download PDF'}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <h3>Sharing</h3>
        <p className="sub">Send this report to teammates or your agency contact</p>

        {sharedEmails.length > 0 && (
          <div className="chip-row">
            {sharedEmails.map((email) => (
              <span key={email} className="chip">
                {email}{' '}
                <button type="button" onClick={() => handleRemoveShareEmail(email)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <form onSubmit={handleAddShareEmail} className="add-row">
          <input
            type="email"
            placeholder="Add an email to share future reports with…"
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
          />
          <button type="submit" className="btn" disabled={isSubmittingEmail || !shareEmail.trim()}>
            {isSubmittingEmail ? 'Adding...' : 'Add'}
          </button>
        </form>
      </div>
    </>
  );
};

export default Reports;
