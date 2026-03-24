import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getGreeting, getBusinessDate, formatTime } from '../../lib/helpers';
import { Clock, Delete, CheckCircle, AlertTriangle, LogOut } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';

const INACTIVITY_TIMEOUT = 10000;
const SUCCESS_DISPLAY_MS = 4000;

export default function KioskScreen() {
  const { user, logout } = useAuth();
  const [phase, setPhase] = useState('pin'); // pin | loading | recognized | success
  const [pin, setPin] = useState('');
  const [employee, setEmployee] = useState(null);
  const [shift, setShift] = useState(null);
  const [openLog, setOpenLog] = useState(null);
  const [forgotWarning, setForgotWarning] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    loadSettings();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase === 'pin' && pin.length > 0) {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPin('');
        setError(null);
      }, INACTIVITY_TIMEOUT);
    }
    return () => clearTimeout(timerRef.current);
  }, [pin, phase]);

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('*').limit(1).single();
    if (data) setSettings(data);
  }

  const greeting = getGreeting();
  const businessDate = getBusinessDate(
    currentTime,
    settings?.business_day_start ? parseInt(settings.business_day_start) : 10
  );

  function handleDigit(digit) {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError(null);

    if (next.length === 4) {
      lookupByPin(next);
    }
  }

  function handleBackspace() {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }

  async function lookupByPin(enteredPin) {
    setPhase('loading');
    try {
      const { data: results, error: rpcErr } = await supabase
        .rpc('lookup_pin', { entered_pin: enteredPin });

      if (rpcErr) {
        const msg = rpcErr.message.includes('Too many')
          ? 'Too many attempts. Please wait a moment.'
          : 'Connection error. Please try again.';
        setError(msg);
        setPhase('pin');
        setPin('');
        return;
      }

      const matched = results?.[0];
      if (!matched) {
        setError('PIN not found. Check your PIN or see your manager.');
        setPhase('pin');
        setPin('');
        return;
      }

      setEmployee({ id: matched.user_id, name: matched.user_name, color: matched.user_color });

      const { data: todayShifts } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', matched.id)
        .eq('shift_date', businessDate)
        .eq('status', 'published')
        .limit(1);

      setShift(todayShifts?.[0] || null);

      const { data: openLogs } = await supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', matched.id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1);

      const open = openLogs?.[0] || null;
      setOpenLog(open);

      if (open && open.business_date !== businessDate) {
        setForgotWarning(open.business_date);
      } else {
        setForgotWarning(null);
      }

      setPhase('recognized');
    } catch {
      setError('Connection error. Please try again.');
      setPhase('pin');
      setPin('');
    }
  }

  async function handleClockIn() {
    setPhase('loading');
    let lat = null;
    let lng = null;

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // GPS not available
    }

    const { error: insertErr } = await supabase.from('time_logs').insert({
      user_id: employee.id,
      business_date: businessDate,
      clock_in: new Date().toISOString(),
      lat,
      lng,
    });

    if (insertErr) {
      setError('Failed to clock in. Please try again.');
      setPhase('recognized');
      return;
    }

    setSuccessMsg(`${employee.name} clocked in`);
    setPhase('success');
    setTimeout(resetToPin, SUCCESS_DISPLAY_MS);
  }

  async function handleClockOut() {
    setPhase('loading');

    const { error: updateErr } = await supabase
      .from('time_logs')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', openLog.id);

    if (updateErr) {
      setError('Failed to clock out. Please try again.');
      setPhase('recognized');
      return;
    }

    setSuccessMsg(`${employee.name} clocked out`);
    setPhase('success');
    setTimeout(resetToPin, SUCCESS_DISPLAY_MS);
  }

  function resetToPin() {
    setPhase('pin');
    setPin('');
    setEmployee(null);
    setShift(null);
    setOpenLog(null);
    setForgotWarning(null);
    setSuccessMsg('');
    setError(null);
  }

  const timeStr = currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  // ---- SUCCESS ----
  if (phase === 'success') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 animate-fade-in">
        <CheckCircle size={64} className="text-emerald-500 mb-4" />
        <h2 className="text-2xl font-bold text-brand-900">{successMsg}</h2>
        <p className="text-muted text-sm mt-2">{timeStr}</p>
      </div>
    );
  }

  // ---- LOADING ----
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // ---- RECOGNIZED ----
  if (phase === 'recognized' && employee) {
    const isClockedIn = openLog && openLog.business_date === businessDate;

    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-brand-900 mb-1">Hello, {employee.name}</h2>
        <p className="text-4xl font-bold text-brand-500 tabular-nums mb-6">{timeStr}</p>

        {shift && (
          <p className="text-muted text-sm mb-4">
            Today's shift: {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
          </p>
        )}
        {!shift && <p className="text-muted text-sm mb-4">No shift scheduled today</p>}

        {forgotWarning && (
          <div className="w-full max-w-sm bg-warning-50 border-l-4 border-warning-500 rounded-card p-4 mb-6 flex gap-3">
            <AlertTriangle size={20} className="text-warning-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-brand-900">Forgot to clock out</p>
              <p className="text-sm text-muted">
                You forgot to clock out on {forgotWarning}. Please see your manager.
              </p>
            </div>
          </div>
        )}

        <div className="w-full max-w-sm space-y-3">
          {isClockedIn ? (
            <button
              onClick={handleClockOut}
              className="w-full h-16 rounded-2xl bg-danger-500 text-white text-xl font-bold shadow-lg hover:bg-danger-600 active:scale-[0.98] transition-all"
            >
              CLOCK OUT
            </button>
          ) : (
            <button
              onClick={handleClockIn}
              className="w-full h-16 rounded-2xl bg-emerald-500 text-white text-xl font-bold shadow-lg hover:bg-emerald-600 active:scale-[0.98] transition-all animate-pulse-slow"
            >
              CLOCK IN
            </button>
          )}
          <button
            onClick={resetToPin}
            className="w-full h-12 rounded-2xl bg-white text-muted text-sm font-medium shadow-card hover:bg-gray-50 transition-all"
          >
            Not you? Go back
          </button>
        </div>
      </div>
    );
  }

  // ---- PIN ENTRY ----
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs flex flex-col items-center">
        <Clock size={40} className="text-brand-500 mb-3" />
        <h1 className="text-2xl font-bold text-brand-900 mb-1">
          {settings?.store_name || 'ClockMate'}
        </h1>
        <p className="text-4xl font-bold text-brand-500 tabular-nums mb-2">{timeStr}</p>
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
          <p className="text-danger-500 text-sm font-medium mb-4 animate-fade-in text-center">{error}</p>
        )}

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

        <p className="text-xs text-muted mt-8">Enter your 4-digit PIN to clock in or out</p>

        {user?.isKiosk && (
          <button
            onClick={logout}
            className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-danger-500 transition-colors"
          >
            <LogOut size={14} />
            Exit kiosk
          </button>
        )}
      </div>
    </div>
  );
}
