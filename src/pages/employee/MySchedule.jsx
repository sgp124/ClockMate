import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatTime, toDateString, getWeekRange, formatDate } from '../../lib/helpers';
import { SHIFT_STATUS } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

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

export default function MySchedule() {
  const { user } = useAuth();
  const [weekAnchor, setWeekAnchor] = useState(() => toDateString(new Date()));
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
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekAnchor(addDays(week.start, -7))}
            className="rounded-full p-2 text-brand-600 hover:bg-brand-50 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center sm:justify-start">
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

        {shifts.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Calendar}
              title="No shifts this week"
              description="Published shifts for this week will show up here."
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {shifts.map((s) => {
              const dayLine = formatDate(s.shift_date);
              return (
                <li
                  key={s.id}
                  className="card border-l-4 shadow-card transition-all hover:shadow-card-lg"
                  style={{ borderLeftColor: accent }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                      style={{ backgroundColor: accent }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-brand-900">{dayLine}</p>
                      <p className="text-sm text-brand-800 mt-0.5">
                        {formatTime(s.start_time)} – {formatTime(s.end_time)}
                      </p>
                      {s.note ? (
                        <p className="text-sm text-muted mt-2 leading-relaxed">{s.note}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
