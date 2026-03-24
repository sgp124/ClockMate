export const EMPLOYEE_COLORS = [
  '#4F46E5', // Indigo
  '#10B981', // Emerald
  '#0EA5E9', // Sky Blue
  '#F59E0B', // Amber
  '#F43F5E', // Rose
  '#8B5CF6', // Violet
  '#14B8A6', // Teal
];

export const ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  KIOSK: 'kiosk',
};

export const SHIFT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
};

export const TIME_OFF_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
};

export const AUDIT_ACTIONS = {
  GRANT_ADMIN: 'GRANT_ADMIN',
  REVOKE_ADMIN: 'REVOKE_ADMIN',
  UPDATE_PAY_RATE: 'UPDATE_PAY_RATE',
  EDIT_TIME_LOG: 'EDIT_TIME_LOG',
  DEACTIVATE_USER: 'DEACTIVATE_USER',
  CREATE_USER: 'CREATE_USER',
};

export const PAY_PERIOD_TYPES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'semimonthly', label: 'Semi-monthly' },
  { value: 'monthly', label: 'Monthly' },
];

export const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
