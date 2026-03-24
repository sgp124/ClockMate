import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';

const variants = {
  warning: {
    bg: 'bg-warning-50',
    border: 'border-l-4 border-warning-500',
    icon: AlertTriangle,
    iconColor: 'text-warning-500',
  },
  info: {
    bg: 'bg-brand-50',
    border: 'border-l-4 border-brand-500',
    icon: Info,
    iconColor: 'text-brand-500',
  },
  success: {
    bg: 'bg-emerald-50',
    border: 'border-l-4 border-emerald-500',
    icon: CheckCircle,
    iconColor: 'text-emerald-500',
  },
  error: {
    bg: 'bg-danger-50',
    border: 'border-l-4 border-danger-500',
    icon: XCircle,
    iconColor: 'text-danger-500',
  },
};

export default function Alert({ variant = 'warning', title, children }) {
  const v = variants[variant];
  const Icon = v.icon;

  return (
    <div className={`${v.bg} ${v.border} rounded-card p-4 flex gap-3`}>
      <Icon size={20} className={`${v.iconColor} flex-shrink-0 mt-0.5`} />
      <div>
        {title && <p className="font-semibold text-brand-900 text-sm">{title}</p>}
        <div className="text-sm text-muted mt-0.5">{children}</div>
      </div>
    </div>
  );
}
