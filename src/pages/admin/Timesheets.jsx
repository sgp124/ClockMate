import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  getWeekRange,
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
import { Clock, Search, Filter } from 'lucide-react';

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

export default function Timesheets() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const weekDefault = useMemo(() => getWeekRange(toDateString(new Date())), []);

  const [startDate, setStartDate] = useState(weekDefault.start);
  const [endDate, setEndDate] = useState(weekDefault.end);
  const [employees, setEmployees] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState(() => searchParams.get('employee') || '');
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [formClockIn, setFormClockIn] = useState('');
  const [formClockOut, setFormClockOut] = useState('');
  const [formNote, setFormNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const urlEmployeeId = searchParams.get('employee');

  useEffect(() => {
    if (!urlEmployeeId || !employees.length) return;
    if (employees.some((e) => e.id === urlEmployeeId)) {
      setEmployeeFilter(urlEmployeeId);
    }
  }, [urlEmployeeId, employees]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('is_active', true)
        .neq('role', ROLES.KIOSK)
        .order('name');
      if (cancelled) return;
      if (!error) setEmployees(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let q = supabase
        .from('time_logs')
        .select('*, users!inner(name, color)')
        .gte('business_date', startDate)
        .lte('business_date', endDate)
        .order('business_date', { ascending: false });

      if (employeeFilter) {
        q = q.eq('user_id', employeeFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      setLogs(data || []);
    } catch (e) {
      setLoadError(e.message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, employeeFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = logs;
    if (q) {
      rows = rows.filter((l) => (l.users?.name || '').toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      if (a.business_date !== b.business_date) {
        return b.business_date.localeCompare(a.business_date);
      }
      return (b.clock_in || '').localeCompare(a.clock_in || '');
    });
  }, [logs, search]);

  function openEdit(log) {
    setSelectedLog(log);
    setFormClockIn(toDatetimeLocalValue(log.clock_in));
    setFormClockOut(log.clock_out ? toDatetimeLocalValue(log.clock_out) : '');
    setFormNote(log.note || '');
    setSaveError(null);
    setEditOpen(true);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!selectedLog || !user?.id) return;
    setSaveError(null);
    const clockInIso = fromDatetimeLocalToIso(formClockIn);
    if (!clockInIso) {
      setSaveError('Clock in is required.');
      return;
    }
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
        .eq('id', selectedLog.id);
      if (error) throw error;
      setEditOpen(false);
      setSelectedLog(null);
      await loadLogs();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar title="Timesheets" showSettings />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {loadError && (
          <Alert variant="error" title="Could not load timesheets">
            {loadError}
          </Alert>
        )}

        <div className="card space-y-4 transition-shadow">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
            <div className="grid grid-cols-2 gap-3 flex-1 min-w-0">
              <div>
                <label className="label">Start date</label>
                <input
                  type="date"
                  className="input-field transition-all"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">End date</label>
                <input
                  type="date"
                  className="input-field transition-all"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="sm:min-w-[200px]">
              <label className="label flex items-center gap-1.5">
                <Filter size={14} className="text-muted" />
                Employee
              </label>
              <select
                className="input-field transition-all cursor-pointer"
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
              >
                <option value="">All employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              type="search"
              placeholder="Search by employee name…"
              className="input-field pl-10 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="card overflow-hidden p-0 transition-shadow">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : filteredSorted.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No time entries"
              description="Adjust the date range or filters to see clock records."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Business date</th>
                    <th className="px-4 py-3 tabular-nums">Clock in</th>
                    <th className="px-4 py-3 tabular-nums">Clock out</th>
                    <th className="px-4 py-3 tabular-nums">Duration</th>
                    <th className="px-4 py-3 w-24">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((log) => {
                    const hours = calcDurationHours(log.clock_in, log.clock_out);
                    return (
                      <tr
                        key={log.id}
                        onClick={() => openEdit(log)}
                        className={cn(
                          'border-b border-border last:border-0 cursor-pointer transition-colors',
                          'hover:bg-brand-50/40 active:bg-brand-50/60'
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-brand-900">{log.users?.name}</td>
                        <td className="px-4 py-3 text-muted">{formatDate(log.business_date)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatTimestamp(log.clock_in)}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {log.clock_out ? formatTimestamp(log.clock_out) : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums font-medium">{formatDuration(hours)}</td>
                        <td className="px-4 py-3 text-base leading-none">
                          <span className="inline-flex items-center gap-1.5">
                            {log.auto_clockout && (
                              <span title="Auto clock-out" role="img" aria-label="Auto clock-out">
                                ⚠️
                              </span>
                            )}
                            {(log.forgot_flag || !log.clock_out) && (
                              <span title="Forgot / open" role="img" aria-label="Forgot or open shift">
                                🔴
                              </span>
                            )}
                            {log.edited_by != null && (
                              <span title="Edited" role="img" aria-label="Edited">
                                ✏️
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Modal
        open={editOpen}
        onClose={() => !saving && setEditOpen(false)}
        title="Edit time entry"
        size="md"
      >
        {selectedLog && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <p className="text-sm text-muted">Employee</p>
              <p className="font-semibold text-brand-900">{selectedLog.users?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Business date</p>
              <p className="font-medium text-brand-900">{formatDateFull(selectedLog.business_date)}</p>
            </div>
            <div>
              <label className="label">Clock in</label>
              <input
                type="datetime-local"
                className="input-field transition-all"
                value={formClockIn}
                onChange={(e) => setFormClockIn(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Clock out</label>
              <input
                type="datetime-local"
                className="input-field transition-all"
                value={formClockOut}
                onChange={(e) => setFormClockOut(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Note</label>
              <textarea
                className="input-field resize-none min-h-[88px] transition-all"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                rows={3}
              />
            </div>
            {saveError && (
              <Alert variant="error" title="Save failed">
                {saveError}
              </Alert>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary flex-1 transition-all"
                disabled={saving}
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1 transition-all" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
