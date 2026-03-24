import bcrypt from 'bcryptjs';

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good Morning', emoji: '☀️' };
  if (hour < 17) return { text: 'Good Afternoon', emoji: '🌤️' };
  return { text: 'Good Evening', emoji: '🌙' };
}

export function formatTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDateFull(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getBusinessDate(now = new Date(), businessDayStartHour = 10) {
  const hour = now.getHours();
  if (hour < businessDayStartHour) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return toDateString(yesterday);
  }
  return toDateString(now);
}

export function toDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekRange(date) {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toDateString(monday),
    end: toDateString(sunday),
    dates: Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      return toDateString(dt);
    }),
  };
}

export function calcDurationHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const diff = new Date(clockOut) - new Date(clockIn);
  return Math.round((diff / (1000 * 60 * 60)) * 100) / 100;
}

export function formatDuration(hours) {
  if (!hours) return '0:00';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function derivePinFromPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length >= 4) {
    return digits.slice(-4);
  }
  return generateRandomPin();
}

export function generateRandomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
