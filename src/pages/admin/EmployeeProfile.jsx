import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatTimestamp } from '../../lib/helpers';
import { ROLES, AUDIT_ACTIONS } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import {
  ArrowLeft,
  Clock,
  ClipboardList,
  KeyRound,
  Lock,
  Phone,
  Shield,
  UserX,
} from 'lucide-react';

function generateSecurePin() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(1000 + (array[0] % 9000));
}

function derivePinFromPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  return generateSecurePin();
}

async function resolveUniquePin(preferredPin, excludeUserId) {
  const query = supabase
    .from('users').select('id').eq('pin', preferredPin).eq('is_active', true);
  if (excludeUserId) query.neq('id', excludeUserId);
  const { data: conflict } = await query.maybeSingle();
  if (!conflict) return preferredPin;
  for (let i = 0; i < 20; i++) {
    const candidate = generateSecurePin();
    const q2 = supabase
      .from('users').select('id').eq('pin', candidate).eq('is_active', true);
    if (excludeUserId) q2.neq('id', excludeUserId);
    const { data: dup } = await q2.maybeSingle();
    if (!dup) return candidate;
  }
  return generateSecurePin();
}

function RoleBadge({ employee }) {
  if (employee.role === ROLES.ADMIN) {
    return <span className="badge bg-brand-500 text-white shadow-sm">Admin</span>;
  }
  if (employee.is_admin_granted) {
    return (
      <span className="badge bg-violet-100 text-violet-800 ring-1 ring-violet-200/80">Granted Admin</span>
    );
  }
  return <span className="badge bg-gray-100 text-brand-800 ring-1 ring-border">Employee</span>;
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [openLog, setOpenLog] = useState(null);
  const [payRateInput, setPayRateInput] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [payMessage, setPayMessage] = useState(null);
  const [adminToggleLoading, setAdminToggleLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordResetting, setPasswordResetting] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [pinRegenerating, setPinRegenerating] = useState(false);
  const [pinRevealOpen, setPinRevealOpen] = useState(false);
  const [revealedPin, setRevealedPin] = useState('');
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    const [userRes, logsRes] = await Promise.all([
      supabase
        .from('users')
        .select(
          'id, name, email, phone, pin, role, is_admin_granted, color, is_active, pay_rate, pay_rate_type, created_at'
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('time_logs')
        .select('id, clock_in, business_date')
        .eq('user_id', id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1),
    ]);

    if (!userRes.data) {
      setEmployee(null);
      setOpenLog(null);
      setLoading(false);
      return;
    }

    setEmployee(userRes.data);
    setPayRateInput(
      userRes.data.pay_rate != null && userRes.data.pay_rate !== ''
        ? String(Number(userRes.data.pay_rate))
        : '0'
    );
    setOpenLog(logsRes.data?.[0] || null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleSavePayRate() {
    if (!employee || !user?.isAdmin) return;
    const next = parseFloat(payRateInput);
    if (Number.isNaN(next) || next < 0) {
      setPayMessage({ type: 'error', text: 'Enter a valid hourly rate.' });
      return;
    }
    const oldNum = Number(employee.pay_rate ?? 0);
    const oldVal = String(oldNum);
    const newVal = String(next);
    if (oldNum === next) {
      setPayMessage({ type: 'info', text: 'No changes to save.' });
      return;
    }

    setPaySaving(true);
    setPayMessage(null);
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('users')
      .update({
        pay_rate: next,
        pay_rate_updated_at: now,
        pay_rate_updated_by: user.id,
      })
      .eq('id', id);

    if (updErr) {
      setPayMessage({ type: 'error', text: updErr.message });
      setPaySaving(false);
      return;
    }

    await supabase.from('admin_audit_log').insert({
      action: AUDIT_ACTIONS.UPDATE_PAY_RATE,
      performed_by: user.id,
      target_user_id: id,
      old_value: oldVal,
      new_value: newVal,
    });

    setEmployee((e) =>
      e ? { ...e, pay_rate: next, pay_rate_updated_at: now, pay_rate_updated_by: user.id } : e
    );
    setPayMessage({ type: 'success', text: 'Pay rate saved.' });
    setPaySaving(false);
  }

  async function handleAdminToggle() {
    if (!user?.isPrimaryAdmin || !employee || employee.role === ROLES.KIOSK) return;
    if (employee.role === ROLES.ADMIN) return;

    setAdminToggleLoading(true);
    setActionError(null);
    const next = !employee.is_admin_granted;
    const { error } = await supabase.from('users').update({ is_admin_granted: next }).eq('id', id);

    if (error) {
      setActionError(error.message);
      setAdminToggleLoading(false);
      return;
    }

    await supabase.from('admin_audit_log').insert({
      action: next ? AUDIT_ACTIONS.GRANT_ADMIN : AUDIT_ACTIONS.REVOKE_ADMIN,
      performed_by: user.id,
      target_user_id: id,
      old_value: String(!next),
      new_value: String(next),
    });

    setEmployee((e) => (e ? { ...e, is_admin_granted: next } : e));
    setAdminToggleLoading(false);
  }

  async function handlePasswordReset(e) {
    e.preventDefault();
    setPasswordError(null);
    if (!newPassword || newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    setPasswordResetting(true);
    const { error } = await supabase.auth.admin
      ? await supabase.auth.admin.updateUserById(id, { password: newPassword })
      : { error: { message: 'Admin API not available. Use Supabase dashboard to reset password.' } };

    if (error) {
      setPasswordError(error.message);
      setPasswordResetting(false);
      return;
    }

    setPasswordModalOpen(false);
    setNewPassword('');
    setPasswordResetting(false);
  }

  async function handleRegeneratePin() {
    setPinRegenerating(true);
    setActionError(null);
    const preferred = employee?.phone
      ? derivePinFromPhone(employee.phone)
      : generateSecurePin();
    const pin = await resolveUniquePin(preferred, id);

    if (!pin) {
      setActionError('Could not generate a unique PIN. Please try again.');
      setPinRegenerating(false);
      return;
    }

    const { error } = await supabase.from('users').update({ pin }).eq('id', id);

    if (error) {
      setActionError(error.message);
      setPinRegenerating(false);
      return;
    }

    setEmployee((prev) => (prev ? { ...prev, pin } : prev));
    setRevealedPin(pin);
    setPinRevealOpen(true);
    setPinRegenerating(false);
  }

  async function handleDeactivate() {
    if (!employee || user.id === employee.id) return;
    setDeactivateLoading(true);
    setActionError(null);

    const { error } = await supabase.from('users').update({ is_active: false }).eq('id', id);

    if (error) {
      setActionError(error.message);
      setDeactivateLoading(false);
      return;
    }

    await supabase.from('admin_audit_log').insert({
      action: AUDIT_ACTIONS.DEACTIVATE_USER,
      performed_by: user.id,
      target_user_id: id,
      old_value: 'true',
      new_value: 'false',
    });

    setDeactivateOpen(false);
    setDeactivateLoading(false);
    navigate('/admin/employees');
  }

  if (loading) {
    return (
      <>
        <TopBar title="Employee" showSettings />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  if (!employee) {
    return (
      <>
        <TopBar title="Not found" showSettings />
        <main className="max-w-5xl mx-auto px-4 py-8 pb-24">
          <Link
            to="/admin/employees"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors mb-6"
          >
            <ArrowLeft size={18} />
            Back to Employees
          </Link>
          <div className="card text-center text-muted text-sm">This employee could not be found.</div>
        </main>
      </>
    );
  }

  const isClockedIn = !!openLog;
  const showAdminAccess = user?.isPrimaryAdmin && employee.role !== ROLES.ADMIN && employee.role !== ROLES.KIOSK;

  return (
    <>
      <TopBar title={employee.name} showSettings />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-24 space-y-5">
        <Link
          to="/admin/employees"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand-600 transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Employees
        </Link>

        {actionError && (
          <Alert variant="error" title="Something went wrong">
            {actionError}
          </Alert>
        )}

        {!employee.is_active && (
          <Alert variant="warning" title="Inactive">
            This profile is inactive.
          </Alert>
        )}

        <div className="card space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <span
              className="w-4 h-4 rounded-full shrink-0 mt-1 ring-2 ring-white shadow"
              style={{ backgroundColor: employee.color || '#4F46E5' }}
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-brand-900 tracking-tight">{employee.name}</h1>
              <p className="text-sm text-muted mt-0.5 break-all">{employee.email || 'No email on file'}</p>
              {employee.phone && (
                <p className="text-sm text-muted mt-0.5 flex items-center gap-1.5">
                  <Phone size={14} className="shrink-0" />
                  {employee.phone}
                </p>
              )}
              <div className="mt-3">
                <RoleBadge employee={employee} />
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-surface/80 border border-border/80 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div
              className={`flex items-center gap-2 text-sm font-medium ${
                isClockedIn ? 'text-emerald-600' : 'text-muted'
              }`}
            >
              <Clock size={18} className={isClockedIn ? 'text-emerald-500' : 'text-muted'} />
              {isClockedIn ? (
                <span>
                  Clocked in
                  {openLog?.clock_in && (
                    <span className="text-muted font-normal ml-1">
                      · since {formatTimestamp(openLog.clock_in)}
                    </span>
                  )}
                </span>
              ) : (
                <span>Clocked out</span>
              )}
            </div>
            {employee.pin && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <KeyRound size={16} className="shrink-0" />
                Kiosk PIN: <span className="font-mono font-semibold text-brand-900 tracking-wider">{employee.pin}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => {
                setPasswordError(null);
                setNewPassword('');
                setPasswordModalOpen(true);
              }}
              disabled={!employee.is_active}
            >
              <Lock size={18} />
              Reset Password
            </button>
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={handleRegeneratePin}
              disabled={pinRegenerating || !employee.is_active}
            >
              <KeyRound size={18} />
              {pinRegenerating ? 'Regenerating…' : 'Regenerate PIN'}
            </button>
            <Link
              to={`/admin/timesheets?employee=${id}`}
              className="btn-secondary inline-flex items-center gap-2 no-underline"
            >
              <ClipboardList size={18} />
              View Timesheet
            </Link>
          </div>
        </div>

        {user?.isAdmin && (
          <div className="card space-y-4 transition-shadow hover:shadow-card-lg duration-200">
            <h2 className="text-sm font-semibold text-brand-900 flex items-center gap-2">
              Pay rate
              <span className="text-xs font-normal text-muted">($/hr)</span>
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label htmlFor="pay-rate" className="label">
                  Hourly rate
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                  <input
                    id="pay-rate"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="input-field pl-8"
                    value={payRateInput}
                    onChange={(e) => setPayRateInput(e.target.value)}
                    disabled={!employee.is_active}
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn-primary shrink-0"
                onClick={handleSavePayRate}
                disabled={paySaving || !employee.is_active}
              >
                {paySaving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {payMessage?.type === 'success' && (
              <p className="text-xs text-emerald-600 font-medium">{payMessage.text}</p>
            )}
            {payMessage?.type === 'error' && (
              <p className="text-xs text-danger-500 font-medium">{payMessage.text}</p>
            )}
            {payMessage?.type === 'info' && <p className="text-xs text-muted">{payMessage.text}</p>}
          </div>
        )}

        {showAdminAccess && (
          <div className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-shadow hover:shadow-card-lg duration-200">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-brand-50 p-2.5 text-brand-500">
                <Shield size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-brand-900">Admin access</h2>
                <p className="text-xs text-muted mt-0.5 max-w-md">
                  Grant or revoke admin privileges for this account (primary admins only).
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={employee.is_admin_granted}
              disabled={adminToggleLoading || !employee.is_active}
              onClick={handleAdminToggle}
              className={`relative inline-flex h-9 w-[3.25rem] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                employee.is_admin_granted ? 'bg-emerald-500' : 'bg-gray-200'
              } ${adminToggleLoading || !employee.is_active ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-8 w-8 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ${
                  employee.is_admin_granted ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}

        <div className="card border border-danger-500/15 bg-danger-50/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <UserX className="text-danger-500 shrink-0 mt-0.5" size={22} />
              <div>
                <h2 className="text-sm font-semibold text-brand-900">Deactivate employee</h2>
                <p className="text-xs text-muted mt-0.5">
                  They won&apos;t be able to clock in. This can be reversed in the database if needed.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-danger shrink-0"
              disabled={!employee.is_active || user.id === employee.id}
              onClick={() => setDeactivateOpen(true)}
            >
              Deactivate
            </button>
          </div>
        </div>
      </main>

      <Modal
        open={passwordModalOpen}
        onClose={() => !passwordResetting && setPasswordModalOpen(false)}
        title="Reset Password"
        size="sm"
      >
        <form onSubmit={handlePasswordReset} className="space-y-4">
          {passwordError && (
            <Alert variant="error" title="Error">
              {passwordError}
            </Alert>
          )}
          <div>
            <label htmlFor="new-password" className="label">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              className="input-field"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Min 6 characters"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => setPasswordModalOpen(false)}
              disabled={passwordResetting}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={passwordResetting}>
              {passwordResetting ? 'Saving…' : 'Save Password'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={pinRevealOpen}
        onClose={() => {
          setPinRevealOpen(false);
          setRevealedPin('');
        }}
        title="New Kiosk PIN"
        size="sm"
      >
        <p className="text-sm text-muted mb-3">
          Share this PIN with the employee for kiosk clock-in/out. It won&apos;t be shown again.
        </p>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200/80 px-4 py-4 text-center shadow-inner">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide mb-1">Kiosk PIN</p>
          <p className="text-3xl font-bold tracking-[0.2em] text-brand-900 tabular-nums">{revealedPin}</p>
        </div>
        <button
          type="button"
          className="btn-primary w-full mt-5"
          onClick={() => {
            setPinRevealOpen(false);
            setRevealedPin('');
          }}
        >
          Done
        </button>
      </Modal>

      <Modal open={deactivateOpen} onClose={() => !deactivateLoading && setDeactivateOpen(false)} title="Deactivate employee?" size="md">
        <p className="text-sm text-muted mb-5">
          <span className="font-medium text-brand-900">{employee.name}</span> will no longer appear in the active
          roster or be able to sign in.
        </p>
        <div className="flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={() => setDeactivateOpen(false)} disabled={deactivateLoading}>
            Cancel
          </button>
          <button type="button" className="btn-danger flex-1" onClick={handleDeactivate} disabled={deactivateLoading}>
            {deactivateLoading ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </Modal>
    </>
  );
}
