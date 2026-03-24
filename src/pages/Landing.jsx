import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { getGreeting } from '../lib/helpers';
import { Clock, ShieldCheck, User, Monitor, ChevronRight, Calendar, DollarSign, ClipboardList } from 'lucide-react';

const roles = [
  {
    key: 'admin',
    to: '/login?role=admin',
    icon: ShieldCheck,
    title: 'Admin',
    description: 'Manage schedules, employees, timesheets, and payroll.',
    iconBg: 'bg-brand-50',
    iconColor: 'text-brand-500',
    features: [
      { icon: Calendar, text: 'Schedule builder' },
      { icon: DollarSign, text: 'Payroll & pay rates' },
      { icon: ClipboardList, text: 'Timesheets & approvals' },
    ],
  },
  {
    key: 'employee',
    to: '/login?role=employee',
    icon: User,
    title: 'Employee',
    description: 'View your schedule, clock hours, and request time off.',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    features: [
      { icon: Calendar, text: 'My schedule' },
      { icon: Clock, text: 'My hours' },
    ],
  },
  {
    key: 'kiosk',
    to: '/login?role=kiosk',
    icon: Monitor,
    title: 'Kiosk',
    description: 'Store tablet — clock in and out from a shared device.',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    features: [
      { icon: Clock, text: 'Clock in / out' },
    ],
  },
];

export default function Landing() {
  const { user } = useAuth();

  if (user) {
    if (user.isKiosk) return <Navigate to="/kiosk" replace />;
    if (user.isAdmin) return <Navigate to="/admin" replace />;
    return <Navigate to="/my/schedule" replace />;
  }

  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-lg mx-auto px-5 py-12 flex flex-col items-center">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="rounded-xl bg-brand-500 p-2.5">
            <Clock size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-brand-900 tracking-tight">ClockMate</h1>
        </div>

        <p className="text-muted text-sm mb-2">
          {greeting.text} {greeting.emoji}
        </p>
        <p className="text-muted text-sm mb-10 text-center max-w-xs">
          Workforce scheduling, clock in/out, and payroll — all in one place.
        </p>

        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-4 self-start">
          Sign in as
        </h2>

        <div className="w-full space-y-4">
          {roles.map((r) => (
            <Link
              key={r.key}
              to={r.to}
              className="card block w-full text-left hover:shadow-card-lg transition-all duration-200 group active:scale-[0.99]"
            >
              <div className="flex items-start gap-4">
                <div className={`${r.iconBg} rounded-xl p-3 shrink-0`}>
                  <r.icon size={24} className={r.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-brand-900">{r.title}</h2>
                    <ChevronRight
                      size={20}
                      className="text-muted group-hover:text-brand-500 transition-colors shrink-0"
                    />
                  </div>
                  <p className="text-sm text-muted mt-0.5">{r.description}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                    {r.features.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700">
                        <f.icon size={13} className="text-brand-400" />
                        {f.text}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-xs text-muted mt-10 text-center">
          Don't have an account? Choose a role above and register.
        </p>
      </div>
    </div>
  );
}
