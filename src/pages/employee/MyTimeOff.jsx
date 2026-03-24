import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/helpers';
import { TIME_OFF_STATUS } from '../../lib/constants';
import TopBar from '../../components/layout/TopBar';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import { CalendarOff } from 'lucide-react';

function statusBadgeClass(status) {
  if (status === TIME_OFF_STATUS.PENDING) return 'badge-pending';
  if (status === TIME_OFF_STATUS.APPROVED) return 'badge-approved';
  return 'badge-denied';
}

export default function MyTimeOff() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const [success, setSuccess] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const loadRequests = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('time_off_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error) setRequests(data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user?.id || !startDate || !endDate) return;
    setSubmitting(true);
    setSuccess(false);
    const { error } = await supabase.from('time_off_requests').insert({
      user_id: user.id,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
      status: TIME_OFF_STATUS.PENDING,
    });
    setSubmitting(false);
    if (!error) {
      setStartDate('');
      setEndDate('');
      setReason('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
      await loadRequests();
    }
  }

  if (loading && requests.length === 0) {
    return (
      <>
        <TopBar title="Time Off" />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Time Off" />
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-6">
        {success && (
          <Alert variant="success" title="Request submitted">
            Your time off request was sent for review.
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="card shadow-card-lg space-y-4">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-brand-50 p-2">
              <CalendarOff size={20} className="text-brand-500" />
            </div>
            <h2 className="text-lg font-bold text-brand-900">Request time off</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="pto-start">
                Start date
              </label>
              <input
                id="pto-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label" htmlFor="pto-end">
                End date
              </label>
              <input
                id="pto-end"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="pto-reason">
              Reason <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              id="pto-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field resize-none"
              placeholder="Add any details for your manager…"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            {submitting ? <Spinner size="sm" className="text-white" /> : null}
            Submit request
          </button>
        </form>

        <section>
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Your requests
          </h3>
          {requests.length === 0 ? (
            <div className="card">
              <p className="text-sm text-muted text-center py-8">
                You have not submitted any time off requests yet.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-card transition-shadow hover:shadow-card-lg"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-900">
                      {formatDate(r.start_date)}
                      <span className="text-muted font-normal mx-1.5">–</span>
                      {formatDate(r.end_date)}
                    </p>
                    {r.reason ? (
                      <p className="text-sm text-muted mt-1 leading-relaxed">{r.reason}</p>
                    ) : null}
                  </div>
                  <span className={`${statusBadgeClass(r.status)} shrink-0 self-start sm:self-center`}>
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
