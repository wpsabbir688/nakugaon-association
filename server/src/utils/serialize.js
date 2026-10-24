// API serialization. Prisma records carry `id`; the previous MongoDB API
// exposed `_id`, and the React client reads `_id` everywhere (row keys,
// reverse/patch URLs). Every outgoing record therefore gets `_id: id`
// added, so the /api/v1 contract is unchanged and the client needs no edits.
// `id` itself is also kept (the old auth responses already used `id`).
export function withId(rec) {
  if (!rec) return rec;
  return { ...rec, _id: rec.id };
}

export function withIdList(rows) {
  return (rows || []).map(withId);
}

// Populated member reference, shaped like the old Mongoose populate
// (memberId businessName ownerName) plus _id.
export function memberRef(m) {
  if (!m) return null;
  return { _id: m.id, memberId: m.memberId, businessName: m.businessName, ownerName: m.ownerName };
}

// Safe user shape for admin listings (never password/reset/refresh hashes).
export function safeUser(u) {
  if (!u) return u;
  return { _id: u.id, id: u.id, name: u.name, email: u.email, role: u.role, memberId: u.memberId, isActive: u.isActive, createdAt: u.createdAt, updatedAt: u.updatedAt };
}
