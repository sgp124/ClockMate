import { NavLink } from 'react-router-dom';
import { Home, Calendar, Clock, Users, CalendarOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const adminLinks = [
  { to: '/admin', icon: Home, label: 'Home' },
  { to: '/admin/schedule', icon: Calendar, label: 'Schedule' },
  { to: '/admin/timesheets', icon: Clock, label: 'Timesheets' },
  { to: '/admin/employees', icon: Users, label: 'Employees' },
  { to: '/admin/time-off', icon: CalendarOff, label: 'Time Off' },
];

const employeeLinks = [
  { to: '/my/schedule', icon: Calendar, label: 'Schedule' },
  { to: '/my/hours', icon: Clock, label: 'My Hours' },
  { to: '/my/time-off', icon: CalendarOff, label: 'Time Off' },
];

export default function BottomNav() {
  const { user } = useAuth();
  const links = user?.isAdmin ? adminLinks : employeeLinks;

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-border z-40 safe-bottom">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/admin'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive ? 'text-brand-500' : 'text-muted hover:text-brand-400'
              }`
            }
          >
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
