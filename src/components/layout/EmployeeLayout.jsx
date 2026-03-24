import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import BottomNav from './BottomNav';

export default function EmployeeLayout() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/" replace />;
  if (user.isKiosk) return <Navigate to="/kiosk" replace />;
  if (user.isPrimaryAdmin) return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-surface pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}
