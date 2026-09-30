import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      '1 brand',
      '3 tracked queries',
      'Weekly scan',
      'ChatGPT, Gemini & Claude',
      '1 site audit re-run per day'
    ],
    buttonText: 'Downgrade',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '₹2,999',
    billingPeriod: ' /mo',
    description: 'For solo founders running a Shopify or D2C store.',
    features: [
      '1 brand',
      '15 tracked queries',
      'Daily scan',
      '1 manual re-scan per day',
      'ChatGPT, Gemini, Claude, Grok & DeepSeek',
      'AI recommendations',
      'Weekly email report with PDF'
    ],
    buttonText: 'Current plan',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹9,999',
    billingPeriod: ' /mo',
    description: 'For funded, growing Shopify & D2C brands.',
    features: [
      '3 brands',
      '30 tracked queries per brand',
      '3 scans a day',
      '3 manual re-scans per day',
      'ChatGPT, Gemini, Claude, Grok & DeepSeek',
      'AI recommendations',
      'Weekly email report with PDF',
      'Competitor share-of-voice'
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
      'Up to 25 brands, 100 queries each',
      'Scans twice a day',
      'All 6 AIs incl. Perplexity',
      'Priority support',
      'Dedicated onboarding'
    ],
    buttonText: 'Talk to sales',
  },
];

const Pricing: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [billingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const navigate = useNavigate();

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
    // Paid plans go through the real Razorpay / Stripe checkout on the Billing page
    if (planId !== 'free') {
      navigate('/billing');
      return;
    }

    setLoadingId(planId);
    setMessage(null);
    try {
      const res = await api.post('/subscription/checkout', { plan: planId, billingCycle });
      if (res.data?.data?.isFree) {
        setCurrentPlan('free');
        setMessage({ text: 'Switched to Free plan successfully!', type: 'success' });
        fetchSubscription();
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || 'Failed to change plan', type: 'error' });
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

    </div>
  );
};

export default Pricing;
