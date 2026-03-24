import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  toDateString,
  getBusinessDate,
  calcDurationHours,
  formatTimestamp,
  formatDate,
  cn,
} from '../../lib/helpers';
import { PAY_PERIOD_TYPES, ROLES } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Alert from '../../components/ui/Alert';
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  AlertTriangle,
} from 'lucide-react';

const MS_PER_DAY = 86400000;

const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseLocalNoon(dateStr) {
  return new Date(dateStr + 'T12:00:00');
}

function startOfWeekContaining(dateStr, weekStartDay) {
  const d = parseLocalNoon(dateStr);
  const day = d.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toDateString(d);
}

function periodBoundsWeekly(dateStr, weekStartDay) {
  const start = startOfWeekContaining(dateStr, weekStartDay);
  const endD = parseLocalNoon(start);
  endD.setDate(endD.getDate() + 6);
  return { start, end: toDateString(endD) };
}

function periodBoundsBiweekly(dateStr, weekStartDay) {
  const weekStartStr = startOfWeekContaining(dateStr, weekStartDay);
  const anchor = parseLocalNoon(startOfWeekContaining('1970-01-01', weekStartDay));
  const ws = parseLocalNoon(weekStartStr);
  const days = Math.round((ws - anchor) / MS_PER_DAY);
  const bi = Math.floor(days / 14);
  const periodStart = new Date(anchor.getTime() + bi * 14 * MS_PER_DAY);
  const endD = new Date(periodStart.getTime() + 13 * MS_PER_DAY);
  return { start: toDateString(periodStart), end: toDateString(endD) };
}

function periodBoundsSemimonthly(dateStr) {
  const d = parseLocalNoon(dateStr);
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();
  const mm = String(mo + 1).padStart(2, '0');
  if (day <= 15) {
    return { start: `${y}-${mm}-01`, end: `${y}-${mm}-15` };
  }
  const last = new Date(y, mo + 1, 0);
  const dd = String(last.getDate()).padStart(2, '0');
  return { start: `${y}-${mm}-16`, end: `${y}-${mm}-${dd}` };
}

function periodBoundsMonthly(dateStr) {
  const d = parseLocalNoon(dateStr);
  const y = d.getFullYear();
  const mo = d.getMonth();
  const mm = String(mo + 1).padStart(2, '0');
  const last = new Date(y, mo + 1, 0);
  const dd = String(last.getDate()).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${dd}` };
}

function getPeriodContaining(dateStr, type, weekStartDay) {
  const w = Number.isFinite(weekStartDay) ? weekStartDay : 1;
  switch (type) {
    case 'weekly':
      return periodBoundsWeekly(dateStr, w);
    case 'biweekly':
      return periodBoundsBiweekly(dateStr, w);
    case 'semimonthly':
      return periodBoundsSemimonthly(dateStr);
    case 'monthly':
      return periodBoundsMonthly(dateStr);
    default:
      return periodBoundsBiweekly(dateStr, w);
  }
}

function formatPeriodLabel(startStr, endStr) {
  const a = new Date(startStr + 'T12:00:00');
  const b = new Date(endStr + 'T12:00:00');
  const opts = { month: 'short', day: 'numeric' };
  const left = a.toLocaleDateString('en-US', opts);
  const right = b.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${left} – ${right}`;
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatHoursNum(h) {
  const n = Math.round(Number(h) * 100) / 100;
  return n.toFixed(2);
}

export default function Payroll() {
  const [settings, setSettings] = useState(null);
  const [periodFocus, setPeriodFocus] = useState(() => toDateString(new Date()));
  const [employees, setEmployees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [detailLogs, setDetailLogs] = useState([]);

  const payPeriodType = settings?.pay_period_type || 'biweekly';
  const weekStartDay = settings?.pay_period_start_day ?? 1;

  const bounds = useMemo(
    () => getPeriodContaining(periodFocus, payPeriodType, weekStartDay),
    [periodFocus, payPeriodType, weekStartDay]
  );

  const periodTypeLabel =
    PAY_PERIOD_TYPES.find((p) => p.value === payPeriodType)?.label || payPeriodType;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, usersRes] = await Promise.all([
        supabase.from('settings').select('*').limit(1).single(),
        supabase
          .from('users')
          .select('id, name, color, pay_rate, role, is_active')
          .eq('is_active', true)
          .neq('role', ROLES.KIOSK)
          .neq('role', ROLES.ADMIN)
          .order('name'),
      ]);

      if (settingsRes.error) throw settingsRes.error;
      setSettings(settingsRes.data);

      const type = settingsRes.data?.pay_period_type || 'biweekly';
      const wsd = settingsRes.data?.pay_period_start_day ?? 1;
      const b = getPeriodContaining(periodFocus, type, wsd);

      const { data: logRows, error: logErr } = await supabase
        .from('time_logs')
        .select(
          'id, user_id, business_date, clock_in, clock_out, auto_clockout, forgot_flag'
        )
        .gte('business_date', b.start)
        .lte('business_date', b.end)
        .order('business_date', { ascending: true });

      if (logErr) throw logErr;

      if (usersRes.error) throw usersRes.error;
      setEmployees(usersRes.data || []);
      setLogs(logRows || []);
    } catch (e) {
      setError(e.message);
      setEmployees([]);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [periodFocus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const startHour = settings?.business_day_start
    ? parseInt(settings.business_day_start, 10)
    : 10;
  const businessDateToday = getBusinessDate(
    new Date(),
    Number.isFinite(startHour) ? startHour : 10
  );

  const clockedInIds = useMemo(() => {
    const ids = new Set();
    for (const l of logs) {
      if (l.clock_out == null && l.business_date === businessDateToday) {
        ids.add(l.user_id);
      }
    }
    return ids;
  }, [logs, businessDateToday]);

  const rows = useMemo(() => {
    return employees
      .map((emp) => {
        const entries = logs.filter((l) => l.user_id === emp.id);
        let hours = 0;
        let warn = false;
        for (const l of entries) {
          hours += calcDurationHours(l.clock_in, l.clock_out);
          if (l.auto_clockout || l.forgot_flag || l.clock_out == null) {
            warn = true;
          }
        }
        return { user: emp, hours, warn, entries };
      })
      .sort((a, b) => (a.user.name || '').localeCompare(b.user.name || ''));
  }, [employees, logs]);

  const totals = useMemo(() => {
    let th = 0;
    let tp = 0;
    for (const r of rows) {
      const rate = Number(r.user.pay_rate) || 0;
      th += r.hours;
      tp += r.hours * rate;
    }
    return { hours: th, pay: tp };
  }, [rows]);

  function goPrevPeriod() {
    const start = parseLocalNoon(bounds.start);
    start.setDate(start.getDate() - 1);
    setPeriodFocus(toDateString(start));
  }

  function goNextPeriod() {
    const end = parseLocalNoon(bounds.end);
    end.setDate(end.getDate() + 1);
    setPeriodFocus(toDateString(end));
  }

  function openDetail(row) {
    const sorted = [...row.entries].sort((a, b) => {
      if (a.business_date !== b.business_date) {
        return a.business_date.localeCompare(b.business_date);
      }
      return (a.clock_in || '').localeCompare(b.clock_in || '');
    });
    setDetailUser(row.user);
    setDetailLogs(sorted);
  }

  function exportCsv() {
    const lines = [
      ['Employee', 'Total Hours', 'Hourly Rate', 'Total Pay', 'Period Start', 'Period End'].join(
        ','
      ),
    ];
    for (const r of rows) {
      const rate = Number(r.user.pay_rate) || 0;
      const pay = r.hours * rate;
      lines.push(
        [
          csvEscape(r.user.name),
          formatHoursNum(r.hours),
          formatHoursNum(rate),
          formatHoursNum(pay),
          bounds.start,
          bounds.end,
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${bounds.start}-to-${bounds.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !settings && !error) {
    return (
      <>
        <TopBar title="Payroll" showSettings />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Payroll" showSettings />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {error && (
          <Alert variant="error" title="Could not load payroll">
            {error}
          </Alert>
        )}

        <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between transition-shadow">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={goPrevPeriod}
              className="rounded-full p-2.5 text-brand-700 bg-gray-50 ring-1 ring-border hover:bg-brand-50 hover:ring-brand-200 transition-all active:scale-[0.97]"
              aria-label="Previous pay period"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1 text-center sm:text-left min-w-0 px-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {periodTypeLabel} pay period
              </p>
              <p className="text-lg font-semibold text-brand-900 truncate">
                {formatPeriodLabel(bounds.start, bounds.end)}
              </p>
            </div>
            <button
              type="button"
              onClick={goNextPeriod}
              className="rounded-full p-2.5 text-brand-700 bg-gray-50 ring-1 ring-border hover:bg-brand-50 hover:ring-brand-200 transition-all active:scale-[0.97]"
              aria-label="Next pay period"
            >
              <ChevronRight size={22} />
            </button>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="btn-secondary inline-flex items-center justify-center gap-2 shrink-0 transition-all"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>

        <div className="card overflow-hidden p-0 transition-shadow">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No employees"
              description="Add active team members to see payroll summaries."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3 tabular-nums text-right">Total hours</th>
                    <th className="px-4 py-3 tabular-nums text-right">Hourly rate</th>
                    <th className="px-4 py-3 tabular-nums text-right">Total pay</th>
                    <th className="px-4 py-3 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rate = Number(r.user.pay_rate) || 0;
                    const pay = r.hours * rate;
                    const clocked = clockedInIds.has(r.user.id);
                    return (
                      <tr
                        key={r.user.id}
                        onClick={() => openDetail(r)}
                        className={cn(
                          'border-b border-border last:border-0 cursor-pointer transition-colors',
                          'hover:bg-brand-50/40 active:bg-brand-50/60'
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                              style={{ backgroundColor: r.user.color || '#4F46E5' }}
                            />
                            {clocked && (
                              <span
                                className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse-slow ring-2 ring-emerald-200"
                                title="Clocked in"
                              />
                            )}
                            <span className="font-medium text-brand-900 truncate">
                              {r.user.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {formatHoursNum(r.hours)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted">
                          {moneyFmt.format(rate)}/hr
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-brand-900">
                          {moneyFmt.format(pay)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.warn && (
                            <AlertTriangle
                              size={18}
                              className="inline text-warning-500"
                              aria-label="Has time flags"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50/90 border-t-2 border-border font-semibold text-brand-900">
                    <td className="px-4 py-3">Totals</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatHoursNum(totals.hours)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">—</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {moneyFmt.format(totals.pay)}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>

      <Modal
        open={detailUser != null}
        onClose={() => {
          setDetailUser(null);
          setDetailLogs([]);
        }}
        title={detailUser ? `${detailUser.name} — detail` : ''}
        size="lg"
      >
        {detailUser && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3 tabular-nums">Clock in</th>
                  <th className="py-2 pr-3 tabular-nums">Clock out</th>
                  <th className="py-2 text-right tabular-nums">Hours</th>
                </tr>
              </thead>
              <tbody>
                {detailLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted">
                      No punches in this period.
                    </td>
                  </tr>
                ) : (
                  detailLogs.map((l) => {
                    const h = calcDurationHours(l.clock_in, l.clock_out);
                    return (
                      <tr key={l.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 pr-3">{formatDate(l.business_date)}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{formatTimestamp(l.clock_in)}</td>
                        <td className="py-2.5 pr-3 tabular-nums">
                          {l.clock_out ? formatTimestamp(l.clock_out) : '—'}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-medium">
                          {formatHoursNum(h)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </>
  );
}
