import React from 'react';

// ============================================
// Skeleton
// ============================================
interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', width, height }) => (
  <div
    className={`rounded-[var(--radius-md)] animate-shimmer ${className}`}
    style={{ width, height }}
  />
);

export const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-[var(--radius-xl)] border border-[var(--color-border)] p-5">
    <Skeleton className="h-3 w-24 mb-3" />
    <Skeleton className="h-7 w-32 mb-2" />
    <Skeleton className="h-3 w-16" />
  </div>
);

export const SkeletonTableRow: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <Skeleton className="h-4 w-full" />
      </td>
    ))}
  </tr>
);

// ============================================
// Badge
// ============================================
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'gold' | 'neutral';
  className?: string;
  size?: 'sm' | 'md';
}

const badgeVariants: Record<string, string> = {
  default: 'bg-stone-100 text-stone-700 border-stone-200',
  neutral: 'bg-stone-100 text-stone-700 border-stone-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  gold: 'bg-amber-50 text-amber-800 border-amber-200',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', size = 'md', className = '' }) => (
  <span
    className={`
      inline-flex items-center border font-medium rounded-full
      ${size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs'}
      ${badgeVariants[variant] || badgeVariants.default}
      ${className}
    `}
  >
    {children}
  </span>
);

// ============================================
// PageHeader
// ============================================
export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  badge,
  className = '',
}) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 ${className}`}>
    <div>
      <div className="flex items-center gap-2.5">
        <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">{title}</h1>
        {badge}
      </div>
      {description && (
        <p className="text-sm text-stone-500 mt-0.5">{description}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
  </div>
);

// ============================================
// StatCard
// ============================================
export interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  subtext?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  change,
  trend = 'neutral',
  subtext,
  icon,
  className = '',
}) => (
  <div className={`bg-white rounded-lg border border-stone-200 p-4 sm:p-5 flex flex-col justify-between ${className}`}>
    <div className="flex items-center justify-between text-stone-500 mb-2">
      <span className="text-xs font-medium uppercase tracking-wider text-stone-500">{label}</span>
      {icon && <span className="text-stone-400">{icon}</span>}
    </div>
    <div className="text-2xl sm:text-[26px] font-semibold text-stone-900 tracking-tight leading-none mb-1.5">
      {value}
    </div>
    {(change || subtext) && (
      <div className="flex items-center gap-1.5 text-xs">
        {change && (
          <span className={`font-medium ${
            trend === 'up' ? 'text-emerald-700' : trend === 'down' ? 'text-red-600' : 'text-stone-600'
          }`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {change}
          </span>
        )}
        {subtext && <span className="text-stone-400">{subtext}</span>}
      </div>
    )}
  </div>
);

// ============================================
// ActionDropdown
// ============================================
export interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface ActionDropdownProps {
  items: ActionItem[];
  align?: 'left' | 'right';
  className?: string;
}

export const ActionDropdown: React.FC<ActionDropdownProps> = ({ items, align = 'right', className = '' }) => {
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
        aria-label="Actions"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div
          className={`
            absolute z-30 mt-1 w-44 rounded-lg bg-white border border-stone-200 shadow-md py-1
            ${align === 'right' ? 'right-0' : 'left-0'}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`
                w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 transition-colors
                ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-stone-700 hover:bg-stone-50'}
                ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}
              `}
            >
              {item.icon && <span className="shrink-0 text-stone-400">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// EmptyState
// ============================================
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    {icon && <div className="text-[var(--color-text-muted)] mb-4">{icon}</div>}
    <h3 className="text-[var(--text-md)] font-medium text-[var(--color-text-primary)] mb-1">
      {title}
    </h3>
    {description && (
      <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] max-w-sm mb-4">
        {description}
      </p>
    )}
    {action && <div>{action}</div>}
  </div>
);

// ============================================
// ErrorState
// ============================================
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = "We couldn't load the data.",
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="w-12 h-12 rounded-full bg-[var(--color-error-light)] flex items-center justify-center mb-4">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
    <p className="text-[var(--text-base)] text-[var(--color-text-secondary)] mb-4">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="h-9 px-4 text-[var(--text-sm)] font-medium rounded-[var(--radius-md)] bg-[var(--color-brand-red)] text-white hover:bg-[var(--color-brand-red-dark)] transition-colors"
      >
        Try Again
      </button>
    )}
  </div>
);

// ============================================
// Card
// ============================================
interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', padding = true }) => (
  <div
    className={`
      bg-white rounded-[var(--radius-xl)] border border-[var(--color-border)]
      ${padding ? 'p-5' : ''}
      ${className}
    `}
  >
    {children}
  </div>
);

// ============================================
// Avatar
// ============================================
interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const avatarSizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' };

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md', className = '' }) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${avatarSizes[size]} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`
        ${avatarSizes[size]} rounded-full flex items-center justify-center
        bg-[var(--color-brand-red-light)] text-[var(--color-brand-red)] font-semibold
        ${className}
      `}
    >
      {initials}
    </div>
  );
};

// ============================================
// Pagination
// ============================================
interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <span className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="h-8 px-3 text-[var(--text-sm)] rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="h-8 px-3 text-[var(--text-sm)] rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
};

// Re-export Input and Button primitives
export * from './Button';
export * from './Input';
export * from './ErrorBoundary';
