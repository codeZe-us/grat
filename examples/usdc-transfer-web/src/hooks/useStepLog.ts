import { useState, useCallback } from 'react';
import type { LogStep, StepStatus } from '../types';

export function useStepLog() {
  const [steps, setSteps] = useState<LogStep[]>([]);

  const addStep = useCallback((message: string, initialStatus: StepStatus = 'loading') => {
    const id = Math.random().toString(36).substring(7);
    const newStep: LogStep = {
      id,
      message,
      status: initialStatus,
      timestamp: new Date(),
    };
    setSteps((prev) => [...prev, newStep]);
    return id;
  }, []);

  const updateStep = useCallback((id: string, updates: Partial<LogStep>) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, ...updates } : step))
    );
  }, []);

  const clearLogs = useCallback(() => {
    setSteps([]);
  }, []);

  return { steps, addStep, updateStep, clearLogs };
}
