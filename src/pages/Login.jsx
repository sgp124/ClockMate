import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getGreeting } from '../lib/helpers';
import { Clock, Delete } from 'lucide-react';
import Spinner from '../components/ui/Spinner';

export default function Login() {
  const [pin, setPin] = useState('');
  const { login, loading, error, setError } = useAuth();
  const navigate = useNavigate();
  const greeting = getGreeting();

  const handleDigit = useCallback(
    (digit) => {
      if (pin.length >= 4) return;
      const next = pin + digit;
      setPin(next);
      setError(null);

      if (next.length === 4) {
        setTimeout(async () => {
          const user = await login(next);
          if (user) {
            if (user.isKiosk) navigate('/kiosk', { replace: true });
            else if (user.isAdmin) navigate('/admin', { replace: true });
            else navigate('/my/schedule', { replace: true });
          } else {
            setPin('');
          }
        }, 200);
      }
    },
    [pin, login, navigate, setError]
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }, [setError]);

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs flex flex-col items-center">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={32} className="text-brand-500" />
          <h1 className="text-3xl font-bold text-brand-900 tracking-tight">ClockMate</h1>
        </div>

        <p className="text-muted text-sm mb-8">
          {greeting.text} {greeting.emoji}
        </p>

        <div className="flex gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                i < pin.length ? 'bg-brand-500 scale-110' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-danger-500 text-sm font-medium mb-4 animate-fade-in">{error}</p>
        )}

        {loading ? (
          <div className="py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button
                key={d}
                onClick={() => handleDigit(String(d))}
                className="h-16 rounded-2xl bg-white text-2xl font-semibold text-brand-900 shadow-card hover:bg-gray-50 active:scale-95 transition-all"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              onClick={() => handleDigit('0')}
              className="h-16 rounded-2xl bg-white text-2xl font-semibold text-brand-900 shadow-card hover:bg-gray-50 active:scale-95 transition-all"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              className="h-16 rounded-2xl bg-white text-muted shadow-card hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center"
            >
              <Delete size={24} />
            </button>
          </div>
        )}

        <p className="text-xs text-muted mt-8">Enter your 4-digit PIN to sign in</p>
      </div>
    </div>
  );
}
