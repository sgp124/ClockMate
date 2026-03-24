import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toDateString, getWeekRange, cn } from '../../lib/helpers';
import { SHIFT_STATUS, ROLES } from '../../lib/constants';
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
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';

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

function formatTimeCompact(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const suffix = h >= 12 ? 'p' : 'a';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
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

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDayHeader(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
}

export default function Schedule() {
  const { user } = useAuth();
  const todayStr = useMemo(() => toDateString(new Date()), []);
  const [weekAnchor, setWeekAnchor] = useState(todayStr);
  const week = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [timeOffApproved, setTimeOffApproved] = useState([]);

  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [modalUserId, setModalUserId] = useState('');
  const [modalDate, setModalDate] = useState('');
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

    const [usersRes, shiftsRes, timeOffRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, name, color, role, is_admin_granted, is_active')
        .eq('is_active', true)
        .neq('role', ROLES.KIOSK)
        .neq('role', ROLES.ADMIN)
        .order('name'),
      supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', week.start)
        .lte('shift_date', week.end)
        .order('start_time'),
      supabase
        .from('time_off_requests')
        .select('id, user_id, start_date, end_date, status')
        .eq('status', 'approved')
        .lte('start_date', week.end)
        .gte('end_date', week.start),
    ]);

    if (gen !== fetchGen.current) return;

    setEmployees(usersRes.data || []);
    setShifts(shiftsRes.data || []);
    setTimeOffApproved(timeOffRes.data || []);
    setLoading(false);
  }, [week.start, week.end]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const employeeMap = useMemo(() => {
    const map = new Map();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const timeOffByUser = useMemo(() => {
    const map = new Map();
    for (const r of timeOffApproved) {
      if (!map.has(r.user_id)) map.set(r.user_id, []);
      map.get(r.user_id).push(r);
    }
    return map;
  }, [timeOffApproved]);

  const dayGroups = useMemo(() => {
    const shiftsByDate = new Map();
    for (const dateStr of week.dates) {
      shiftsByDate.set(dateStr, []);
    }
    for (const s of shifts) {
      if (shiftsByDate.has(s.shift_date)) {
        shiftsByDate.get(s.shift_date).push(s);
      }
    }

    const conflictSet = new Set();
    const byUserDate = new Map();
    for (const s of shifts) {
      const k = `${s.user_id}|${s.shift_date}`;
      byUserDate.set(k, (byUserDate.get(k) || 0) + 1);
    }
    for (const [k, count] of byUserDate) {
      if (count > 1) {
        const [uid, date] = k.split('|');
        for (const s of shifts) {
          if (s.user_id === uid && s.shift_date === date) conflictSet.add(s.id);
        }
      }
    }

    const offByDate = new Map();
    for (const dateStr of week.dates) {
      const offEmps = [];
      for (const emp of employees) {
        const reqs = timeOffByUser.get(emp.id) || [];
        if (isDateInApprovedTimeOff(dateStr, reqs)) {
          offEmps.push(emp);
        }
      }
      offByDate.set(dateStr, offEmps);
    }

    return week.dates.map((dateStr) => {
      const dayShifts = shiftsByDate.get(dateStr) || [];
      let hours = 0;
      for (const s of dayShifts) hours += shiftDurationHours(s.start_time, s.end_time);
      return {
        date: dateStr,
        shifts: dayShifts,
        hours,
        offEmployees: offByDate.get(dateStr) || [],
        conflictIds: conflictSet,
      };
    });
  }, [shifts, week.dates, employees, timeOffByUser]);

  const weekDraftShifts = useMemo(
    () => shifts.filter((s) => s.status === SHIFT_STATUS.DRAFT),
    [shifts]
  );

  const draftCount = weekDraftShifts.length;

  const weekTotalHours = useMemo(() => {
    let h = 0;
    for (const s of shifts) h += shiftDurationHours(s.start_time, s.end_time);
    return h;
  }, [shifts]);

  const publishPreview = useMemo(() => {
    const uniq = new Set(weekDraftShifts.map((s) => s.user_id));
    let h = 0;
    for (const s of weekDraftShifts) h += shiftDurationHours(s.start_time, s.end_time);
    return { shifts: weekDraftShifts.length, employees: uniq.size, hours: h };
  }, [weekDraftShifts]);

  function openAddShift(dateStr) {
    setEditingShift(null);
    setModalUserId('');
    setModalDate(dateStr || todayStr);
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
            user_id: payload.user_id,
            shift_date: payload.shift_date,
            start_time: payload.start_time,
            end_time: payload.end_time,
            note: payload.note,
          })
          .eq('id', editingShift.id);
        if (error) throw error;

        if (editingShift.status === SHIFT_STATUS.PUBLISHED) {
          await supabase.from('notifications').insert({
            user_id: modalUserId,
            title: 'Shift Updated',
            body: `Your shift on ${new Date(modalDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} has been updated.`,
            type: 'schedule',
          });
        }
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

      const affectedUserIds = [...new Set(weekDraftShifts.map((s) => s.user_id))];
      const periodLabel = formatWeekRangeLabel(week.start, week.end);
      const notifs = affectedUserIds.map((uid) => ({
        user_id: uid,
        title: 'Schedule Published',
        body: `Your schedule for ${periodLabel} has been published.`,
        type: 'schedule',
      }));
      if (notifs.length) {
        await supabase.from('notifications').insert(notifs);
      }

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
      <main className="max-w-2xl mx-auto px-4 py-5 pb-28 space-y-4">
        {/* Week strip */}
        <div className="card p-3 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setWeekAnchor(addDays(week.start, -7))}
              className="rounded-full p-1.5 text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-semibold text-brand-900">
              {formatWeekRangeLabel(week.start, week.end)}
            </span>
            <button
              type="button"
              onClick={() => setWeekAnchor(addDays(week.start, 7))}
              className="rounded-full p-1.5 text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="Next week"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex overflow-x-auto gap-1 -mx-1 px-1 scrollbar-hide">
            {week.dates.map((dateStr) => {
              const d = new Date(dateStr + 'T12:00:00');
              const dayAbbr = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2).toUpperCase();
              const dayNum = d.getDate();
              const isToday = dateStr === todayStr;
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setWeekAnchor(dateStr)}
                  className={cn(
                    'flex flex-col items-center justify-center flex-1 min-w-[44px] py-2 rounded-xl transition-all',
                    isToday
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-brand-700 hover:bg-brand-50'
                  )}
                >
                  <span className={cn('text-[10px] font-bold tracking-wider', isToday ? 'text-indigo-200' : 'text-muted')}>
                    {dayAbbr}
                  </span>
                  <span className={cn('text-lg font-bold leading-tight', isToday ? 'text-white' : 'text-brand-900')}>
                    {dayNum}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openAddShift(todayStr)}
            className="btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2"
          >
            <Plus size={16} />
            Add Shift
          </button>
          <button
            type="button"
            onClick={copyLastWeek}
            disabled={copyBusy}
            className="btn-secondary inline-flex items-center gap-1.5 text-sm px-4 py-2 disabled:opacity-50"
          >
            <Copy size={15} />
            Copy Week
          </button>
          <button
            type="button"
            onClick={() => draftCount > 0 && setPublishOpen(true)}
            disabled={draftCount === 0}
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-all active:scale-[0.98]',
              draftCount > 0
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            <Send size={15} />
            Publish{draftCount > 0 ? ` (${draftCount})` : ''}
          </button>
        </div>

        {/* Day-by-day list */}
        {employees.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Calendar}
              title="No employees"
              description="Add employees to build a schedule."
            />
          </div>
        ) : (
          <div className="space-y-2">
            {dayGroups.map((group) => {
              const hasContent = group.shifts.length > 0 || group.offEmployees.length > 0;
              return (
                <div key={group.date}>
                  {/* Day header */}
                  <div className="flex items-center justify-between px-1 py-2">
                    <h3 className={cn(
                      'text-xs font-bold tracking-wide',
                      group.date === todayStr ? 'text-indigo-600' : 'text-muted'
                    )}>
                      {formatDayHeader(group.date)}
                    </h3>
                    <div className="flex items-center gap-2">
                      {group.hours > 0 && (
                        <span className="text-xs font-semibold text-muted tabular-nums">
                          {group.hours.toFixed(1)}h
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openAddShift(group.date)}
                        className="rounded-full p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        aria-label={`Add shift on ${group.date}`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {!hasContent && (
                    <div className="card py-4 text-center text-sm text-muted opacity-60">
                      No shifts
                    </div>
                  )}

                  {/* Shift cards */}
                  <div className="space-y-1.5">
                    {group.shifts.map((s) => {
                      const emp = employeeMap.get(s.user_id);
                      const empColor = emp?.color || '#4F46E5';
                      const isDraft = s.status === SHIFT_STATUS.DRAFT;
                      const hasConflict = group.conflictIds.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => openEditShift(s)}
                          className={cn(
                            'card w-full text-left p-3 border-l-4 flex items-center gap-3 transition-all hover:shadow-card-lg active:scale-[0.995]',
                            isDraft ? 'border-l-4 border-dashed' : ''
                          )}
                          style={{
                            borderLeftColor: isDraft ? empColor : empColor,
                            borderLeftStyle: isDraft ? 'dashed' : 'solid',
                          }}
                        >
                          <div
                            className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                            style={{ backgroundColor: empColor }}
                          >
                            {getInitials(emp?.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-brand-900">
                                {formatTimeCompact(s.start_time)}–{formatTimeCompact(s.end_time)}
                              </span>
                              {s.note && (
                                <ClipboardList size={13} className="text-brand-400 shrink-0" />
                              )}
                              {hasConflict && (
                                <AlertTriangle size={13} className="text-red-500 shrink-0" />
                              )}
                              {isDraft && (
                                <span className="badge badge-draft text-[10px] ml-1">Draft</span>
                              )}
                            </div>
                            <p className="text-sm text-brand-700 truncate">{emp?.name || 'Unknown'}</p>
                            {s.note && (
                              <p className="text-xs text-muted truncate mt-0.5">{s.note}</p>
                            )}
                          </div>
                          <span className="text-xs text-muted tabular-nums shrink-0">
                            {shiftDurationHours(s.start_time, s.end_time).toFixed(1)}h
                          </span>
                        </button>
                      );
                    })}

                    {/* Time off cards */}
                    {group.offEmployees.map((emp) => (
                      <div
                        key={`off-${emp.id}`}
                        className="card w-full p-3 border-l-4 border-gray-300 flex items-center gap-3 opacity-60"
                      >
                        <div className="h-9 w-9 rounded-full flex items-center justify-center bg-gray-200 text-gray-500 text-xs font-bold shrink-0">
                          {getInitials(emp.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Off</span>
                          <p className="text-sm text-gray-500 truncate">{emp.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Week total */}
        <div className="card flex items-center justify-between py-3 text-sm">
          <span className="font-semibold text-brand-900">Week Total</span>
          <div className="flex items-center gap-4">
            <span className="text-muted">{shifts.length} shift{shifts.length !== 1 ? 's' : ''}</span>
            <span className="font-bold tabular-nums text-brand-900">
              {weekTotalHours.toFixed(1)}h
            </span>
          </div>
        </div>
      </main>

      {/* Add/Edit Shift Modal */}
      <Modal
        open={shiftModalOpen}
        onClose={() => !formSaving && setShiftModalOpen(false)}
        title={editingShift ? 'Edit Shift' : 'Add Shift'}
        size="full"
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="shift-emp">Employee</label>
            <select
              id="shift-emp"
              value={modalUserId}
              onChange={(e) => setModalUserId(e.target.value)}
              className="input-field"
              disabled={!!editingShift}
            >
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="shift-date">Date</label>
            <input
              id="shift-date"
              type="date"
              value={modalDate}
              onChange={(e) => setModalDate(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="shift-start">Start</label>
              <input
                id="shift-start"
                type="time"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label" htmlFor="shift-end">End</label>
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
            <label className="label" htmlFor="shift-note">Note / Duties</label>
            <textarea
              id="shift-note"
              rows={3}
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              className="input-field resize-none"
              placeholder="What should this employee do during the shift?"
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
              disabled={formSaving || !modalUserId}
              className="btn-primary flex-1 sm:flex-none inline-flex items-center justify-center gap-2"
            >
              {formSaving ? <Spinner size="sm" /> : null}
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Publish Modal */}
      <Modal
        open={publishOpen}
        onClose={() => !publishSaving && setPublishOpen(false)}
        title="Publish Schedule"
        size="md"
      >
        <p className="text-sm text-brand-800 leading-relaxed">
          Publish{' '}
          <strong className="text-brand-900">{publishPreview.shifts}</strong>{' '}
          draft shift{publishPreview.shifts === 1 ? '' : 's'} for{' '}
          <strong className="text-brand-900">{publishPreview.employees}</strong>{' '}
          employee{publishPreview.employees === 1 ? '' : 's'},{' '}
          <strong className="text-brand-900">{publishPreview.hours.toFixed(1)}</strong>{' '}
          total hours. Team members will be notified.
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
