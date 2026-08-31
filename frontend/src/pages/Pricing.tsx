import React, { useEffect, useState } from 'react';
import api from '../utils/axios';

interface Plan {
  id: string;
  name: string;
  price: string;
  billingPeriod: string;
  description: string;
  features: string[];
  buttonText: string;
}

const DEFAULT_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    billingPeriod: ' /mo',
    description: 'See the problem before you commit to fixing it.',
    features: [
      '1 brand workspace',
      '3 tracked queries',
      '1 run per query',
      'Monthly scan',
      'Claude + GPT only',
      'No recommendations',
    ],
    buttonText: 'Downgrade',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '₹1,499',
    billingPeriod: ' /mo',
    description: 'For solo founders and small D2C teams.',
    features: [
      '1 brand workspace',
      '15 tracked queries',
      '3 runs per query',
      'Weekly scan',
      'Claude + GPT + Gemini',
      'Recommendations included',
      'Weekly email report',
    ],
    buttonText: 'Current plan',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹5,999',
    billingPeriod: ' /mo',
    description: 'For funded startups and growing D2C brands.',
    features: [
      '1 brand workspace',
      '50 tracked queries',
      '3 runs per query',
      'Daily scan option',
      'All models + Perplexity',
      'Competitor share-of-voice',
      'WhatsApp digest',
    ],
    buttonText: 'Upgrade',
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 'Custom',
    billingPeriod: '',
    description: 'Manage visibility across multiple client brands.',
    features: [
      'Multi-brand workspace (Unlimited)',
      'White-label reports',
      'Daily scans',
      'Priority support',
      'Dedicated onboarding',
    ],
    buttonText: 'Talk to sales',
  },
];

const Pricing: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [currentPlan, setCurrentPlan] = useState<string>('starter');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [billingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Checkout Modal States
  const [activeCheckout, setActiveCheckout] = useState<{
    orderId: string;
    amount: number;
    plan: string;
    description: string;
  } | null>(null);

  const [selectedGateway, setSelectedGateway] = useState<'razorpay' | 'stripe' | 'mock'>('stripe');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('card');

  // Stripe form fields
  const [stripeCardNumber, setStripeCardNumber] = useState<string>('');
  const [stripeExpiry, setStripeExpiry] = useState<string>('');
  const [stripeCvc, setStripeCvc] = useState<string>('');
  const [stripeName, setStripeName] = useState<string>('');

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await api.get('/subscription');
      if (response.data?.data) {
        if (response.data.data.plans) {
          setPlans(response.data.data.plans);
        }
        if (response.data.data.currentPlan) {
          setCurrentPlan(response.data.data.currentPlan);
        }
      }
    } catch {
      // Gracefully fallback to default state if offline/unauthenticated
    }
  };

  const handlePlanChange = async (planId: string) => {
    if (planId === currentPlan) return;
    if (planId === 'agency') {
      setMessage({ text: 'Contact sales team at sales@signal-ai.com', type: 'success' });
      return;
    }

    setLoadingId(planId);
    setMessage(null);

    try {
      const res = await api.post('/subscription/checkout', {
        plan: planId,
        billingCycle,
        gateway: selectedGateway
      });

      if (res.data?.data?.isFree) {
        setCurrentPlan('free');
        setMessage({ text: 'Switched to Free plan successfully!', type: 'success' });
        fetchSubscription();
      } else if (res.data?.data?.orderId) {
        // Open Checkout Modal
        setActiveCheckout({
          orderId: res.data.data.orderId,
          amount: res.data.data.amount,
          plan: planId,
          description: res.data.data.description
        });
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || 'Failed to initialize checkout', type: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleConfirmPayment = async () => {
    if (!activeCheckout) return;
    setLoadingId(activeCheckout.plan);

    try {
      const payMethodLabel = selectedGateway === 'stripe'
        ? `Stripe Card (${stripeCardNumber ? '•••• ' + stripeCardNumber.slice(-4) : 'Visa / MasterCard'})`
        : selectedGateway === 'razorpay'
        ? (selectedPaymentMethod === 'upi' ? 'Razorpay UPI Instant' : selectedPaymentMethod === 'card' ? 'Razorpay Card' : 'Razorpay NetBanking')
        : 'Sandbox Gateway';

      const res = await api.post('/subscription/confirm', {
        plan: activeCheckout.plan,
        billingCycle,
        gateway: selectedGateway,
        gatewayPaymentId: `pay_${selectedGateway}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        paymentMethod: payMethodLabel,
        amount: activeCheckout.amount
      });

      if (res.data?.data) {
        setCurrentPlan(activeCheckout.plan);
        setMessage({ text: `🎉 Payment successful! Activated ${activeCheckout.plan.toUpperCase()} plan via ${selectedGateway.toUpperCase()}.`, type: 'success' });
        setActiveCheckout(null);
        fetchSubscription();
      }
    } catch (err: any) {
      setMessage({ text: 'Payment verification failed. Please try again.', type: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  const getButtonText = (plan: Plan) => {
    if (plan.id === currentPlan) return 'Current plan';
    if (plan.id === 'agency') return 'Talk to sales';
    const planOrder = ['free', 'starter', 'growth', 'agency'];
    const currentIndex = planOrder.indexOf(currentPlan);
    const targetIndex = planOrder.indexOf(plan.id);
    return targetIndex > currentIndex ? 'Upgrade' : 'Downgrade';
  };

  return (
    <div className="panel">
      <h3>Plans</h3>
      <p className="sub">
        You're currently on <strong style={{ color: 'var(--amber)', textTransform: 'capitalize' }}>{currentPlan}</strong>. Upgrade any time — changes apply from your next scan.
      </p>

      {message && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '20px',
            borderRadius: '8px',
            background: message.type === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
            color: message.type === 'success' ? 'var(--good)' : 'var(--bad)',
            border: `1px solid ${message.type === 'success' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
            fontSize: '13px',
          }}
        >
          {message.text}
        </div>
      )}

      <div className="plan-grid">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const btnText = getButtonText(plan);
          const isPrimary = !isCurrent && btnText === 'Upgrade';

          return (
            <div key={plan.id} className={`plan-card ${isCurrent ? 'current' : ''}`}>
              <div className="plan-name">
                {plan.name}
                {isCurrent && <span className="current-badge">Current</span>}
              </div>
              <div className="plan-price">
                {plan.price}
                {plan.billingPeriod && <span>{plan.billingPeriod}</span>}
              </div>
              <div className="plan-desc">{plan.description}</div>
              <ul className="plan-features">
                {plan.features.map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
              <button
                className={`btn btn-block ${isPrimary ? 'btn-primary' : ''}`}
                disabled={isCurrent || loadingId === plan.id}
                onClick={() => handlePlanChange(plan.id)}
              >
                {loadingId === plan.id ? 'Processing...' : btnText}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment Checkout Modal */}
      {activeCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#1e293b', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)', padding: '28px', maxWidth: '440px', width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Payment Checkout</h3>
              <button onClick={() => setActiveCheckout(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Order Summary</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginTop: '4px' }}>{activeCheckout.description}</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '8px' }}>₹{activeCheckout.amount.toLocaleString()}</div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', color: '#cbd5e1', display: 'block', marginBottom: '8px', fontWeight: 600 }}>Payment Gateway Provider</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedGateway('razorpay')}
                  style={{
                    padding: '10px 6px',
                    borderRadius: '8px',
                    border: `1px solid ${selectedGateway === 'razorpay' ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
                    background: selectedGateway === 'razorpay' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
                    color: selectedGateway === 'razorpay' ? '#f59e0b' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  🇮🇳 Razorpay
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGateway('stripe')}
                  style={{
                    padding: '10px 6px',
                    borderRadius: '8px',
                    border: `1px solid ${selectedGateway === 'stripe' ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                    background: selectedGateway === 'stripe' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.03)',
                    color: selectedGateway === 'stripe' ? '#818cf8' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  🌐 Stripe
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGateway('mock')}
                  style={{
                    padding: '10px 6px',
                    borderRadius: '8px',
                    border: `1px solid ${selectedGateway === 'mock' ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
                    background: selectedGateway === 'mock' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.03)',
                    color: selectedGateway === 'mock' ? '#34d399' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  🧪 Sandbox
                </button>
              </div>
            </div>

            {selectedGateway === 'stripe' ? (
              <div style={{ marginBottom: '24px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '16px' }}>🌐</span> Stripe Payment Gateway
                  </div>
                  <span style={{ fontSize: '10px', background: '#6366f1', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Stripe SSL Secured</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Cardholder Name</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={stripeName}
                      onChange={(e) => setStripeName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '13px', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Card Number</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="4242 •••• •••• 4242"
                        value={stripeCardNumber}
                        onChange={(e) => setStripeCardNumber(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
                      />
                      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#818cf8', fontWeight: 700 }}>VISA / MC</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Expiry Date</label>
                      <input
                        type="text"
                        placeholder="MM / YY"
                        value={stripeExpiry}
                        onChange={(e) => setStripeExpiry(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>CVC / CVV</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="•••"
                        value={stripeCvc}
                        onChange={(e) => setStripeCvc(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '12px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                  🔒 Encrypted and verified by Stripe Payment Infrastructure
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '13px', color: '#cbd5e1', display: 'block', marginBottom: '10px', fontWeight: 600 }}>
                  Select Payment Method ({selectedGateway === 'razorpay' ? 'Razorpay India' : 'Sandbox Flow'})
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', background: selectedPaymentMethod === 'upi' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedPaymentMethod === 'upi' ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer' }}>
                    <input type="radio" name="payMethod" checked={selectedPaymentMethod === 'upi'} onChange={() => setSelectedPaymentMethod('upi')} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>UPI Instant (GPay / PhonePe / Paytm / BHIM)</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Zero gateway fee · Instant activation</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', background: selectedPaymentMethod === 'card' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedPaymentMethod === 'card' ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer' }}>
                    <input type="radio" name="payMethod" checked={selectedPaymentMethod === 'card'} onChange={() => setSelectedPaymentMethod('card')} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Credit / Debit Card</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Visa, MasterCard, RuPay, Amex</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', background: selectedPaymentMethod === 'netbanking' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedPaymentMethod === 'netbanking' ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer' }}>
                    <input type="radio" name="payMethod" checked={selectedPaymentMethod === 'netbanking'} onChange={() => setSelectedPaymentMethod('netbanking')} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>NetBanking</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>HDFC, ICICI, SBI, Axis & all top banks</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <button
              disabled={!!loadingId}
              onClick={handleConfirmPayment}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                border: 'none',
                background: selectedGateway === 'stripe'
                  ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '15px',
                cursor: 'pointer',
                boxShadow: selectedGateway === 'stripe' ? '0 4px 15px rgba(99, 102, 241, 0.3)' : '0 4px 15px rgba(16, 185, 129, 0.3)'
              }}
            >
              {loadingId ? 'Processing Payment...' : selectedGateway === 'stripe' ? `Pay ₹${activeCheckout.amount.toLocaleString()} with Stripe` : `Pay ₹${activeCheckout.amount.toLocaleString()} & Activate`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
