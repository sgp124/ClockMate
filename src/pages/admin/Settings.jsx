import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PAY_PERIOD_TYPES, DAYS_OF_WEEK } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import { Settings as SettingsIcon, Shield } from 'lucide-react';

function toTimeInputValue(t) {
  if (!t) return '';
  const parts = String(t).split(':');
  return `${String(parts[0]).padStart(2, '0')}:${String(parts[1] || '0').padStart(2, '0')}`;
}

function timeInputToDb(v) {
  if (!v) return '00:00:00';
  return v.length === 5 ? `${v}:00` : v;
}

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [form, setForm] = useState({
    store_name: '',
    pay_period_type: 'biweekly',
    pay_period_start_day: 1,
    business_day_start: '10:00',
    auto_clockout_time: '03:30',
    max_shift_length_hours: 12,
  });

  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    if (!error && data) {
      setRowId(data.id);
      setForm({
        store_name: data.store_name || '',
        pay_period_type: data.pay_period_type || 'biweekly',
        pay_period_start_day:
          typeof data.pay_period_start_day === 'number' ? data.pay_period_start_day : 1,
        business_day_start: toTimeInputValue(data.business_day_start),
        auto_clockout_time: toTimeInputValue(data.auto_clockout_time),
        max_shift_length_hours: data.max_shift_length_hours ?? 12,
      });
    }
    setLoading(false);
  }, []);

  const loadAudit = useCallback(async () => {
    if (!user?.isPrimaryAdmin) return;
    setAuditLoading(true);
    const { data, error } = await supabase
      .from('admin_audit_log')
      .select(
        `*,
        performer:users!admin_audit_log_performed_by_fkey(name),
        target:users!admin_audit_log_target_user_id_fkey(name)`
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setAudit(data || []);
    setAuditLoading(false);
  }, [user?.isPrimaryAdmin]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  async function handleSave(e) {
    e.preventDefault();
    if (!rowId) return;
    setSaving(true);
    setSaveSuccess(false);
    const payload = {
      store_name: form.store_name.trim() || 'My Store',
      pay_period_type: form.pay_period_type,
      pay_period_start_day: Number(form.pay_period_start_day),
      business_day_start: timeInputToDb(form.business_day_start),
      auto_clockout_time: timeInputToDb(form.auto_clockout_time),
      max_shift_length_hours: Math.max(1, Number(form.max_shift_length_hours) || 12),
    };
    const { error } = await supabase.from('settings').update(payload).eq('id', rowId);
    setSaving(false);
    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Settings" showSettings />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Settings" showSettings />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-6">
        {saveSuccess && (
          <Alert variant="success" title="Settings saved">
            Your store configuration has been updated.
          </Alert>
        )}

        <form onSubmit={handleSave} className="card shadow-card-lg space-y-5 transition-shadow">
          <div className="flex items-center gap-2 text-brand-900">
            <div className="rounded-full bg-brand-50 p-2">
              <SettingsIcon size={20} className="text-brand-500" />
            </div>
            <h2 className="text-lg font-bold">Store configuration</h2>
          </div>

          <div>
            <label className="label" htmlFor="store_name">
              Store name
            </label>
            <input
              id="store_name"
              type="text"
              value={form.store_name}
              onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
              className="input-field"
              autoComplete="organization"
            />
          </div>

          <div>
            <label className="label" htmlFor="pay_period_type">
              Pay period type
            </label>
            <select
              id="pay_period_type"
              value={form.pay_period_type}
              onChange={(e) => setForm((f) => ({ ...f, pay_period_type: e.target.value }))}
              className="input-field"
            >
              {PAY_PERIOD_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="pay_period_start_day">
              Pay period start day
            </label>
            <select
              id="pay_period_start_day"
              value={form.pay_period_start_day}
              onChange={(e) =>
                setForm((f) => ({ ...f, pay_period_start_day: Number(e.target.value) }))
              }
              className="input-field"
            >
              {DAYS_OF_WEEK.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="business_day_start">
                Business day start
              </label>
              <input
                id="business_day_start"
                type="time"
                value={form.business_day_start}
                onChange={(e) =>
                  setForm((f) => ({ ...f, business_day_start: e.target.value }))
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="label" htmlFor="auto_clockout_time">
                Auto clock-out time
              </label>
              <input
                id="auto_clockout_time"
                type="time"
                value={form.auto_clockout_time}
                onChange={(e) =>
                  setForm((f) => ({ ...f, auto_clockout_time: e.target.value }))
                }
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="max_shift_length_hours">
              Max shift length alert (hours)
            </label>
            <input
              id="max_shift_length_hours"
              type="number"
              min={1}
              max={24}
              step={1}
              value={form.max_shift_length_hours}
              onChange={(e) =>
                setForm((f) => ({ ...f, max_shift_length_hours: e.target.value }))
              }
              className="input-field"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary inline-flex items-center justify-center gap-2 min-w-[140px]"
            >
              {saving ? <Spinner size="sm" className="text-white" /> : null}
              Save changes
            </button>
          </div>
        </form>

        {user?.isPrimaryAdmin && (
          <section className="card shadow-card-lg space-y-4">
            <div className="flex items-center gap-2 text-brand-900">
              <div className="rounded-full bg-violet-50 p-2">
                <Shield size={20} className="text-violet-600" />
              </div>
              <h2 className="text-lg font-bold">Admin audit log</h2>
            </div>

            {auditLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : audit.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No audit entries yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-gray-50/90 border-b border-border">
                      <th className="px-3 py-2.5 font-semibold text-brand-900 whitespace-nowrap">
                        Date
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-brand-900">Action</th>
                      <th className="px-3 py-2.5 font-semibold text-brand-900">
                        Performed by
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-brand-900">
                        Target user
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-brand-900">Old</th>
                      <th className="px-3 py-2.5 font-semibold text-brand-900">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/80 last:border-0 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap tabular-nums">
                          {new Date(row.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-brand-900">
                          {row.action}
                        </td>
                        <td className="px-3 py-2.5 text-brand-800">
                          {row.performer?.name || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-brand-800">
                          {row.target?.name || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted max-w-[140px] truncate" title={row.old_value || ''}>
                          {row.old_value || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted max-w-[140px] truncate" title={row.new_value || ''}>
                          {row.new_value || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
