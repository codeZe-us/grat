import React from 'react';

interface Props {
  name: string;
  avatarColor: string;
}

export const RecipientPill: React.FC<Props> = ({ name, avatarColor }) => {
  return (
    <div className="inline-flex items-center gap-3 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-full shadow-sm">
      <div className={`w-6 h-6 rounded-full ${avatarColor} flex items-center justify-center text-[10px] font-bold text-white`}>
        {name[0]}
      </div>
      <span className="text-sm font-medium text-zinc-900">{name}</span>
    </div>
  );
};
