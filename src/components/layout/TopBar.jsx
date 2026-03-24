import { useAuth } from '../../contexts/AuthContext';
import { Settings, LogOut, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import NotificationBell from '../ui/NotificationBell';

export default function TopBar({ title, showSettings = false }) {
  const { user, logout } = useAuth();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="bg-white border-b border-border sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 py-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Clock size={22} className="text-brand-500" />
            <span className="text-lg font-bold text-brand-900 tracking-tight">
              {title || 'ClockMate'}
            </span>
          </div>
          <span className="hidden sm:block text-sm text-muted">·</span>
          <span className="hidden sm:block text-sm text-muted">{today}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-brand-900 hidden sm:block">
            {user?.name}
          </span>
          {!user?.isKiosk && <NotificationBell />}
          {showSettings && (
            <Link
              to="/admin/settings"
              className="rounded-full p-2 text-muted hover:bg-gray-100 transition"
            >
              <Settings size={20} />
            </Link>
          )}
          {!user?.isKiosk && (
            <button
              onClick={logout}
              className="rounded-full p-2 text-muted hover:bg-gray-100 transition"
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
