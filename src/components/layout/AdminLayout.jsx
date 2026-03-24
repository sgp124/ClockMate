import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import BottomNav from './BottomNav';

export default function AdminLayout() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/my/schedule" replace />;

  return (
    <div className="min-h-screen bg-surface pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}
