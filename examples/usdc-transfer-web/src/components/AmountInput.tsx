import React from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export const AmountInput: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center">
        <span className="text-4xl font-bold text-zinc-900 absolute left-0 translate-x-[-120%]">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className="bg-transparent text-6xl md:text-7xl font-bold text-zinc-900 text-center outline-none w-full max-w-[300px] placeholder:text-zinc-200"
          autoFocus
        />
      </div>
    </div>
  );
};
