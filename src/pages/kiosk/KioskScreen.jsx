import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getGreeting, getBusinessDate, formatTime, calcDurationHours, formatDuration } from '../../lib/helpers';
import { Clock, Delete, CheckCircle, AlertTriangle, LogOut, Timer } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';

const INACTIVITY_TIMEOUT = 10000;
const SUCCESS_DISPLAY_MS = 4000;

export default function KioskScreen() {
  const { user, logout } = useAuth();

  // Only kiosk accounts allowed here
  if (!user) return <Navigate to="/" replace />;
  if (!user.isKiosk) return <Navigate to="/" replace />;
  const [phase, setPhase] = useState('pin'); // pin | loading | recognized | success
  const [pin, setPin] = useState('');
  const [employee, setEmployee] = useState(null);
  const [shift, setShift] = useState(null);
  const [openLog, setOpenLog] = useState(null);
  const [forgotWarning, setForgotWarning] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [clockOutHours, setClockOutHours] = useState(null);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    loadSettings();

    // Lock the kiosk — block browser back button
    window.history.pushState(null, '', window.location.href);
    function blockBack() {
      window.history.pushState(null, '', window.location.href);
    }
    window.addEventListener('popstate', blockBack);

    return () => {
      clearInterval(interval);
      window.removeEventListener('popstate', blockBack);
    };
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

      const empId = matched.user_id;
      setEmployee({ id: empId, name: matched.user_name, color: matched.user_color });

      const { data: todayShifts } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', empId)
        .eq('shift_date', businessDate)
        .eq('status', 'published')
        .limit(1);

      setShift(todayShifts?.[0] || null);

      const { data: openLogs } = await supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', empId)
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
    const clockOutTime = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('time_logs')
      .update({ clock_out: clockOutTime })
      .eq('id', openLog.id);

    if (updateErr) {
      setError('Failed to clock out. Please try again.');
      setPhase('recognized');
      return;
    }

    const hours = calcDurationHours(openLog.clock_in, clockOutTime);
    setClockOutHours(hours);
    setSuccessMsg(`${employee.name} clocked out`);
    setPhase('success');
    setTimeout(resetToPin, 6000);
  }

  function resetToPin() {
    setPhase('pin');
    setPin('');
    setEmployee(null);
    setShift(null);
    setOpenLog(null);
    setForgotWarning(null);
    setSuccessMsg('');
    setClockOutHours(null);
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
        {clockOutHours != null && (
          <div className="mt-6 card bg-brand-50 border border-brand-200 text-center w-full max-w-xs">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Timer size={18} className="text-brand-500" />
              <span className="text-sm font-semibold text-brand-700">Hours Worked</span>
            </div>
            <p className="text-3xl font-bold text-brand-900 tabular-nums">
              {formatDuration(clockOutHours)}
            </p>
            <p className="text-xs text-muted mt-1">{clockOutHours.toFixed(2)} hours</p>
          </div>
        )}
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

    let canClockIn = true;
    let earlyMessage = null;

    if (!isClockedIn && shift) {
      const now = currentTime;
      const [sh, sm] = shift.start_time.split(':').map(Number);
      const shiftStart = new Date(now);
      shiftStart.setHours(sh, sm, 0, 0);
      // If shift is after midnight (e.g. 01:00) but we're before midnight, shift is tomorrow
      if (sh < 10 && now.getHours() >= 10) {
        shiftStart.setDate(shiftStart.getDate() + 1);
      }
      const diffMs = shiftStart - now;
      const diffMin = diffMs / 60000;

      if (diffMin > 15) {
        canClockIn = false;
        const minsLeft = Math.ceil(diffMin - 15);
        earlyMessage = `You can clock in at ${formatTime(shift.start_time)} (${minsLeft} min from now).`;
      }
    }

    if (!isClockedIn && !shift) {
      canClockIn = false;
      earlyMessage = 'No shift scheduled today. See your manager.';
    }

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

        {earlyMessage && !isClockedIn && (
          <div className="w-full max-w-sm bg-brand-50 border-l-4 border-brand-500 rounded-card p-4 mb-4 flex gap-3">
            <Clock size={20} className="text-brand-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-brand-800">{earlyMessage}</p>
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
              disabled={!canClockIn}
              className={`w-full h-16 rounded-2xl text-white text-xl font-bold shadow-lg active:scale-[0.98] transition-all ${
                canClockIn
                  ? 'bg-emerald-500 hover:bg-emerald-600 animate-pulse-slow'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
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
