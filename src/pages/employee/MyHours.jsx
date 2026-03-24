import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  getWeekRange,
  formatDate,
  formatTimestamp,
  formatDuration,
  calcDurationHours,
  toDateString,
} from '../../lib/helpers';
import TopBar from '../../components/layout/TopBar';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { Clock } from 'lucide-react';

export default function MyHours() {
  const { user } = useAuth();
  const weekDefault = useMemo(() => getWeekRange(toDateString(new Date())), []);

  const [startDate, setStartDate] = useState(weekDefault.start);
  const [endDate, setEndDate] = useState(weekDefault.end);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('time_logs')
      .select('id, business_date, clock_in, clock_out')
      .eq('user_id', user.id)
      .gte('business_date', startDate)
      .lte('business_date', endDate)
      .order('business_date', { ascending: false })
      .order('clock_in', { ascending: false });
    if (!error) setLogs(data || []);
    setLoading(false);
  }, [user?.id, startDate, endDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  function setThisWeek() {
    const w = getWeekRange(toDateString(new Date()));
    setStartDate(w.start);
    setEndDate(w.end);
  }

  if (loading && logs.length === 0) {
    return (
      <>
        <TopBar title="My Hours" />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="My Hours" />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-4">
        <div className="card flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-[140px]">
              <label className="label" htmlFor="hours-start">
                From
              </label>
              <input
                id="hours-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label" htmlFor="hours-end">
                To
              </label>
              <input
                id="hours-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={setThisWeek}
            className="btn-secondary w-full sm:w-auto shrink-0"
          >
            This week
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Clock}
              title="No time entries"
              description="No clock activity in this date range."
            />
          </div>
        ) : (
          <div className="card p-0 overflow-hidden shadow-card-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50/90">
                    <th className="text-left px-4 py-3 font-semibold text-brand-900">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-brand-900">In</th>
                    <th className="text-left px-4 py-3 font-semibold text-brand-900">Out</th>
                    <th className="text-right px-4 py-3 font-semibold text-brand-900">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const hours = calcDurationHours(log.clock_in, log.clock_out);
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-border/70 last:border-0 hover:bg-gray-50/40 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-brand-900 whitespace-nowrap">
                          {formatDate(log.business_date)}
                        </td>
                        <td className="px-4 py-3 text-brand-800 tabular-nums">
                          {formatTimestamp(log.clock_in)}
                        </td>
                        <td className="px-4 py-3 text-brand-800 tabular-nums">
                          {formatTimestamp(log.clock_out)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-brand-900 tabular-nums">
                          {log.clock_out ? formatDuration(hours) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
