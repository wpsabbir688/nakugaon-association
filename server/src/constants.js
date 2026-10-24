// Shared constants (previously lived on the Mongoose models).
export const ROLES = ['SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'OPERATOR', 'MEMBER'];
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  MANAGER: ['members:read', 'members:write', 'members:archive', 'vehicles:read', 'vehicles:write', 'weighbridge:read', 'weighbridge:write', 'payments:read', 'ledger:read', 'reports:read', 'notices:write', 'fees:read'],
  ACCOUNTANT: ['members:read', 'vehicles:read', 'weighbridge:read', 'payments:read', 'payments:write', 'payments:reverse', 'ledger:read', 'reports:read', 'expenses:read', 'expenses:write'],
  OPERATOR: ['members:read', 'vehicles:read', 'vehicles:write', 'weighbridge:read', 'weighbridge:write'],
  // MEMBER permissions are scoped by the own-record checks in the handlers:
  // a member can only ever read their own linked member record and ledger.
  MEMBER: ['portal:read', 'members:read', 'ledger:read'],
};

export const WEIGHBRIDGE_CATEGORIES = [
  { key: 'WB_BHUTAN', label: 'Bhutan vehicle' },
  { key: 'WB_BD', label: 'Bangladeshi vehicle' },
  { key: 'WB_LORRY', label: 'Lorry/crab vehicle' },
  { key: 'WB_TROLLEY', label: 'Trolley' },
];

export const DEFAULT_FEES = {
  VEHICLE_PER_UNIT: 50,
  WB_BHUTAN: 100,
  WB_BD: 200,
  WB_LORRY: 100,
  WB_TROLLEY: 300,
};

// Atomically reserve the next sequence value for a key (safe under
// concurrency: inside a transaction the upsert-increment serializes on the
// counter row). `tx` is a Prisma transaction client.
export async function nextSeq(tx, key) {
  const row = await tx.counter.upsert({
    where: { key },
    update: { seq: { increment: 1 } },
    create: { key, seq: 1 },
  });
  return row.seq;
}
