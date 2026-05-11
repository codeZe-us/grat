import { useState, useEffect, useRef } from 'react';
import { Keypair } from '@stellar/stellar-sdk';
import { LoadingScreen } from './components/LoadingScreen';
import { SendMoney } from './components/SendMoney';
import { Confirmation } from './components/Confirmation';
import { DevPanel } from './components/DevPanel';
import { useAccounts } from './hooks/useAccounts';
import { useTransfer } from './hooks/useTransfer';
import { useActivity } from './hooks/useActivity';
import type { AppState, DevStats } from './types';

function App() {
  const [screen, setScreen] = useState<AppState>('loading');
  const [currentRole, setCurrentRole] = useState<string>('Alice');
  const { alice, bob, charlie, issuer, isReady, progress, status, setup, setAlice, setBob, setCharlie } =
    useAccounts();
  const { transfer } = useTransfer();
  const { activities, addActivity } = useActivity();

  const [lastAmount, setLastAmount] = useState('');
  const [lastRecipient, setLastRecipient] = useState('');
  const [devStats, setDevStats] = useState<DevStats>({
    sponsoredCount: 0,
    totalFeesStroops: 0n,
  });

  const setupRef = useRef(false);
  useEffect(() => {
    if (!isReady && !setupRef.current) {
      setupRef.current = true;
      setup();
    }
  }, [isReady, setup]);

  useEffect(() => {
    if (isReady && screen === 'loading') setScreen('send');
  }, [isReady, screen]);

  const allUsers = { Alice: alice, Bob: bob, Charlie: charlie };
  const setters = { Alice: setAlice, Bob: setBob, Charlie: setCharlie };

  const handleSend = async (amount: string, recipientName: string, note: string) => {
    const sender = allUsers[currentRole as keyof typeof allUsers];
    const recipient = allUsers[recipientName as keyof typeof allUsers];
    if (!sender || !recipient || !issuer) return;

    setScreen('confirming');
    setLastAmount(amount);
    setLastRecipient(recipientName);

    try {
      const senderKp = Keypair.fromSecret(sender.secretKey);
      const result = await transfer(senderKp, recipient.publicKey, issuer.publicKey(), amount);

      setDevStats((prev) => ({
        sponsoredCount: prev.sponsoredCount + 1,
        totalFeesStroops: prev.totalFeesStroops + BigInt(result.feePaid),
        lastHash: result.hash,
      }));

      addActivity(amount, sender.name, recipient.name, result.hash, note);

      const newSenderBalance = (parseFloat(sender.balance) - parseFloat(amount)).toFixed(2);
      const newRecipientBalance = (parseFloat(recipient.balance) + parseFloat(amount)).toFixed(2);

      setters[sender.name as keyof typeof setters]!({ ...sender, balance: newSenderBalance });
      setters[recipient.name as keyof typeof setters]!({
        ...recipient,
        balance: newRecipientBalance,
      });

      setScreen('success');
    } catch (e: unknown) {
      const err = e as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('--- GRAT TRANSFER ERROR ---');
      console.error('Message:', err.message);

      if (err.details) {
        console.error('Error Details:', JSON.stringify(err.details, null, 2));
      }
      if (err.response?.data) {
        console.error('Relay Response Body:', JSON.stringify(err.response.data, null, 2));
      }

      console.error('Full Error Object:', err);
      console.error('---------------------------');
      setScreen('error');
    }
  };

  const handleSwitch = (name: string) => {
    setCurrentRole(name);
  };

  if (screen === 'loading') return <LoadingScreen progress={progress} status={status} />;

  const user = allUsers[currentRole as keyof typeof allUsers];
  const otherUsers = Object.keys(allUsers).filter((name) => name !== currentRole);

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-primary/30">
      {screen === 'send' || screen === 'confirming' ? (
        <SendMoney
          user={user!}
          otherUsers={otherUsers}
          onSend={handleSend}
          onSwitch={handleSwitch}
          activities={activities}
          isSending={screen === 'confirming'}
        />
      ) : (
        <Confirmation
          status={screen === 'success' ? 'success' : 'error'}
          amount={lastAmount}
          recipient={lastRecipient}
          onDone={() => setScreen('send')}
        />
      )}

      <DevPanel stats={devStats} />
    </div>
  );
}

export default App;
