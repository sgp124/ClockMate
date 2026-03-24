import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate, cn } from '../../lib/helpers';
import { TIME_OFF_STATUS } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { CalendarOff, Check, X } from 'lucide-react';

const TABS = [
  { key: 'pending', label: 'Pending', status: TIME_OFF_STATUS.PENDING },
  { key: 'approved', label: 'Approved', status: TIME_OFF_STATUS.APPROVED },
  { key: 'denied', label: 'Denied', status: TIME_OFF_STATUS.DENIED },
];

function statusBadgeClass(status) {
  if (status === TIME_OFF_STATUS.PENDING) return 'badge-pending';
  if (status === TIME_OFF_STATUS.APPROVED) return 'badge-approved';
  return 'badge-denied';
}

export default function TimeOff() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [actionId, setActionId] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('time_off_requests')
      .select(
        '*, employee:users!time_off_requests_user_id_fkey(name, color)'
      )
      .order('created_at', { ascending: false });
    if (!error) setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let denied = 0;
    for (const r of requests) {
      if (r.status === TIME_OFF_STATUS.PENDING) pending += 1;
      else if (r.status === TIME_OFF_STATUS.APPROVED) approved += 1;
      else if (r.status === TIME_OFF_STATUS.DENIED) denied += 1;
    }
    return { pending, approved, denied };
  }, [requests]);

  const filtered = useMemo(() => {
    const status = TABS.find((t) => t.key === tab)?.status;
    return requests.filter((r) => r.status === status);
  }, [requests, tab]);

  async function reviewRequest(id, status) {
    if (!user?.id) return;
    setActionId(id);
    const { error } = await supabase
      .from('time_off_requests')
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);
    setActionId(null);
    if (!error) await loadRequests();
  }

  if (loading && requests.length === 0) {
    return (
      <>
        <TopBar title="Time Off" showSettings />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Time Off" showSettings />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-4">
        <div className="flex flex-wrap gap-2 p-1 bg-gray-100/80 rounded-full w-fit">
          {TABS.map((t) => {
            const n = counts[t.key];
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-semibold transition-all',
                  active
                    ? 'bg-white text-brand-700 shadow-card'
                    : 'text-muted hover:text-brand-800'
                )}
              >
                {t.label}
                <span
                  className={cn(
                    'ml-2 tabular-nums text-xs font-bold px-2 py-0.5 rounded-full',
                    active ? 'bg-brand-50 text-brand-600' : 'bg-white/60 text-muted'
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={CalendarOff}
              title={`No ${tab} requests`}
              description={
                tab === 'pending'
                  ? 'When employees request time off, they will appear here.'
                  : 'Nothing in this tab yet.'
              }
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => {
              const emp = r.employee;
              const color = emp?.color || '#4F46E5';
              const busy = actionId === r.id;
              return (
                <li
                  key={r.id}
                  className="card shadow-card transition-shadow hover:shadow-card-lg"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-semibold text-brand-900 truncate">
                          {emp?.name || 'Unknown'}
                        </span>
                        <span className={statusBadgeClass(r.status)}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-sm text-brand-800">
                        <span className="font-medium text-brand-900">
                          {formatDate(r.start_date)}
                        </span>
                        <span className="text-muted mx-1.5">–</span>
                        <span className="font-medium text-brand-900">
                          {formatDate(r.end_date)}
                        </span>
                      </p>
                      {r.reason ? (
                        <p className="text-sm text-muted leading-relaxed">
                          {r.reason}
                        </p>
                      ) : (
                        <p className="text-sm text-muted italic">No reason given</p>
                      )}
                    </div>
                    {tab === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reviewRequest(r.id, TIME_OFF_STATUS.APPROVED)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
                        >
                          {busy ? (
                            <Spinner size="sm" className="text-white" />
                          ) : (
                            <Check size={16} />
                          )}
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reviewRequest(r.id, TIME_OFF_STATUS.DENIED)}
                          className="btn-danger inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm disabled:opacity-50"
                        >
                          {busy ? (
                            <Spinner size="sm" className="text-white" />
                          ) : (
                            <X size={16} />
                          )}
                          Deny
                        </button>
                      </div>
                    )}
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
