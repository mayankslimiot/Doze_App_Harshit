import * as React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      isLoading,
      children,
      ...props
    },
    ref
  ) => {
    // A simplified tailwind button styling implementation
    const baseStyles = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50';
    
    const variants = {
      default: 'bg-gray-900 text-gray-50 hover:bg-gray-900/90 shadow',
      destructive: 'bg-red-500 text-gray-50 hover:bg-red-500/90 shadow-sm',
      outline: 'border border-gray-200 bg-white hover:bg-gray-100 hover:text-gray-900 shadow-sm',
      ghost: 'hover:bg-gray-100 hover:text-gray-900',
    };

    const sizes = {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 rounded-md px-3 text-xs',
      lg: 'h-10 rounded-md px-8',
      icon: 'h-9 w-9',
    };

    const variantStyles = variants[variant] || variants.default;
    const sizeStyles = sizes[size] || sizes.default;

    const classes = `${baseStyles} ${variantStyles} ${sizeStyles} ${className || ''}`;

    return (
      <button className={classes} ref={ref} disabled={isLoading || props.disabled} {...props}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button };
