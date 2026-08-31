import { useState, useEffect, useRef } from 'react';
import api from '../utils/axios';
import { useAuth } from '../context/AuthContext';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface Plan {
  id: string;
  name: string;
  price: string;
  annualPrice: string;
  billingPeriod: string;
  description: string;
  features: string[];
  buttonText: string;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paidAt: string;
  createdAt: string;
  items: Array<{ description: string; amount: number }>;
}

const DEFAULT_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    annualPrice: '₹0',
    billingPeriod: ' /mo',
    description: 'See the problem before you commit to fixing it.',
    features: [
      '1 brand workspace',
      '3 tracked queries',
      '1 run per query',
      'Monthly scan frequency',
      'Claude + GPT models',
      'Basic report exports'
    ],
    buttonText: 'Downgrade'
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '₹1,499',
    annualPrice: '₹1,199',
    billingPeriod: ' /mo',
    description: 'For solo founders and small D2C teams.',
    features: [
      '1 brand workspace',
      '15 tracked queries',
      '3 runs per query',
      'Weekly scan frequency',
      'Claude + GPT + Gemini',
      'AI Recommendations included',
      'Weekly email digests'
    ],
    buttonText: 'Current Plan'
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹5,999',
    annualPrice: '₹4,799',
    billingPeriod: ' /mo',
    description: 'For funded startups and growing brands.',
    features: [
      '1 brand workspace',
      '50 tracked queries',
      '3 runs per query',
      'Daily scan option',
      'All models + Perplexity',
      'Competitor share-of-voice',
      'WhatsApp digest & priority'
    ],
    buttonText: 'Upgrade'
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 'Custom',
    annualPrice: 'Custom',
    billingPeriod: '',
    description: 'Manage visibility across multiple client brands.',
    features: [
      'Multi-brand workspace (Unlimited)',
      'White-label reports',
      'Daily scans',
      'Priority SLA support',
      'Dedicated manager'
    ],
    buttonText: 'Talk to Sales'
  }
];

// ─── Stripe inner form component ────────────────────────────────────────────
interface StripeFormProps {
  clientSecret: string;
  plan: string;
  amount: number;
  billingCycle: 'monthly' | 'yearly';
  onSuccess: (plan: string) => void;
  onError: (msg: string) => void;
}

function StripeCheckoutForm({ clientSecret, plan, amount, billingCycle, onSuccess, onError }: StripeFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [stripeName, setStripeName] = useState('');

  const handleStripeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) { setProcessing(false); return; }

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: { name: stripeName || 'Subscriber' }
      }
    });

    if (error) {
      onError(error.message || 'Stripe payment failed');
      setProcessing(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      try {
        await api.post('/subscription/confirm', {
          plan,
          billingCycle,
          gateway: 'stripe',
          paymentIntentId: paymentIntent.id,
          amount
        });
        onSuccess(plan);
      } catch {
        onError('Payment verified by Stripe but subscription update failed. Contact support.');
      }
    }
    setProcessing(false);
  };

  return (
    <form onSubmit={handleStripeSubmit}>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Cardholder Name</label>
        <input
          type="text"
          placeholder="e.g. John Doe"
          value={stripeName}
          onChange={(e) => setStripeName(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Card Details</label>
        <div style={{ padding: '12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)' }}>
          <CardElement options={{
            style: {
              base: { color: '#fff', fontSize: '14px', fontFamily: 'monospace', '::placeholder': { color: '#64748b' } },
              invalid: { color: '#f87171' }
            }
          }} />
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginBottom: '16px' }}>
        🔒 Card details are encrypted and processed directly by Stripe — we never see your card number.
      </div>
      <button
        type="submit"
        disabled={!stripe || processing}
        style={{
          width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
          opacity: processing ? 0.7 : 1
        }}
      >
        {processing ? 'Processing...' : `Pay ₹${amount.toLocaleString()} with Stripe`}
      </button>
    </form>
  );
}

// ─── Main Billing Component ──────────────────────────────────────────────────
export default function Billing() {
  const { user } = useAuth();
  const { limits, plan: currentPlanFromHook } = usePlanLimits();
  const [currentPlan, setCurrentPlan] = useState<string>(currentPlanFromHook || 'starter');
  const [plans] = useState<Plan[]>(DEFAULT_PLANS);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Gateway selection (shown before clicking Upgrade)
  const [selectedGateway] = useState<'razorpay' | 'stripe' | 'mock'>('razorpay');

  // Active checkout session returned by backend
  const [activeCheckout, setActiveCheckout] = useState<{
    orderId: string;
    amount: number;
    plan: string;
    description: string;
    clientSecret?: string;   // Stripe only
    keyId?: string;          // Razorpay only
    gateway: 'razorpay' | 'stripe' | 'mock';
  } | null>(null);

  // Stripe promise (initialized once)
  const stripePromise = useRef(
    loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')
  );

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/subscription');
      if (response.data?.data) {
        if (response.data.data.currentPlan) setCurrentPlan(response.data.data.currentPlan);
        if (response.data.data.invoices) setInvoices(response.data.data.invoices);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (targetPlanId: string) => {
    if (targetPlanId === currentPlan) return;
    if (targetPlanId === 'agency') {
      setMessage({ text: 'Our Enterprise team will contact you shortly at ' + (user?.email || 'your email'), type: 'success' });
      return;
    }

    setProcessingPlan(targetPlanId);
    setMessage(null);

    try {
      const res = await api.post('/subscription/checkout', {
        plan: targetPlanId,
        billingCycle,
        gateway: selectedGateway
      });

      const data = res.data?.data;
      if (!data) throw new Error('No response from server');

      if (data.isFree) {
        setCurrentPlan('free');
        setMessage({ text: 'Switched to Free plan successfully!', type: 'success' });
        fetchBillingData();
        return;
      }

      // ── Store checkout session, then trigger gateway ──────────────────────
      const session = {
        orderId: data.orderId,
        amount: data.amount,
        plan: targetPlanId,
        description: data.description,
        clientSecret: data.clientSecret,
        keyId: data.keyId,
        gateway: data.gateway as 'razorpay' | 'stripe' | 'mock'
      };

      if (data.gateway === 'razorpay') {
        // ── Launch Razorpay native popup ────────────────────────────────────
        await openRazorpayPopup(session);
      } else if (data.gateway === 'stripe') {
        // ── Show Stripe Elements modal ──────────────────────────────────────
        setActiveCheckout(session);
      } else {
        // ── Mock: show confirm modal ────────────────────────────────────────
        setActiveCheckout(session);
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || err.message || 'Failed to initialize payment', type: 'error' });
    } finally {
      setProcessingPlan(null);
    }
  };

  // ── Razorpay: load script dynamically and open native popup ───────────────
  const openRazorpayPopup = (session: {
    orderId: string; amount: number; plan: string;
    description: string; keyId?: string; gateway: string;
  }) => {
    return new Promise<void>((resolve, reject) => {
      const loadScript = () => {
        return new Promise<boolean>((res) => {
          if (document.getElementById('razorpay-checkout-js')) { res(true); return; }
          const script = document.createElement('script');
          script.id = 'razorpay-checkout-js';
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => res(true);
          script.onerror = () => res(false);
          document.body.appendChild(script);
        });
      };

      loadScript().then((loaded) => {
        if (!loaded) {
          setMessage({ text: 'Failed to load Razorpay. Check your internet connection.', type: 'error' });
          reject(); return;
        }

        const rzp = new (window as any).Razorpay({
          key: session.keyId,
          order_id: session.orderId,
          amount: session.amount * 100, // paise
          currency: 'INR',
          name: 'GEO Platform',
          description: session.description,
          image: 'https://avatars.githubusercontent.com/u/1',
          theme: { color: '#f59e0b' },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            // Payment successful — verify on backend
            try {
              await api.post('/subscription/confirm', {
                plan: session.plan,
                billingCycle,
                gateway: 'razorpay',
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amount: session.amount
              });
              setCurrentPlan(session.plan);
              setMessage({ text: `🎉 Payment successful! ${session.plan.toUpperCase()} plan activated via Razorpay.`, type: 'success' });
              fetchBillingData();
              resolve();
            } catch {
              setMessage({ text: 'Razorpay payment received but verification failed. Contact support.', type: 'error' });
              reject();
            }
          },
          modal: {
            ondismiss: () => { resolve(); }
          }
        });
        rzp.open();
      });
    });
  };

  // ── Mock: confirm without real gateway ───────────────────────────────────
  const handleMockConfirm = async () => {
    if (!activeCheckout) return;
    setProcessingPlan(activeCheckout.plan);
    try {
      await api.post('/subscription/confirm', {
        plan: activeCheckout.plan,
        billingCycle,
        gateway: 'mock',
        paymentIntentId: `mock_${Date.now()}`,
        amount: activeCheckout.amount
      });
      setCurrentPlan(activeCheckout.plan);
      setMessage({ text: `✅ Sandbox payment confirmed! ${activeCheckout.plan.toUpperCase()} plan activated.`, type: 'success' });
      setActiveCheckout(null);
      fetchBillingData();
    } catch (err: any) {
      setMessage({ text: 'Mock payment failed. Please try again.', type: 'error' });
    } finally {
      setProcessingPlan(null);
    }
  };

  const getButtonText = (plan: Plan) => {
    if (plan.id === currentPlan) return 'Current Plan';
    if (plan.id === 'agency') return 'Talk to Sales';
    const planOrder = ['free', 'starter', 'growth', 'agency'];
    const currentIndex = planOrder.indexOf(currentPlan);
    const targetIndex = planOrder.indexOf(plan.id);
    return targetIndex > currentIndex ? 'Upgrade Plan' : 'Downgrade';
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
        Loading billing & subscription info...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto', color: 'var(--fg, #e2e8f0)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Billing & Subscriptions
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--sub, #94a3b8)', fontSize: '14px' }}>
            Manage your workspace subscription plan, view limits, and download payment receipts.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: '13px', color: 'var(--sub, #94a3b8)' }}>Billing Period:</span>
          <button
            onClick={() => setBillingCycle('monthly')}
            style={{
              padding: '6px 12px',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              background: billingCycle === 'monthly' ? 'var(--amber, #f59e0b)' : 'transparent',
              color: billingCycle === 'monthly' ? '#000' : 'var(--fg, #cbd5e1)',
              transition: 'all 0.2s ease'
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            style={{
              padding: '6px 12px',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              background: billingCycle === 'yearly' ? 'var(--amber, #f59e0b)' : 'transparent',
              color: billingCycle === 'yearly' ? '#000' : 'var(--fg, #cbd5e1)',
              transition: 'all 0.2s ease'
            }}
          >
            Yearly <span style={{ fontSize: '10px', background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '8px', marginLeft: '4px' }}>Save 20%</span>
          </button>
        </div>
      </div>

      {/* Alert Notification */}
      {message && (
        <div
          style={{
            padding: '14px 18px',
            marginBottom: '24px',
            borderRadius: '10px',
            background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            color: message.type === 'success' ? '#34d399' : '#f87171',
            fontSize: '14px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <span>{message.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Usage & Overview Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          marginBottom: '32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '24px'
        }}
      >
        <div>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sub, #94a3b8)', marginBottom: '4px' }}>
            Active Subscription
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {currentPlan} Plan
            <span
              style={{
                fontSize: '11px',
                padding: '3px 10px',
                borderRadius: '12px',
                background: currentPlan === 'free' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: currentPlan === 'free' ? '#94a3b8' : '#f59e0b',
                border: `1px solid ${currentPlan === 'free' ? 'rgba(148, 163, 184, 0.3)' : 'rgba(245, 158, 11, 0.4)'}`
              }}
            >
              Active
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            Renews automatically every month. Next cycle starts in 30 days.
          </div>
        </div>

        <div>
          <div style={{ fontSize: '12px', color: 'var(--sub, #94a3b8)', marginBottom: '6px' }}>
            Tracked Queries Limit ({limits?.maxQueries ?? 15} Max)
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: '40%', height: '100%', background: 'linear-gradient(90deg, #6366f1, #a855f7)', borderRadius: '4px' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
            <span>6 / {limits?.maxQueries ?? 15} Queries used</span>
            <span>{limits?.maxQueries ? Math.round((6 / limits.maxQueries) * 100) : 40}%</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '12px', color: 'var(--sub, #94a3b8)', marginBottom: '6px' }}>
            Supported Models
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}>GPT-4o</span>
            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.3)' }}>Claude 3.5</span>
            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>Gemini 2.0</span>
          </div>
        </div>
      </div>

      {/* Plans Pricing Grid */}
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Available Workspace Plans</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        {plans.map((p) => {
          const isCurrent = p.id === currentPlan;
          const displayPrice = billingCycle === 'yearly' ? p.annualPrice : p.price;
          const btnText = getButtonText(p);
          const isPrimary = !isCurrent && btnText.includes('Upgrade');

          return (
            <div
              key={p.id}
              style={{
                background: isCurrent ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)' : 'rgba(30, 41, 59, 0.5)',
                borderRadius: '16px',
                padding: '24px',
                border: isCurrent ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                boxShadow: isCurrent ? '0 8px 30px rgba(245, 158, 11, 0.15)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                transition: 'all 0.25s ease'
              }}
            >
              {isCurrent && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-12px',
                    right: '20px',
                    background: '#f59e0b',
                    color: '#000',
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '2px 10px',
                    borderRadius: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                >
                  Current Plan
                </div>
              )}

              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{p.name}</div>
                <div style={{ fontSize: '13px', color: '#94a3b8', minHeight: '36px', marginBottom: '16px' }}>{p.description}</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>
                  {displayPrice}
                  <span style={{ fontSize: '13px', fontWeight: 400, color: '#94a3b8' }}>{p.billingPeriod}</span>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginBottom: '24px' }}>
                  {p.features.map((feat, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1', marginBottom: '10px' }}>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                disabled={isCurrent || processingPlan === p.id}
                onClick={() => handleSelectPlan(p.id)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: isCurrent ? 'default' : 'pointer',
                  background: isCurrent
                    ? 'rgba(255,255,255,0.05)'
                    : isPrimary
                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                    : 'rgba(255,255,255,0.1)',
                  color: isCurrent ? '#64748b' : isPrimary ? '#000' : '#fff',
                  transition: 'all 0.2s ease',
                  opacity: processingPlan === p.id ? 0.7 : 1
                }}
              >
                {processingPlan === p.id ? 'Processing...' : btnText}
              </button>
            </div>
          );
        })}
      </div>

      {/* Invoices Table */}
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Billing & Invoice History</h3>
      <div style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 20px' }}>Invoice #</th>
              <th style={{ padding: '14px 20px' }}>Date</th>
              <th style={{ padding: '14px 20px' }}>Plan / Description</th>
              <th style={{ padding: '14px 20px' }}>Payment Method</th>
              <th style={{ padding: '14px 20px' }}>Amount</th>
              <th style={{ padding: '14px 20px' }}>Status</th>
              <th style={{ padding: '14px 20px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                  No past invoices found.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s ease' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 600, color: '#818cf8' }}>{inv.invoiceNumber}</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>{new Date(inv.paidAt || inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td style={{ padding: '14px 20px', color: '#fff', textTransform: 'capitalize' }}>{inv.plan} Subscription</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>{inv.paymentMethod}</td>
                  <td style={{ padding: '14px 20px', fontWeight: 700, color: '#fff' }}>₹{inv.amount.toLocaleString()}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                      Paid
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#818cf8',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      View Receipt
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Checkout Modal — only shown for Stripe or Mock (Razorpay uses its own popup) */}
      {activeCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#1e293b', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)', padding: '28px', maxWidth: '440px', width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>
                {activeCheckout.gateway === 'stripe' ? '🌐 Stripe Checkout' : '🧪 Sandbox Checkout'}
              </h3>
              <button onClick={() => setActiveCheckout(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Order Summary</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginTop: '4px' }}>{activeCheckout.description}</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '8px' }}>₹{activeCheckout.amount.toLocaleString()}</div>
            </div>

            {activeCheckout.gateway === 'stripe' && activeCheckout.clientSecret ? (
              <Elements stripe={stripePromise.current} options={{ clientSecret: activeCheckout.clientSecret, appearance: { theme: 'night' } }}>
                <StripeCheckoutForm
                  clientSecret={activeCheckout.clientSecret}
                  plan={activeCheckout.plan}
                  amount={activeCheckout.amount}
                  billingCycle={billingCycle}
                  onSuccess={(plan) => {
                    setCurrentPlan(plan);
                    setMessage({ text: `🎉 Payment successful! ${plan.toUpperCase()} plan activated via Stripe.`, type: 'success' });
                    setActiveCheckout(null);
                    fetchBillingData();
                  }}
                  onError={(msg) => setMessage({ text: msg, type: 'error' })}
                />
              </Elements>
            ) : (
              <div>
                <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(16,185,129,0.2)', marginBottom: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🧪</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#34d399' }}>Sandbox / Test Mode</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>No real payment will be charged. For testing only.</div>
                </div>
                <button
                  disabled={!!processingPlan}
                  onClick={handleMockConfirm}
                  style={{
                    width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                    opacity: processingPlan ? 0.7 : 1
                  }}
                >
                  {processingPlan ? 'Processing...' : `✅ Confirm Test Payment — ₹${activeCheckout.amount.toLocaleString()}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}



      {/* Invoice Receipt Modal */}
      {selectedInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', color: '#0f172a', borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#4f46e5', fontWeight: 800 }}>GEO Platform</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>Generative Engine Optimization System</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '16px', fontWeight: 700 }}>TAX INVOICE</span>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{selectedInvoice.invoiceNumber}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px', marginBottom: '20px' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Billed To:</div>
                <div style={{ fontWeight: 600 }}>{user?.name || 'Customer'}</div>
                <div style={{ color: '#475569' }}>{user?.email}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Payment Date:</div>
                <div style={{ fontWeight: 600 }}>{new Date(selectedInvoice.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                <div style={{ color: '#16a34a', fontWeight: 600 }}>Status: PAID</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '8px 12px' }}>Item Description</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoice.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>{item.description}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>₹{item.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #e2e8f0', paddingTop: '16px', marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Payment via {selectedInvoice.paymentMethod}</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Total Paid: ₹{selectedInvoice.amount.toLocaleString()}</div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => window.print()} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Print / Save PDF</button>
              <button onClick={() => setSelectedInvoice(null)} style={{ padding: '10px 20px', borderRadius: '8px', background: '#e2e8f0', color: '#334155', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
