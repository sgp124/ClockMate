import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatTime, toDateString, getWeekRange, cn } from '../../lib/helpers';
import { SHIFT_STATUS } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { ChevronLeft, ChevronRight, Calendar, ClipboardList } from 'lucide-react';

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

function shiftDurationHours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh * 60 + (sm || 0);
  let e = eh * 60 + (em || 0);
  if (e <= s) e += 24 * 60;
  return (e - s) / 60;
}

function crossesMidnight(start, end) {
  const s = parseInt(start) * 60 + parseInt(start.split(':')[1] || 0);
  const e = parseInt(end) * 60 + parseInt(end.split(':')[1] || 0);
  return e <= s;
}

function formatShiftTime(start, end) {
  const sep = crossesMidnight(start, end) ? '~' : '–';
  return `${formatTimeCompact(start)}${sep}${formatTimeCompact(end)}`;
}

function formatDayHeader(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    .toUpperCase();
}

export default function MySchedule() {
  const { user } = useAuth();
  const todayStr = useMemo(() => toDateString(new Date()), []);
  const [weekAnchor, setWeekAnchor] = useState(todayStr);
  const week = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);

  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);

  const loadShifts = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', SHIFT_STATUS.PUBLISHED)
      .gte('shift_date', week.start)
      .lte('shift_date', week.end)
      .order('shift_date')
      .order('start_time');
    if (!error) setShifts(data || []);
    setLoading(false);
  }, [user?.id, week.start, week.end]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  const accent = user?.color || '#4F46E5';

  const dayGroups = useMemo(() => {
    const grouped = new Map();
    for (const dateStr of week.dates) grouped.set(dateStr, []);
    for (const s of shifts) {
      if (grouped.has(s.shift_date)) grouped.get(s.shift_date).push(s);
    }
    return week.dates
      .map((dateStr) => ({ date: dateStr, shifts: grouped.get(dateStr) || [] }))
      .filter((g) => g.shifts.length > 0);
  }, [shifts, week.dates]);

  const weekTotalHours = useMemo(() => {
    let h = 0;
    for (const s of shifts) h += shiftDurationHours(s.start_time, s.end_time);
    return h;
  }, [shifts]);

  if (loading && shifts.length === 0) {
    return (
      <>
        <TopBar title="My Schedule" />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="My Schedule" />
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
              const hasShift = shifts.some((s) => s.shift_date === dateStr);
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setWeekAnchor(dateStr)}
                  className={cn(
                    'flex flex-col items-center justify-center flex-1 min-w-[44px] py-2 rounded-xl transition-all relative',
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
                  {hasShift && !isToday && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ backgroundColor: accent }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {shifts.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Calendar}
              title="No shifts this week"
              description="Published shifts for this week will show up here."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {dayGroups.map((group) => (
              <div key={group.date}>
                <h3 className={cn(
                  'text-xs font-bold tracking-wide px-1 py-2',
                  group.date === todayStr ? 'text-indigo-600' : 'text-muted'
                )}>
                  {formatDayHeader(group.date)}
                </h3>
                <div className="space-y-2">
                  {group.shifts.map((s) => (
                    <div
                      key={s.id}
                      className="card border-l-4 p-4 transition-all hover:shadow-card-lg"
                      style={{ borderLeftColor: accent }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-0.5 h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                          style={{ backgroundColor: accent }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-brand-900">
                              {formatShiftTime(s.start_time, s.end_time)}
                            </span>
                            <span className="text-xs text-muted tabular-nums">
                              {shiftDurationHours(s.start_time, s.end_time).toFixed(1)}h
                            </span>
                          </div>
                          {s.note && (
                            <div className="mt-2 flex items-start gap-1.5 bg-brand-50 rounded-lg px-3 py-2">
                              <ClipboardList size={14} className="text-brand-500 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-500">Duties</p>
                                <p className="text-sm text-brand-800 leading-relaxed">{s.note}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

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
          </div>
        )}
      </main>
    </>
  );
}
