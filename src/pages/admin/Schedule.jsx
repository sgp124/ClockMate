import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatTime,
  toDateString,
  getWeekRange,
  cn,
} from '../../lib/helpers';
import { SHIFT_STATUS, ROLES, DAYS_OF_WEEK } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Copy,
  Send,
  Trash2,
  Calendar,
} from 'lucide-react';

const WEEKDAY_MON_SUN = [...DAYS_OF_WEEK.slice(1), DAYS_OF_WEEK[0]];

function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return toDateString(d);
}

function formatWeekRangeLabel(startStr, endStr) {
  const a = new Date(startStr + 'T12:00:00');
  const b = new Date(endStr + 'T12:00:00');
  const opts = { month: 'short', day: 'numeric' };
  const left = a.toLocaleDateString('en-US', opts);
  const right = b.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${left} – ${right}`;
}

function toTimeInputValue(t) {
  if (!t) return '';
  const parts = t.split(':');
  return `${String(parts[0]).padStart(2, '0')}:${String(parts[1] || '0').padStart(2, '0')}`;
}

function shiftDurationHours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh * 60 + (sm || 0);
  let e = eh * 60 + (em || 0);
  if (e < s) e += 24 * 60;
  return (e - s) / 60;
}

function isDateInApprovedTimeOff(dateStr, requests) {
  return requests.some(
    (r) => dateStr >= r.start_date && dateStr <= r.end_date
  );
}

export default function Schedule() {
  const { user } = useAuth();
  const [weekAnchor, setWeekAnchor] = useState(() => toDateString(new Date()));
  const week = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [timeOffApproved, setTimeOffApproved] = useState([]);
  const [clockedInIds, setClockedInIds] = useState(() => new Set());

  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [modalUserId, setModalUserId] = useState(null);
  const [modalDate, setModalDate] = useState(null);
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('17:00');
  const [formNote, setFormNote] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishSaving, setPublishSaving] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const fetchGen = useRef(0);

  const loadSchedule = useCallback(async () => {
    const gen = ++fetchGen.current;
    setLoading(true);
    const start = week.start;
    const end = week.end;

    const [usersRes, shiftsRes, timeOffRes, logsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, name, color, role, is_admin_granted, is_active')
        .eq('is_active', true)
        .neq('role', ROLES.KIOSK)
        .order('name'),
      supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', start)
        .lte('shift_date', end)
        .order('start_time'),
      supabase
        .from('time_off_requests')
        .select('id, user_id, start_date, end_date, status')
        .eq('status', 'approved')
        .lte('start_date', end)
        .gte('end_date', start),
      supabase.from('time_logs').select('user_id').is('clock_out', null),
    ]);

    if (gen !== fetchGen.current) return;

    setEmployees(usersRes.data || []);
    setShifts(shiftsRes.data || []);
    setTimeOffApproved(timeOffRes.data || []);
    setClockedInIds(new Set((logsRes.data || []).map((l) => l.user_id)));
    setLoading(false);
  }, [week.start, week.end]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const shiftsByUserDate = useMemo(() => {
    const map = new Map();
    for (const s of shifts) {
      const key = `${s.user_id}|${s.shift_date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [shifts]);

  const timeOffByUser = useMemo(() => {
    const map = new Map();
    for (const r of timeOffApproved) {
      if (!map.has(r.user_id)) map.set(r.user_id, []);
      map.get(r.user_id).push(r);
    }
    return map;
  }, [timeOffApproved]);

  const weekDraftShifts = useMemo(
    () =>
      shifts.filter(
        (s) =>
          s.status === SHIFT_STATUS.DRAFT && week.dates.includes(s.shift_date)
      ),
    [shifts, week.dates]
  );

  const draftCount = weekDraftShifts.length;

  const weekTotals = useMemo(() => {
    let hours = 0;
    for (const s of shifts) {
      if (!week.dates.includes(s.shift_date)) continue;
      hours += shiftDurationHours(s.start_time, s.end_time);
    }
    return { shiftCount: shifts.length, hours };
  }, [shifts, week.dates]);

  const publishPreview = useMemo(() => {
    const uniq = new Set(weekDraftShifts.map((s) => s.user_id));
    let h = 0;
    for (const s of weekDraftShifts) {
      h += shiftDurationHours(s.start_time, s.end_time);
    }
    return {
      shifts: weekDraftShifts.length,
      employees: uniq.size,
      hours: h,
    };
  }, [weekDraftShifts]);

  function openAddShift(empId, dateStr) {
    const hasPto = isDateInApprovedTimeOff(
      dateStr,
      timeOffByUser.get(empId) || []
    );
    if (hasPto) return;
    setEditingShift(null);
    setModalUserId(empId);
    setModalDate(dateStr);
    setFormStart('09:00');
    setFormEnd('17:00');
    setFormNote('');
    setShiftModalOpen(true);
  }

  function openEditShift(shift) {
    setEditingShift(shift);
    setModalUserId(shift.user_id);
    setModalDate(shift.shift_date);
    setFormStart(toTimeInputValue(shift.start_time));
    setFormEnd(toTimeInputValue(shift.end_time));
    setFormNote(shift.note || '');
    setShiftModalOpen(true);
  }

  async function saveShift() {
    if (!modalUserId || !modalDate || !user?.id) return;
    setFormSaving(true);
    try {
      const payload = {
        user_id: modalUserId,
        shift_date: modalDate,
        start_time: formStart.length === 5 ? `${formStart}:00` : formStart,
        end_time: formEnd.length === 5 ? `${formEnd}:00` : formEnd,
        note: formNote.trim() || null,
        status: SHIFT_STATUS.DRAFT,
        created_by: user.id,
      };
      if (editingShift) {
        const { error } = await supabase
          .from('shifts')
          .update({
            start_time: payload.start_time,
            end_time: payload.end_time,
            note: payload.note,
          })
          .eq('id', editingShift.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shifts').insert(payload);
        if (error) throw error;
      }
      setShiftModalOpen(false);
      await loadSchedule();
    } catch (e) {
      console.error(e);
    } finally {
      setFormSaving(false);
    }
  }

  async function deleteShift() {
    if (!editingShift) return;
    setFormSaving(true);
    try {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('id', editingShift.id);
      if (error) throw error;
      setShiftModalOpen(false);
      await loadSchedule();
    } catch (e) {
      console.error(e);
    } finally {
      setFormSaving(false);
    }
  }

  async function handlePublish() {
    setPublishSaving(true);
    try {
      const { error } = await supabase
        .from('shifts')
        .update({ status: SHIFT_STATUS.PUBLISHED })
        .in('shift_date', week.dates)
        .eq('status', SHIFT_STATUS.DRAFT);
      if (error) throw error;
      setPublishOpen(false);
      await loadSchedule();
    } catch (e) {
      console.error(e);
    } finally {
      setPublishSaving(false);
    }
  }

  async function copyLastWeek() {
    setCopyBusy(true);
    try {
      const prevStart = addDays(week.start, -7);
      const prevEnd = addDays(week.end, -7);
      const { data: prevShifts, error } = await supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', prevStart)
        .lte('shift_date', prevEnd);
      if (error) throw error;
      if (!prevShifts?.length) return;
      const rows = prevShifts.map((s) => ({
        user_id: s.user_id,
        shift_date: addDays(s.shift_date, 7),
        start_time: s.start_time,
        end_time: s.end_time,
        note: s.note,
        status: SHIFT_STATUS.DRAFT,
        created_by: user.id,
      }));
      const { error: insErr } = await supabase.from('shifts').insert(rows);
      if (insErr) throw insErr;
      await loadSchedule();
    } catch (e) {
      console.error(e);
    } finally {
      setCopyBusy(false);
    }
  }

  const modalEmployee = employees.find((e) => e.id === modalUserId);

  if (loading && employees.length === 0) {
    return (
      <>
        <TopBar title="Schedule" showSettings />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Schedule" showSettings />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekAnchor(addDays(week.start, -7))}
              className="rounded-full p-2 text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <Calendar size={18} className="text-brand-500 shrink-0" />
              <span className="text-sm font-semibold text-brand-900 truncate">
                {formatWeekRangeLabel(week.start, week.end)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setWeekAnchor(addDays(week.start, 7))}
              className="rounded-full p-2 text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="Next week"
            >
              <ChevronRight size={22} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              type="button"
              onClick={copyLastWeek}
              disabled={copyBusy}
              className="btn-secondary inline-flex items-center gap-2 text-xs sm:text-sm px-4 py-2 disabled:opacity-50"
            >
              <Copy size={16} />
              Copy Last Week
            </button>
            <button
              type="button"
              onClick={() => draftCount > 0 && setPublishOpen(true)}
              disabled={draftCount === 0}
              className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
            >
              <Send size={16} />
              Publish
            </button>
          </div>
        </div>

        {employees.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Calendar}
              title="No employees"
              description="Add employees to build a schedule."
            />
          </div>
        ) : (
          <>
            <div className="card p-0 overflow-hidden shadow-card-lg">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-gray-50/80">
                      <th
                        className={cn(
                          'sticky left-0 z-20 min-w-[148px] w-[148px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted',
                          'bg-gray-50/95 backdrop-blur-sm shadow-[4px_0_12px_-6px_rgba(0,0,0,0.12)]'
                        )}
                      >
                        Team
                      </th>
                      {week.dates.map((dateStr, i) => {
                        const d = new Date(dateStr + 'T12:00:00');
                        return (
                          <th
                            key={dateStr}
                            className="min-w-[104px] px-2 py-3 text-center border-l border-border/80"
                          >
                            <div className="text-xs font-semibold text-brand-900">
                              {WEEKDAY_MON_SUN[i]}
                            </div>
                            <div className="text-[11px] text-muted font-medium tabular-nums">
                              {d.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => {
                      const empColor = emp.color || '#4F46E5';
                      const clocked = clockedInIds.has(emp.id);
                      return (
                        <tr
                          key={emp.id}
                          className="border-b border-border/80 last:border-0"
                        >
                          <td
                            className={cn(
                              'sticky left-0 z-10 px-3 py-2 align-top',
                              'bg-card shadow-[4px_0_12px_-6px_rgba(0,0,0,0.08)]'
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                                style={{ backgroundColor: empColor }}
                              />
                              {clocked && (
                                <span
                                  className="h-2 w-2 rounded-full shrink-0 bg-emerald-500 ring-2 ring-emerald-100"
                                  title="Clocked in"
                                />
                              )}
                              <span className="font-medium text-brand-900 truncate text-sm">
                                {emp.name}
                              </span>
                            </div>
                          </td>
                          {week.dates.map((dateStr) => {
                            const key = `${emp.id}|${dateStr}`;
                            const cellShifts = shiftsByUserDate.get(key) || [];
                            const ptoList = timeOffByUser.get(emp.id) || [];
                            const onPto = isDateInApprovedTimeOff(
                              dateStr,
                              ptoList
                            );
                            const conflict = cellShifts.length > 1;
                            return (
                              <td
                                key={dateStr}
                                className={cn(
                                  'align-top p-1.5 border-l border-border/60 min-h-[72px] relative transition-shadow',
                                  conflict &&
                                    'ring-2 ring-inset ring-danger-500 rounded-lg z-[1]',
                                  cellShifts.length === 0 &&
                                    !onPto &&
                                    'cursor-pointer'
                                )}
                                onClick={() => {
                                  if (cellShifts.length) return;
                                  openAddShift(emp.id, dateStr);
                                }}
                              >
                                {onPto && (
                                  <div
                                    className="absolute inset-1 rounded-lg pointer-events-none z-0 opacity-90"
                                    style={{
                                      backgroundImage: `repeating-linear-gradient(
                                        -45deg,
                                        #f3f4f6,
                                        #f3f4f6 5px,
                                        #d1d5db 5px,
                                        #d1d5db 10px
                                      )`,
                                    }}
                                    aria-hidden
                                  />
                                )}
                                <div
                                  className={cn(
                                    'relative z-[1] flex flex-col gap-1 min-h-[56px]',
                                    onPto && cellShifts.length === 0
                                      ? 'pointer-events-none'
                                      : ''
                                  )}
                                >
                                  {cellShifts.map((s) => {
                                    const draft =
                                      s.status === SHIFT_STATUS.DRAFT;
                                    return (
                                      <button
                                        key={s.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditShift(s);
                                        }}
                                        className={cn(
                                          'w-full text-left rounded-full px-2.5 py-1.5 text-[11px] font-semibold leading-tight transition-all hover:brightness-95 active:scale-[0.99] shadow-sm',
                                          draft
                                            ? 'border-2 border-dashed'
                                            : 'border border-transparent'
                                        )}
                                        style={
                                          draft
                                            ? {
                                                backgroundColor: `${empColor}26`,
                                                borderColor: empColor,
                                                color: '#1E1B4B',
                                              }
                                            : {
                                                backgroundColor: empColor,
                                                color: '#fff',
                                              }
                                        }
                                      >
                                        {formatTime(s.start_time)} –{' '}
                                        {formatTime(s.end_time)}
                                      </button>
                                    );
                                  })}
                                  {cellShifts.length === 0 && !onPto && (
                                    <div className="flex-1 min-h-[48px] rounded-lg border border-dashed border-border/80 text-muted hover:border-brand-300 hover:bg-brand-50/50 transition-colors flex items-center justify-center cursor-pointer pointer-events-none">
                                      <Plus size={16} className="opacity-50" />
                                    </div>
                                  )}
                                  {cellShifts.length === 0 && onPto && (
                                    <div className="flex-1 min-h-[48px] rounded-lg flex items-center justify-center text-[10px] font-medium text-muted uppercase tracking-wide">
                                      Off
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-4">
                <span className="text-muted">Shifts this week</span>
                <span className="font-bold tabular-nums text-brand-900">
                  {weekTotals.shiftCount}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted">Labor hours</span>
                <span className="font-bold tabular-nums text-brand-900">
                  {weekTotals.hours.toFixed(1)}h
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      <Modal
        open={shiftModalOpen}
        onClose={() => !formSaving && setShiftModalOpen(false)}
        title={editingShift ? 'Edit shift' : 'Add shift'}
        size="full"
      >
        <div className="space-y-4">
          <div>
            <p className="label mb-0">Employee</p>
            <p className="text-brand-900 font-semibold">
              {modalEmployee?.name || '—'}
            </p>
          </div>
          <div>
            <p className="label mb-0">Date</p>
            <p className="text-brand-900 font-medium">
              {modalDate
                ? new Date(modalDate + 'T12:00:00').toLocaleDateString(
                    'en-US',
                    {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    }
                  )
                : '—'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="shift-start">
                Start
              </label>
              <input
                id="shift-start"
                type="time"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label" htmlFor="shift-end">
                End
              </label>
              <input
                id="shift-end"
                type="time"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="shift-note">
              Note (optional)
            </label>
            <textarea
              id="shift-note"
              rows={2}
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              className="input-field resize-none"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            {editingShift && (
              <button
                type="button"
                onClick={deleteShift}
                disabled={formSaving}
                className="btn-danger inline-flex items-center justify-center gap-2 sm:mr-auto"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => setShiftModalOpen(false)}
              disabled={formSaving}
              className="btn-secondary flex-1 sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveShift}
              disabled={formSaving}
              className="btn-primary flex-1 sm:flex-none inline-flex items-center justify-center gap-2"
            >
              {formSaving ? <Spinner size="sm" /> : null}
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={publishOpen}
        onClose={() => !publishSaving && setPublishOpen(false)}
        title="Publish schedule"
        size="md"
      >
        <p className="text-sm text-brand-800 leading-relaxed">
          Publish{' '}
          <strong className="text-brand-900">{publishPreview.shifts}</strong>{' '}
          draft shift{publishPreview.shifts === 1 ? '' : 's'} for{' '}
          <strong className="text-brand-900">{publishPreview.employees}</strong>{' '}
          employee{publishPreview.employees === 1 ? '' : 's'},{' '}
          <strong className="text-brand-900">
            {publishPreview.hours.toFixed(1)}
          </strong>{' '}
          total hours. Team members will see published shifts.
        </p>
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={() => setPublishOpen(false)}
            disabled={publishSaving}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishSaving}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
          >
            {publishSaving ? <Spinner size="sm" /> : <Send size={16} />}
            Confirm
          </button>
        </div>
      </Modal>
    </>
  );
}
