import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { hashPassword, derivePinFromPhone, generateRandomPin, getBusinessDate, cn } from '../../lib/helpers';
import { EMPLOYEE_COLORS, ROLES, AUDIT_ACTIONS } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Alert from '../../components/ui/Alert';
import { Users, UserPlus, Search, ChevronRight } from 'lucide-react';

async function resolveUniquePin(preferredPin) {
  const { data: conflict } = await supabase
    .from('users').select('id').eq('pin', preferredPin).eq('is_active', true).maybeSingle();
  if (!conflict) return preferredPin;
  for (let i = 0; i < 20; i++) {
    const candidate = generateRandomPin();
    const { data: dup } = await supabase
      .from('users').select('id').eq('pin', candidate).eq('is_active', true).maybeSingle();
    if (!dup) return candidate;
  }
  return null;
}

function RoleBadge({ employee }) {
  if (employee.role === ROLES.ADMIN) {
    return <span className="badge shrink-0 bg-brand-500 text-white shadow-sm">Admin</span>;
  }
  if (employee.is_admin_granted) {
    return (
      <span className="badge shrink-0 bg-violet-100 text-violet-800 ring-1 ring-violet-200/80">
        Granted Admin
      </span>
    );
  }
  return (
    <span className="badge shrink-0 bg-gray-100 text-brand-800 ring-1 ring-border">Employee</span>
  );
}

export default function Employees() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [clockedUserIds, setClockedUserIds] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [pinRevealOpen, setPinRevealOpen] = useState(false);
  const [revealedPin, setRevealedPin] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: ROLES.EMPLOYEE });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    const [settingsRes, usersRes, logsRes] = await Promise.all([
      supabase.from('settings').select('business_day_start').limit(1).single(),
      supabase
        .from('users')
        .select('id, name, email, role, is_admin_granted, color, is_active')
        .eq('is_active', true)
        .neq('role', ROLES.KIOSK)
        .order('name'),
      supabase.from('time_logs').select('user_id, business_date').is('clock_out', null),
    ]);

    const startHour = settingsRes.data?.business_day_start
      ? parseInt(settingsRes.data.business_day_start, 10)
      : 10;
    const businessDate = getBusinessDate(new Date(), Number.isFinite(startHour) ? startHour : 10);

    const openToday = new Set(
      (logsRes.data || [])
        .filter((l) => l.business_date === businessDate)
        .map((l) => l.user_id)
    );

    setClockedUserIds(openToday);
    setEmployees(usersRes.data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name?.toLowerCase().includes(q));
  }, [employees, search]);

  function openAddModal() {
    setForm({ name: '', email: '', phone: '', password: '', role: ROLES.EMPLOYEE });
    setFormError(null);
    setAddOpen(true);
  }

  async function handleCreateEmployee(e) {
    e.preventDefault();
    setFormError(null);
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const password = form.password;

    if (!name) { setFormError('Name is required.'); return; }
    if (!email) { setFormError('Email is required.'); return; }
    if (!phone) { setFormError('Phone number is required.'); return; }
    if (!password || password.length < 6) { setFormError('Password must be at least 6 characters.'); return; }

    setSaving(true);
    try {
      const { count, error: countErr } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      if (countErr) throw countErr;

      const preferredPin = derivePinFromPhone(phone);
      const pin = await resolveUniquePin(preferredPin);
      if (!pin) throw new Error('Could not generate a unique PIN. Please try again.');

      const color = EMPLOYEE_COLORS[(count ?? 0) % EMPLOYEE_COLORS.length];

      const { data: inserted, error: insertErr } = await supabase
        .from('users')
        .insert({
          name,
          email,
          phone,
          password: hashPassword(password),
          pin,
          role: form.role,
          color,
          is_active: true,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      await supabase.from('admin_audit_log').insert({
        action: AUDIT_ACTIONS.CREATE_USER,
        performed_by: user.id,
        target_user_id: inserted.id,
        old_value: null,
        new_value: JSON.stringify({ name, email, phone, role: form.role }),
      });

      setAddOpen(false);
      setRevealedPin(pin);
      setPinRevealOpen(true);
      await loadEmployees();
    } catch (err) {
      setFormError(err.message || 'Could not create employee.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Employees" showSettings />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Employees" showSettings />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-24">
        <div className="flex justify-end mb-4">
          <button type="button" onClick={openAddModal} className="btn-primary gap-2 shadow-card">
            <UserPlus size={18} />
            Add Employee
          </button>
        </div>
        <div className="relative max-w-md mb-5">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            size={18}
          />
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
            autoComplete="off"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Users}
              title={search.trim() ? 'No matches' : 'No employees yet'}
              description={
                search.trim()
                  ? 'Try a different search.'
                  : 'Add your first team member to get started.'
              }
              action={
                !search.trim() && (
                  <button type="button" onClick={openAddModal} className="btn-primary">
                    Add Employee
                  </button>
                )
              }
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((emp) => {
              const isClocked = clockedUserIds.has(emp.id);
              return (
                <li key={emp.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/employees/${emp.id}`)}
                    className={cn(
                      'card w-full text-left flex items-center gap-4',
                      'hover:shadow-card-lg transition-shadow duration-200',
                      'active:scale-[0.995]'
                    )}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                      style={{ backgroundColor: emp.color || '#4F46E5' }}
                      title="Color"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-brand-900 truncate">{emp.name}</span>
                        <RoleBadge employee={emp} />
                      </div>
                      {emp.email && (
                        <p className="text-xs text-muted truncate mt-0.5">{emp.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full transition-colors',
                            isClocked ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]' : 'bg-gray-300'
                          )}
                        />
                        <span className={isClocked ? 'text-emerald-600' : 'text-muted hidden sm:inline'}>
                          {isClocked ? 'In' : 'Out'}
                        </span>
                      </span>
                      <ChevronRight size={18} className="text-muted" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Modal open={addOpen} onClose={() => !saving && setAddOpen(false)} title="Add Employee" size="md">
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          {formError && (
            <Alert variant="error" title="Error">
              {formError}
            </Alert>
          )}
          <div>
            <label htmlFor="emp-name" className="label">
              Name
            </label>
            <input
              id="emp-name"
              className="input-field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="emp-email" className="label">
              Email
            </label>
            <input
              id="emp-email"
              type="email"
              className="input-field"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="emp-phone" className="label">
              Phone <span className="text-xs text-muted font-normal">(last 4 digits = kiosk PIN)</span>
            </label>
            <input
              id="emp-phone"
              type="tel"
              className="input-field"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              required
              autoComplete="tel"
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <label htmlFor="emp-password" className="label">
              Password
            </label>
            <input
              id="emp-password"
              type="password"
              className="input-field"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Min 6 characters"
            />
          </div>
          <div>
            <label htmlFor="emp-role" className="label">
              Role
            </label>
            <select
              id="emp-role"
              className="input-field"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value={ROLES.EMPLOYEE}>Employee</option>
              <option value={ROLES.ADMIN}>Admin</option>
            </select>
          </div>
          <p className="text-xs text-muted">
            A kiosk PIN will be derived from the phone number. You&apos;ll see it once after saving.
          </p>
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
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
        title="Kiosk PIN created"
        size="sm"
      >
        <p className="text-sm text-muted mb-3">
          Share this PIN with the employee for kiosk clock-in/out. It won&apos;t be shown again.
        </p>
        <div className="rounded-xl bg-brand-50 border border-brand-200/80 px-4 py-4 text-center shadow-inner">
          <p className="text-xs font-medium text-brand-600 uppercase tracking-wide mb-1">Kiosk PIN</p>
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
    </>
  );
}
