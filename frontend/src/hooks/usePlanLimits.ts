import { useState, useEffect } from 'react';
import api from '../utils/axios';

interface PlanLimits {
  maxQueries: number;
  maxBrands?: number;
  maxCompetitors?: number;
  allowedModels: string[];
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
  const [plan, setPlan] = useState<string>('starter');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLimits = async () => {
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
    };

    fetchLimits();
  }, []);

  return { limits, plan, loading };
};
