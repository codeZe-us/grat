import { useState, useCallback } from 'react';
import type { ActivityItem } from '../types';

export function useActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      id: '1',
      type: 'received',
      amount: '200.00',
      fromName: 'Bob',
      toName: 'Alice',
      hash: 'abc...def',
      timestamp: new Date(Date.now() - 3600000 * 2),
    },
    {
      id: '2',
      type: 'sent',
      amount: '50.00',
      fromName: 'Alice',
      toName: 'Bob',
      hash: 'ghi...jkl',
      timestamp: new Date(Date.now() - 3600000 * 5),
    }
  ]);

  const addActivity = useCallback((amount: string, fromName: string, toName: string, hash?: string, note?: string) => {
    const newItem: ActivityItem = {
      id: Math.random().toString(36).substring(7),
      type: 'sent', // The record is always a transfer from someone to someone
      amount,
      fromName,
      toName,
      note,
      hash,
      timestamp: new Date(),
    };
    setActivities((prev) => [newItem, ...prev]);
  }, []);

  return { activities, addActivity };
}
