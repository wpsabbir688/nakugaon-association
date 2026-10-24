import mongoose from 'mongoose';

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

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
    isActive: { type: Boolean, default: true },
    refreshTokenHash: { type: String, default: null, select: false },
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
