import { useState } from 'react';
import api from '../utils/axios';
import { timeAgo } from '../utils/timeAgo';
import { copyTextFor, taskKey, type DeveloperTask, type GuideContext } from '../utils/fixGuide';

interface Props {
  brandId: string;
  task: DeveloperTask;
  kind?: string | null;
  ctx: GuideContext;
  what: string; // the task text shown in Copy text
  code?: string;
  compact?: boolean;
  onEmailSaved?: (email: string) => void;
}

export default function FixGuide({ brandId, task, kind, ctx, what, code, compact, onEmailSaved }: Props) {
  const guide = ctx.guides[kind || ''] ?? ctx.guides.other;
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const last = ctx.lastSent?.[taskKey(task)];
  if (!guide) return null;

  const send = async (withEmail?: string) => {
    if (!withEmail && !ctx.developerEmail) { setAsking(true); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await api.post(`/brands/${brandId}/send-to-developer`, { task, ...(withEmail ? { developerEmail: withEmail } : {}) });
      const to = res.data?.data?.sentTo as string;
      setMsg({ ok: true, text: `Sent to ${to}` });
      setAsking(false);
      if (withEmail) onEmailSaved?.(to);
    } catch (err: any) {
      setMsg({ ok: false, text: err.response?.data?.message || "Couldn't send. Use Copy text instead." });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyTextFor(what, guide, ctx.isShopify, code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg({ ok: false, text: 'Copy is blocked in this browser. Select the steps and copy them.' });
      setOpen(true);
    }
  };

  const steps = ctx.isShopify ? guide.steps.shopify : guide.steps.other;
  return (
    <div className={`fix-guide${compact ? ' compact' : ''}`}>
      <div className="fix-guide-row">
        <span className={`fix-guide-who ${guide.who}`}>{guide.who === 'you' ? 'You can do this' : 'Needs a developer'}</span>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide steps' : 'How to do it'}
        </button>
        <button type="button" className="btn" onClick={() => send()} disabled={busy}>
          {busy ? 'Sending…' : 'Send to developer'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy text'}</button>
      </div>
      {open && (
        <ol className="fix-guide-steps">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
      {asking && (
        <div className="fix-guide-row">
          <input type="email" placeholder="Your developer's email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Your developer's email" />
          <button type="button" className="btn btn-primary" disabled={busy || !email.trim()} onClick={() => send(email.trim())}>Save and send</button>
          <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)}>Cancel</button>
        </div>
      )}
      {msg ? (
        <div className="fix-guide-msg" style={{ color: msg.ok ? 'var(--good)' : '#ef4444' }}>{msg.text}</div>
      ) : last ? (
        <div className="fix-guide-msg">Sent to {last.to} · {timeAgo(last.at)}</div>
      ) : null}
    </div>
  );
}
