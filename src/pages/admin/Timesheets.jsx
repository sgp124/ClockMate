import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatDate,
  formatDateFull,
  formatTimestamp,
  calcDurationHours,
  formatDuration,
  toDateString,
  cn,
} from '../../lib/helpers';
import { ROLES } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Alert from '../../components/ui/Alert';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Users,
  ArrowLeft,
  DollarSign,
} from 'lucide-react';

const ANCHOR = new Date('2026-03-23T00:00:00');
const PERIOD_DAYS = 14;
const MS_PER_DAY = 86400000;

function getPeriodStart(offset) {
  const d = new Date(ANCHOR);
  d.setDate(d.getDate() + offset * PERIOD_DAYS);
  return d;
}

function dateToPeriodOffset(date) {
  const target = new Date(date + 'T00:00:00');
  const diffDays = Math.floor((target - ANCHOR) / MS_PER_DAY);
  return Math.floor(diffDays / PERIOD_DAYS);
}

function getPeriodRange(offset) {
  const start = getPeriodStart(offset);
  const end = new Date(start);
  end.setDate(start.getDate() + PERIOD_DAYS - 1);
  return { start: toDateString(start), end: toDateString(end) };
}

function formatPeriodLabel(offset) {
  const { start, end } = getPeriodRange(offset);
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sameYear = s.getFullYear() === e.getFullYear();
  const sMonth = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eMonth = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = e.getFullYear();
  return sameYear
    ? `${sMonth} – ${eMonth}, ${year}`
    : `${sMonth}, ${s.getFullYear()} – ${eMonth}, ${year}`;
}

function getDatesInPeriod(offset) {
  const start = getPeriodStart(offset);
  return Array.from({ length: PERIOD_DAYS }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toDateString(d);
  });
}

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromDatetimeLocalToIso(localStr) {
  if (!localStr) return null;
  return new Date(localStr).toISOString();
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function Timesheets() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin;

  const [periodOffset, setPeriodOffset] = useState(() => dateToPeriodOffset(toDateString(new Date())));
  const [employees, setEmployees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editLog, setEditLog] = useState(null);
  const [formClockIn, setFormClockIn] = useState('');
  const [formClockOut, setFormClockOut] = useState('');
  const [formNote, setFormNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addEmployee, setAddEmployee] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addClockIn, setAddClockIn] = useState('');
  const [addClockOut, setAddClockOut] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);

  const period = useMemo(() => getPeriodRange(periodOffset), [periodOffset]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, color, role, pay_rate')
        .eq('is_active', true)
        .neq('role', ROLES.KIOSK)
        .neq('role', ROLES.ADMIN)
        .order('name');
      if (cancelled) return;
      if (!error) setEmployees(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('time_logs')
        .select('*, users:user_id(name, color)')
        .gte('business_date', period.start)
        .lte('business_date', period.end)
        .order('business_date', { ascending: true })
        .order('clock_in', { ascending: true });
      if (error) throw error;
      setLogs(data || []);
    } catch (e) {
      setLoadError(e.message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [period.start, period.end]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const employeeSummaries = useMemo(() => {
    const map = {};
    employees.forEach((emp) => {
      map[emp.id] = { ...emp, totalHours: 0, entryCount: 0 };
    });
    logs.forEach((log) => {
      if (map[log.user_id]) {
        map[log.user_id].totalHours += calcDurationHours(log.clock_in, log.clock_out);
        map[log.user_id].entryCount += 1;
      }
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, logs]);

  const selectedLogs = useMemo(() => {
    if (!selectedEmployee) return [];
    return logs
      .filter((l) => l.user_id === selectedEmployee.id)
      .sort((a, b) => {
        if (a.business_date !== b.business_date) return a.business_date.localeCompare(b.business_date);
        return (a.clock_in || '').localeCompare(b.clock_in || '');
      });
  }, [logs, selectedEmployee]);

  const dailyBreakdown = useMemo(() => {
    const dates = getDatesInPeriod(periodOffset);
    const byDate = {};
    dates.forEach((d) => { byDate[d] = []; });
    selectedLogs.forEach((log) => {
      if (byDate[log.business_date]) {
        byDate[log.business_date].push(log);
      }
    });
    return dates.map((d) => ({
      date: d,
      entries: byDate[d],
      dayTotal: byDate[d].reduce((sum, l) => sum + calcDurationHours(l.clock_in, l.clock_out), 0),
    }));
  }, [selectedLogs, periodOffset]);

  const periodTotal = useMemo(
    () => selectedLogs.reduce((sum, l) => sum + calcDurationHours(l.clock_in, l.clock_out), 0),
    [selectedLogs]
  );

  function openEmployeeDetail(emp) {
    setSelectedEmployee(emp);
    setDetailOpen(true);
  }

  function openEditModal(log) {
    setEditLog(log);
    setFormClockIn(toDatetimeLocalValue(log.clock_in));
    setFormClockOut(log.clock_out ? toDatetimeLocalValue(log.clock_out) : '');
    setFormNote(log.note || '');
    setSaveError(null);
    setEditOpen(true);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editLog || !user?.id) return;
    setSaveError(null);
    const clockInIso = fromDatetimeLocalToIso(formClockIn);
    if (!clockInIso) { setSaveError('Clock in is required.'); return; }
    const clockOutIso = formClockOut.trim() ? fromDatetimeLocalToIso(formClockOut) : null;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('time_logs')
        .update({
          clock_in: clockInIso,
          clock_out: clockOutIso,
          note: formNote.trim() || null,
          edited_by: user.id,
        })
        .eq('id', editLog.id);
      if (error) throw error;
      setEditOpen(false);
      setEditLog(null);
      await loadLogs();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openAddModal() {
    setAddEmployee('');
    setAddDate('');
    setAddClockIn('');
    setAddClockOut('');
    setAddNote('');
    setAddError(null);
    setAddOpen(true);
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    if (!user?.id) return;
    setAddError(null);
    if (!addEmployee) { setAddError('Select an employee.'); return; }
    if (!addDate) { setAddError('Date is required.'); return; }
    const clockInIso = fromDatetimeLocalToIso(addClockIn);
    if (!clockInIso) { setAddError('Clock in is required.'); return; }
    const clockOutIso = addClockOut.trim() ? fromDatetimeLocalToIso(addClockOut) : null;
    setAddSaving(true);
    try {
      const { error } = await supabase.from('time_logs').insert({
        user_id: addEmployee,
        business_date: addDate,
        clock_in: clockInIso,
        clock_out: clockOutIso,
        note: addNote.trim() || null,
        edited_by: user.id,
      });
      if (error) throw error;
      setAddOpen(false);
      await loadLogs();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <>
      <TopBar title="Timesheets" showSettings />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {loadError && (
          <Alert variant="error" title="Could not load timesheets">{loadError}</Alert>
        )}

        {/* Period Selector */}
        <div className="card flex items-center justify-between gap-4">
          <button
            onClick={() => setPeriodOffset((p) => p - 1)}
            className="btn-secondary !p-2 rounded-full hover:scale-105 transition-transform"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center min-w-0">
            <p className="text-lg font-semibold text-brand-900 tracking-tight">
              {formatPeriodLabel(periodOffset)}
            </p>
            <p className="text-xs text-muted mt-0.5">Biweekly Pay Period</p>
          </div>
          <button
            onClick={() => setPeriodOffset((p) => p + 1)}
            className="btn-secondary !p-2 rounded-full hover:scale-105 transition-transform"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Employee List */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : employeeSummaries.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No employees"
            description="No active employees found."
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
                Employees ({employeeSummaries.length})
              </h2>
              {isAdmin && (
                <button onClick={openAddModal} className="btn-primary !py-1.5 !px-3 !text-sm flex items-center gap-1.5">
                  <Plus size={16} />
                  Add Entry
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {employeeSummaries.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => openEmployeeDetail(emp)}
                  className={cn(
                    'card !p-4 text-left w-full transition-all duration-200',
                    'hover:shadow-md hover:-translate-y-0.5 hover:border-brand-200',
                    'active:translate-y-0 active:shadow-sm'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                        style={{ backgroundColor: emp.color || '#94A3B8' }}
                      />
                      <span className="font-semibold text-brand-900 truncate">{emp.name}</span>
                    </div>
                    <ChevronRight size={18} className="text-muted flex-shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center gap-4 mt-3 ml-6">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Clock size={14} className="text-muted" />
                      <span className="tabular-nums font-medium text-brand-800">
                        {formatDuration(emp.totalHours)}
                      </span>
                      <span className="text-muted">hrs</span>
                    </div>
                    {emp.pay_rate > 0 && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <DollarSign size={14} className="text-muted" />
                        <span className="tabular-nums font-medium text-emerald-700">
                          {(emp.totalHours * emp.pay_rate).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <span className="text-xs text-muted ml-auto">
                      {emp.entryCount} {emp.entryCount === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Employee Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedEmployee ? `${selectedEmployee.name} — Timesheet` : 'Timesheet'}
        size="xl"
      >
        {selectedEmployee && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: selectedEmployee.color || '#94A3B8' }}
                />
                <span className="text-muted">{formatPeriodLabel(periodOffset)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-semibold text-brand-900">
                  {formatDuration(periodTotal)} hrs
                </span>
                {selectedEmployee.pay_rate > 0 && (
                  <span className="tabular-nums font-semibold text-emerald-700">
                    ${(periodTotal * selectedEmployee.pay_rate).toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-3">Day</th>
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3 tabular-nums">Clock In</th>
                    <th className="pb-2 pr-3 tabular-nums">Clock Out</th>
                    <th className="pb-2 pr-3 tabular-nums text-right">Hours</th>
                    <th className="pb-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {dailyBreakdown.map(({ date, entries, dayTotal }) => {
                    if (entries.length === 0) {
                      return (
                        <tr key={date} className="border-b border-border/50 text-muted/60">
                          <td className="py-2 pr-3 text-xs">{dayLabel(date)}</td>
                          <td className="py-2 pr-3 text-xs">{formatDate(date)}</td>
                          <td className="py-2 pr-3 tabular-nums text-xs">—</td>
                          <td className="py-2 pr-3 tabular-nums text-xs">—</td>
                          <td className="py-2 pr-3 tabular-nums text-xs text-right">—</td>
                          <td className="py-2"></td>
                        </tr>
                      );
                    }

                    return entries.map((log, idx) => {
                      const hours = calcDurationHours(log.clock_in, log.clock_out);
                      const isLast = idx === entries.length - 1;
                      const showSubtotal = entries.length > 1 && isLast;
                      return (
                        <tr
                          key={log.id}
                          onClick={() => isAdmin && openEditModal(log)}
                          className={cn(
                            'border-b border-border/50 transition-colors',
                            isAdmin && 'cursor-pointer hover:bg-brand-50/40 active:bg-brand-50/60'
                          )}
                        >
                          <td className="py-2.5 pr-3 text-xs font-medium text-muted">
                            {idx === 0 ? dayLabel(date) : ''}
                          </td>
                          <td className="py-2.5 pr-3 text-brand-900">
                            {idx === 0 ? formatDate(date) : ''}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">{formatTimestamp(log.clock_in)}</td>
                          <td className="py-2.5 pr-3 tabular-nums">
                            {log.clock_out ? formatTimestamp(log.clock_out) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums font-medium text-right">
                            {formatDuration(hours)}
                            {showSubtotal && (
                              <span className="block text-xs text-muted font-normal mt-0.5">
                                Day: {formatDuration(dayTotal)}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-base leading-none">
                            <span className="inline-flex items-center gap-1">
                              {log.auto_clockout && <span title="Auto clock-out">⚠️</span>}
                              {(log.forgot_flag || !log.clock_out) && <span title="Forgot / open">🔴</span>}
                              {log.edited_by != null && <span title="Edited">✏️</span>}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-200">
                    <td colSpan={4} className="py-3 pr-3 font-semibold text-brand-900 text-right">
                      Total Paid Hours
                    </td>
                    <td className="py-3 pr-3 tabular-nums font-bold text-brand-900 text-right">
                      {formatDuration(periodTotal)}
                    </td>
                    <td></td>
                  </tr>
                  {selectedEmployee.pay_rate > 0 && (
                    <tr>
                      <td colSpan={4} className="pb-1 pr-3 text-sm text-muted text-right">
                        @ ${selectedEmployee.pay_rate.toFixed(2)}/hr
                      </td>
                      <td className="pb-1 pr-3 tabular-nums font-bold text-emerald-700 text-right">
                        ${(periodTotal * selectedEmployee.pay_rate).toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Entry Modal */}
      <Modal
        open={editOpen}
        onClose={() => !saving && setEditOpen(false)}
        title="Edit Time Entry"
        size="md"
      >
        {editLog && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <p className="text-sm text-muted">Employee</p>
              <p className="font-semibold text-brand-900">{editLog.users?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Business Date</p>
              <p className="font-medium text-brand-900">{formatDateFull(editLog.business_date)}</p>
            </div>
            <div>
              <label className="label">Clock In</label>
              <input
                type="datetime-local"
                className="input-field"
                value={formClockIn}
                onChange={(e) => setFormClockIn(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Clock Out</label>
              <input
                type="datetime-local"
                className="input-field"
                value={formClockOut}
                onChange={(e) => setFormClockOut(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Note</label>
              <textarea
                className="input-field resize-none min-h-[80px]"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                rows={3}
              />
            </div>
            {saveError && <Alert variant="error" title="Save failed">{saveError}</Alert>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                disabled={saving}
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add Entry Modal */}
      <Modal
        open={addOpen}
        onClose={() => !addSaving && setAddOpen(false)}
        title="Add Time Entry"
        size="md"
      >
        <form onSubmit={handleAddEntry} className="space-y-4">
          <div>
            <label className="label">Employee</label>
            <select
              className="input-field"
              value={addEmployee}
              onChange={(e) => setAddEmployee(e.target.value)}
              required
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input-field"
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Clock In</label>
            <input
              type="datetime-local"
              className="input-field"
              value={addClockIn}
              onChange={(e) => setAddClockIn(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Clock Out</label>
            <input
              type="datetime-local"
              className="input-field"
              value={addClockOut}
              onChange={(e) => setAddClockOut(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Note</label>
            <textarea
              className="input-field resize-none min-h-[80px]"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
              rows={3}
            />
          </div>
          {addError && <Alert variant="error" title="Could not add entry">{addError}</Alert>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              disabled={addSaving}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={addSaving}>
              {addSaving ? 'Adding…' : 'Add Entry'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
