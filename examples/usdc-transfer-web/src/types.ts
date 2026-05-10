export type AppState = 'loading' | 'send' | 'confirming' | 'success' | 'error';

export interface UserAccount {
  name: string;
  publicKey: string;
  secretKey: string;
  balance: string;
}

export interface ActivityItem {
  id: string;
  type: 'sent' | 'received';
  amount: string;
  fromName: string;
  toName: string;
  note?: string;
  hash?: string;
  timestamp: Date;
}

export interface DevStats {
  sponsoredCount: number;
  totalFeesStroops: bigint;
  lastHash?: string;
}
