import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ManagerGuard() {
  const { user } = useAuth();

  if (!user?.isAdmin) return <Navigate to="/my/schedule" replace />;

  return <Outlet />;
}
