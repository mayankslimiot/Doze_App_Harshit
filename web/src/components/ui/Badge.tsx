import React from 'react';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  showDot?: boolean;
}

export default function Badge({ children, variant = 'neutral', showDot = true }: BadgeProps) {
  const variants = {
    success: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    warning: 'bg-orange-100 text-orange-700',
    neutral: 'bg-gray-100 text-gray-700',
  };

  const dotColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-orange-500',
    neutral: 'bg-gray-500',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${variants[variant]}`}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColors[variant]}`}
        ></span>
      )}
      {children}
    </span>
  );
}
