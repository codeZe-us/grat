import { ArrowUpRight, ArrowDownLeft, ExternalLink } from 'lucide-react';
import type { ActivityItem } from '../types';
import { STELLAR_EXPERT_TX_URL } from '../lib/constants';

interface Props {
  activities: ActivityItem[];
  currentUser: string;
}

export const ActivityList: React.FC<Props> = ({ activities, currentUser }) => {
  const filteredActivities = activities.filter(
    item => item.fromName === currentUser || item.toName === currentUser
  );

  return (
    <div className="w-full space-y-4">
      <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest px-1">Activity</h3>
      <div className="space-y-3">
        {filteredActivities.map((item) => {
          const isSent = item.fromName === currentUser;
          const targetName = isSent ? item.toName : item.fromName;
          
          return (
            <a 
              key={item.id} 
              href={item.hash ? `${STELLAR_EXPERT_TX_URL}${item.hash}` : '#'} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-2xl hover:bg-zinc-100 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isSent ? 'bg-zinc-200 text-zinc-600' : 'bg-green-100 text-green-600'
                }`}>
                  {isSent ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-zinc-900">
                      {isSent ? `Sent to ${targetName}` : `Received from ${targetName}`}
                    </p>
                    <ExternalLink className="w-3 h-3 text-zinc-400 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-zinc-500">{item.note || 'No note'}</p>
                    {item.hash && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-zinc-300" />
                        <p className="text-[10px] font-mono text-zinc-400">{item.hash.slice(0, 8)}...</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className={`text-sm font-bold ${isSent ? 'text-zinc-900' : 'text-green-600'}`}>
                {isSent ? '-' : '+'}${item.amount}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};
