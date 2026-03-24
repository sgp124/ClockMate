import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getGreeting } from '../lib/helpers';
import { Clock, ArrowLeft, ShieldCheck, User, Monitor, Eye, EyeOff, Phone } from 'lucide-react';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';

const roleConfig = {
  admin: {
    icon: ShieldCheck,
    label: 'Admin',
    iconBg: 'bg-brand-50',
    iconColor: 'text-brand-500',
    canRegister: true,
    registerRole: 'admin',
  },
  employee: {
    icon: User,
    label: 'Employee',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    canRegister: true,
    registerRole: 'employee',
  },
  kiosk: {
    icon: Monitor,
    label: 'Kiosk',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    canRegister: true,
    registerRole: 'kiosk',
  },
};

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createdPin, setCreatedPin] = useState(null);
  const { login, register, loading, error, setError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const greeting = getGreeting();

  const selectedRole = searchParams.get('role') || 'employee';
  const config = roleConfig[selectedRole] || roleConfig.employee;
  const RoleIcon = config.icon;

  function resetForm() {
    setEmail('');
    setPassword('');
    setName('');
    setPhone('');
    setError(null);
    setCreatedPin(null);
  }

  function switchMode(next) {
    resetForm();
    setMode(next);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setError('Please enter your email and password.');
        return;
      }
      const user = await login(email, password);
      if (!user) return;
      routeUser(user);
    } else {
      if (!name.trim() || !email.trim() || !password) {
        setError('Please fill in all fields.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (selectedRole !== 'kiosk' && !phone.trim()) {
        setError('Phone number is required (last 4 digits become your kiosk PIN).');
        return;
      }
      const user = await register({
        name,
        email,
        phone: phone.trim(),
        password,
        role: config.registerRole,
      });
      if (!user) return;
      if (user.pin) setCreatedPin(user.pin);
      routeUser(user);
    }
  }

  function routeUser(user) {
    if (user.isKiosk) navigate('/kiosk', { replace: true });
    else if (user.isAdmin) navigate('/admin', { replace: true });
    else navigate('/my/schedule', { replace: true });
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand-600 transition-colors mb-8"
        >
          <ArrowLeft size={18} />
          Back
        </Link>

        <div className="flex flex-col items-center mb-8">
          <div className={`${config.iconBg} rounded-xl p-3 mb-3`}>
            <RoleIcon size={28} className={config.iconColor} />
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Clock size={22} className="text-brand-500" />
            <h1 className="text-2xl font-bold text-brand-900 tracking-tight">ClockMate</h1>
          </div>
          <p className="text-sm font-semibold text-brand-700">
            {config.label} — {mode === 'login' ? 'Sign In' : 'Register'}
          </p>
          <p className="text-muted text-xs mt-1">
            {greeting.text} {greeting.emoji}
          </p>
        </div>

        {error && (
          <div className="mb-5">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="auth-name" className="label">Full name</label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="John Doe"
                  autoComplete="name"
                />
              </div>
              {selectedRole !== 'kiosk' && (
                <div>
                  <label htmlFor="auth-phone" className="label">
                    Phone number
                    <span className="text-muted font-normal ml-1">(last 4 digits = kiosk PIN)</span>
                  </label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      id="auth-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="input-field pl-10"
                      placeholder="(555) 123-4567"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="label">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="label">Password</label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-11"
                placeholder={mode === 'register' ? 'Min 6 characters' : '••••••••'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-brand-500 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full h-11 flex items-center justify-center gap-2"
          >
            {loading && <Spinner size="sm" className="text-white" />}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {createdPin && (
          <div className="card mt-4 bg-emerald-50 border border-emerald-200">
            <p className="text-sm font-semibold text-emerald-800 mb-1">Your Kiosk PIN</p>
            <p className="text-3xl font-bold tracking-[0.2em] text-brand-900 tabular-nums text-center my-2">
              {createdPin}
            </p>
            <p className="text-xs text-emerald-700">
              Use this PIN to clock in/out on the store kiosk. Remember it!
            </p>
          </div>
        )}

        {config.canRegister && (
          <p className="text-center text-sm text-muted mt-5">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-semibold text-brand-500 hover:text-brand-600 transition-colors"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-brand-500 hover:text-brand-600 transition-colors"
                >
                  Sign In
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
