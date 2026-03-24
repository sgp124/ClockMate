import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const profileLoading = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setUser(null);
        setLoading(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (session?.user) {
          await loadProfile(session.user.id);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(authId) {
    if (profileLoading.current) return;
    profileLoading.current = true;

    try {
      const { data: profile, error: profileErr } = await supabase
        .from('users')
        .select('id, name, email, role, is_admin_granted, color, is_active')
        .eq('id', authId)
        .eq('is_active', true)
        .maybeSingle();

      if (profileErr || !profile) {
        setUser(null);
      } else {
        const effectiveRole =
          profile.role === 'admin'
            ? 'admin'
            : profile.is_admin_granted
              ? 'granted_admin'
              : profile.role;

        setUser({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          effectiveRole,
          color: profile.color,
          isAdmin: effectiveRole === 'admin' || effectiveRole === 'granted_admin',
          isPrimaryAdmin: profile.role === 'admin',
          isKiosk: profile.role === 'kiosk',
          isEmployee: profile.role === 'employee' && !profile.is_admin_granted,
        });
      }
    } finally {
      profileLoading.current = false;
      setLoading(false);
    }
  }

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (authErr) {
        setError(authErr.message === 'Invalid login credentials'
          ? 'Invalid email or password.'
          : authErr.message);
        setLoading(false);
        return null;
      }

      if (data?.user) {
        await loadProfile(data.user.id);
      }
      return true;
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

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: emailNorm,
        password,
        options: {
          data: { name: name.trim(), role },
        },
      });

      if (signUpErr) {
        setError(signUpErr.message);
        setLoading(false);
        return null;
      }

      if (!data.user) {
        setError('Registration failed. Please try again.');
        setLoading(false);
        return null;
      }

      // Wait for the DB trigger to create the profile row
      const userId = data.user.id;
      let profileReady = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 300));
        const { data: row } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (row) { profileReady = true; break; }
      }

      if (!profileReady) {
        setError('Account created but profile setup timed out. Try logging in.');
        setLoading(false);
        return null;
      }

      if (phone || role !== 'kiosk') {
        const pin = phone ? await resolveUniquePin(derivePinFromPhone(phone)) : null;
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true);

        const COLORS = ['#4F46E5', '#10B981', '#0EA5E9', '#F59E0B', '#F43F5E', '#8B5CF6', '#14B8A6'];

        await supabase.from('users').update({
          phone: phone ? phone.replace(/\D/g, '') : null,
          pin,
          color: COLORS[(count ?? 0) % COLORS.length],
        }).eq('id', userId);
      }

      await loadProfile(userId);
      return true;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setLoading(false);
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

function derivePinFromPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  return generateSecurePin();
}

function generateSecurePin() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(1000 + (array[0] % 9000));
}

async function resolveUniquePin(preferred) {
  const { data: conflict } = await supabase
    .from('users')
    .select('id')
    .eq('pin', preferred)
    .eq('is_active', true)
    .maybeSingle();

  if (!conflict) return preferred;

  for (let i = 0; i < 20; i++) {
    const candidate = generateSecurePin();
    const { data: dup } = await supabase
      .from('users')
      .select('id')
      .eq('pin', candidate)
      .eq('is_active', true)
      .maybeSingle();
    if (!dup) return candidate;
  }
  return generateSecurePin();
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
