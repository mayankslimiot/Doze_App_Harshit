import type React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  valueClassName?: string;
  icon: LucideIcon;
  iconClassName?: string;
}

export default function StatCard({
  title,
  value,
  valueClassName = 'text-gray-900',
  icon: Icon,
  iconClassName = 'text-gray-400',
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col justify-between">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="flex items-end space-x-2">
        <span className={`text-2xl font-bold leading-none ${valueClassName}`}>
          {value}
        </span>
        <Icon className={`w-4 h-4 mb-0.5 ${iconClassName}`} strokeWidth={2.5} />
      </div>
    </div>
  );
}
