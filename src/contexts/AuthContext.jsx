import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { comparePassword, hashPassword, derivePinFromPhone, generateRandomPin } from '../lib/helpers';
import { EMPLOYEE_COLORS } from '../lib/constants';

const AuthContext = createContext(null);

async function resolveUniquePin(preferredPin) {
  const { data: conflict } = await supabase
    .from('users')
    .select('id')
    .eq('pin', preferredPin)
    .eq('is_active', true)
    .maybeSingle();

  if (!conflict) return preferredPin;

  for (let i = 0; i < 20; i++) {
    const candidate = generateRandomPin();
    const { data: dup } = await supabase
      .from('users')
      .select('id')
      .eq('pin', candidate)
      .eq('is_active', true)
      .maybeSingle();
    if (!dup) return candidate;
  }
  return null;
}

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

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const { data: matched, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .eq('is_active', true)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (!matched || !comparePassword(password, matched.password)) {
        setError('Invalid email or password');
        setLoading(false);
        return null;
      }

      const sessionUser = buildSessionUser(matched);
      setUser(sessionUser);
      setLoading(false);
      return sessionUser;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, []);

  const register = useCallback(async ({ name, email, phone, password, role = 'employee' }) => {
    setLoading(true);
    setError(null);
    try {
      const emailNorm = email.toLowerCase().trim();

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', emailNorm)
        .eq('is_active', true)
        .maybeSingle();

      if (existing) {
        setError('An account with this email already exists');
        setLoading(false);
        return null;
      }

      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const color = EMPLOYEE_COLORS[(count ?? 0) % EMPLOYEE_COLORS.length];

      let pin = null;
      if (role !== 'kiosk' && phone) {
        const preferred = derivePinFromPhone(phone);
        pin = await resolveUniquePin(preferred);
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('users')
        .insert({
          name: name.trim(),
          email: emailNorm,
          phone: phone ? phone.replace(/\D/g, '') : null,
          password: hashPassword(password),
          pin,
          role,
          color,
        })
        .select('*')
        .single();

      if (insertErr) throw insertErr;

      const sessionUser = buildSessionUser(inserted);
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
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

function buildSessionUser(matched) {
  const effectiveRole =
    matched.role === 'admin'
      ? 'admin'
      : matched.is_admin_granted
        ? 'granted_admin'
        : matched.role;

  return {
    id: matched.id,
    name: matched.name,
    email: matched.email,
    phone: matched.phone,
    pin: matched.pin,
    role: matched.role,
    effectiveRole,
    color: matched.color,
    isAdmin: effectiveRole === 'admin' || effectiveRole === 'granted_admin',
    isPrimaryAdmin: matched.role === 'admin',
    isKiosk: matched.role === 'kiosk',
    isEmployee: matched.role === 'employee' && !matched.is_admin_granted,
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
