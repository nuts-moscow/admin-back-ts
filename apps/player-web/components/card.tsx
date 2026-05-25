import { cn } from '@/lib/utils';
import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: number;
  onClick?: () => void;
}

export function Card({ children, className, style, padding = 16, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-paper border border-line-2 rounded-md',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{
        padding,
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.6) inset, 0 6px 14px -10px rgba(27,22,18,0.18)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
