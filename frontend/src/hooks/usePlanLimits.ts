import { useState, useEffect, useCallback } from 'react';
import api from '../utils/axios';

interface PlanLimits {
  maxQueries: number;
  maxBrands?: number;
  maxCompetitors?: number;
  maxProducts?: number;
  allowedModels: string[];
  allowedProviders: string[];
  allowedLanguages: string[];
  features: {
    multiBrand?: boolean;
    recommendations: boolean;
    whatsapp: boolean;
    competitorAnalysis: boolean;
    whiteLabel?: boolean;
    multiTeam?: boolean;
  };
}

export const usePlanLimits = () => {
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [plan, setPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);

  // Billing calls refresh after a payment, so the new plan's limits show without a reload
  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/subscription/limits');
      if (res.data?.data) {
        setLimits(res.data.data.limits);
        setPlan(res.data.data.plan);
      }
    } catch (err) {
      console.error('Failed to fetch plan limits', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { limits, plan, loading, refresh };
};
