export function formatBDT(amount) {
  return '৳' + new Intl.NumberFormat('en-US').format(amount ?? 0);
}
export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}
export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function apiErrorMessage(err) {
  return err?.response?.data?.error?.message || err?.message || 'Something went wrong';
}
