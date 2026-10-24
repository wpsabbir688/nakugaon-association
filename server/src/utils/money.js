// Money: integer Bangladeshi Taka only. Never use floats for money.
export function assertIntegerTaka(value, field = 'amount') {
  if (!Number.isInteger(value)) throw new Error(`${field} must be an integer Taka amount`);
  return value;
}
export function formatBDT(amount) {
  return '৳' + new Intl.NumberFormat('en-US').format(amount);
}
