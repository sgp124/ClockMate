import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getGreeting, getBusinessDate, formatTime, formatTimestamp } from '../../lib/helpers';
import TopBar from '../../components/layout/TopBar';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import {
  Calendar,
  Clock,
  CalendarOff,
  Users,
  AlertTriangle,
  ChevronRight,
  DollarSign,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ shiftsToday: 0, clockedIn: 0, pendingTimeOff: 0 });
  const [clockedInUsers, setClockedInUsers] = useState([]);
  const [forgottenClockouts, setForgottenClockouts] = useState([]);
  const [settings, setSettings] = useState(null);

  const greeting = getGreeting();

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    const [settingsRes, shiftsRes, logsRes, timeOffRes, usersRes] = await Promise.all([
      supabase.from('settings').select('*').limit(1).single(),
      supabase
        .from('shifts')
        .select('id')
        .eq('shift_date', getBusinessDate())
        .eq('status', 'published'),
      supabase
        .from('time_logs')
        .select('*, users!inner(name, color)')
        .is('clock_out', null),
      supabase
        .from('time_off_requests')
        .select('id')
        .eq('status', 'pending'),
      supabase
        .from('users')
        .select('id, name, color, role, is_admin_granted, is_active')
        .eq('is_active', true)
        .neq('role', 'kiosk'),
    ]);

    setSettings(settingsRes.data);
    const businessDate = getBusinessDate(new Date(), settingsRes.data?.business_day_start ? parseInt(settingsRes.data.business_day_start) : 10);

    const openLogs = logsRes.data || [];
    const todayClockedIn = openLogs.filter((l) => l.business_date === businessDate);
    const forgotten = openLogs.filter((l) => l.business_date !== businessDate);

    setStats({
      shiftsToday: shiftsRes.data?.length || 0,
      clockedIn: todayClockedIn.length,
      pendingTimeOff: timeOffRes.data?.length || 0,
    });

    setClockedInUsers(todayClockedIn);
    setForgottenClockouts(forgotten);
    setLoading(false);
  }

  if (loading) {
    return (
      <>
        <TopBar showSettings />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar showSettings />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">
            {greeting.text}, {user.name} {greeting.emoji}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Here's what's happening at {settings?.store_name || 'your store'} today.
          </p>
        </div>

        {forgottenClockouts.length > 0 && (
          <Alert variant="warning" title={`${forgottenClockouts.length} forgotten clock-out(s)`}>
            {forgottenClockouts.map((l) => l.users?.name).join(', ')} forgot to clock out.
            <Link to="/admin/timesheets" className="text-brand-500 font-medium ml-1 hover:underline">
              Review →
            </Link>
          </Alert>
        )}

        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={Calendar} label="Shifts Today" value={stats.shiftsToday} color="brand" />
          <StatCard icon={Clock} label="Clocked In" value={stats.clockedIn} color="emerald" />
          <StatCard icon={CalendarOff} label="Pending Off" value={stats.pendingTimeOff} color="warning" />
        </div>

        {clockedInUsers.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold text-brand-900 mb-3">Currently Clocked In</h3>
            <div className="space-y-2">
              {clockedInUsers.map((log) => (
                <div key={log.id} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full animate-pulse-slow"
                    style={{ backgroundColor: log.users?.color || '#10B981' }}
                  />
                  <span className="text-sm font-medium text-brand-900 flex-1">
                    {log.users?.name}
                  </span>
                  <span className="text-xs text-muted">
                    since {formatTimestamp(log.clock_in)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <QuickLink to="/admin/schedule" icon={Calendar} label="Schedule" />
          <QuickLink to="/admin/timesheets" icon={Clock} label="Timesheets" />
          <QuickLink to="/admin/employees" icon={Users} label="Employees" />
          <QuickLink to="/admin/payroll" icon={DollarSign} label="Payroll" />
        </div>
      </main>
    </>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    brand: 'bg-brand-50 text-brand-500',
    emerald: 'bg-emerald-50 text-emerald-500',
    warning: 'bg-warning-50 text-warning-500',
  };
  return (
    <div className="card flex flex-col items-center text-center py-4">
      <div className={`rounded-full p-2 mb-2 ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <span className="text-2xl font-bold text-brand-900 tabular-nums">{value}</span>
      <span className="text-xs text-muted mt-0.5">{label}</span>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }) {
  return (
    <Link
      to={to}
      className="card flex items-center gap-3 hover:shadow-card-lg transition-shadow group"
    >
      <Icon size={20} className="text-brand-500" />
      <span className="text-sm font-medium text-brand-900 flex-1">{label}</span>
      <ChevronRight size={16} className="text-muted group-hover:text-brand-500 transition-colors" />
    </Link>
  );
}
