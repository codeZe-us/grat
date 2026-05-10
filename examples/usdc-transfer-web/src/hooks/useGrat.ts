import { useState, useEffect } from 'react';
import { Grat } from '@grat-official-sdk/sdk';
import { RELAY_URL } from '../lib/constants';

export function useGrat() {
  const [grat] = useState(() => new Grat({ relayUrl: RELAY_URL }));
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const health = await grat.status();
        setIsConnected(health.status === 'ok');
      } catch (e) {
        setIsConnected(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [grat]);

  return { grat, isConnected, isChecking };
}
