import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { comparePin } from '../lib/helpers';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('clockmate_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      localStorage.setItem('clockmate_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('clockmate_user');
    }
  }, [user]);

  const login = useCallback(async (pin) => {
    setLoading(true);
    setError(null);
    try {
      const { data: users, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true);

      if (fetchErr) throw fetchErr;

      const matched = users.find((u) => comparePin(pin, u.pin));
      if (!matched) {
        setError('Invalid PIN');
        setLoading(false);
        return null;
      }

      const effectiveRole =
        matched.role === 'admin'
          ? 'admin'
          : matched.is_admin_granted
            ? 'granted_admin'
            : matched.role;

      const sessionUser = {
        id: matched.id,
        name: matched.name,
        email: matched.email,
        role: matched.role,
        effectiveRole,
        color: matched.color,
        isAdmin: effectiveRole === 'admin' || effectiveRole === 'granted_admin',
        isPrimaryAdmin: matched.role === 'admin',
        isKiosk: matched.role === 'kiosk',
        isEmployee: matched.role === 'employee' && !matched.is_admin_granted,
      };

      setUser(sessionUser);
      setLoading(false);
      return sessionUser;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('clockmate_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
