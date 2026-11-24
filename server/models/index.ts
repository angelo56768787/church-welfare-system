import mongoose, { Schema, Types } from 'mongoose';

const opts = { timestamps: true } as const;
const ref = (to: string, extra: object = {}) => ({ type: Schema.Types.ObjectId, ref: to, ...extra });
const minor = (extra: object = {}) => ({
  type: Number,
  min: 0,
  validate: { validator: Number.isInteger, message: 'المبلغ يجب أن يكون عددًا صحيحًا بالقروش' },
  ...extra,
});

export const User = mongoose.models.User ?? mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
  active: { type: Boolean, default: true },
}, opts));

export const Church = mongoose.models.Church ?? mongoose.model('Church', new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  sector: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' },
}, opts));

const beneficiarySchema = new Schema({
  code: { type: String, required: true, unique: true },
  fullName: { type: String, required: true, trim: true },
  nationalId: { type: String, trim: true, sparse: true, unique: true },
  phone: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  church: ref('Church', { required: true, index: true }),
  sector: { type: String, trim: true, default: '' },
  registrationDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'suspended', 'inactive'], default: 'active', index: true },
  /** Recurring monthly assistance in piasters; 0 = none. */
  monthlyAssistance: minor({ default: 0 }),
  notes: { type: String, default: '' },
  attachments: [{ name: String, url: String, addedAt: { type: Date, default: Date.now } }],
  isDemo: { type: Boolean, default: false },
}, opts);
beneficiarySchema.index({ fullName: 'text' });
export const Beneficiary = mongoose.models.Beneficiary ?? mongoose.model('Beneficiary', beneficiarySchema);

const assistanceSchema = new Schema({
  beneficiary: ref('Beneficiary', { required: true, index: true }),
  church: ref('Church', { required: true, index: true }),
  period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/, index: true },
  originalAmount: minor({ required: true }),
  /** Loan installment deducted from this assistance. Net is derived: original - deduction. */
  deductionAmount: minor({ default: 0 }),
  installment: ref('Installment'),
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending', index: true },
  paymentDate: Date,
  notes: { type: String, default: '' },
}, opts);
assistanceSchema.index({ beneficiary: 1, period: 1 }, { unique: true }); // no duplicate monthly assistance
assistanceSchema.virtual('netAmount').get(function (this: any) { return this.originalAmount - this.deductionAmount; });
assistanceSchema.set('toJSON', { virtuals: true });
export const AssistanceRecord = mongoose.models.AssistanceRecord ?? mongoose.model('AssistanceRecord', assistanceSchema);

export const Loan = mongoose.models.Loan ?? mongoose.model('Loan', new Schema({
  reference: { type: String, required: true, unique: true },
  beneficiary: ref('Beneficiary', { required: true, index: true }),
  church: ref('Church', { required: true, index: true }),
  amount: minor({ required: true }),
  loanDate: { type: Date, required: true },
  installmentAmount: minor({ required: true }),
  installmentsCount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active', index: true },
  notes: { type: String, default: '' },
  isDemo: { type: Boolean, default: false },
}, opts));

/** Installment = schedule only. Paid amount is derived from Repayment allocations. */
const installmentSchema = new Schema({
  loan: ref('Loan', { required: true, index: true }),
  beneficiary: ref('Beneficiary', { required: true, index: true }),
  number: { type: Number, required: true },
  dueDate: { type: Date, required: true, index: true },
  period: { type: String, required: true, index: true },
  amount: minor({ required: true }),
}, opts);
installmentSchema.index({ loan: 1, number: 1 }, { unique: true });
export const Installment = mongoose.models.Installment ?? mongoose.model('Installment', installmentSchema);

const repaymentSchema = new Schema({
  loan: ref('Loan', { required: true, index: true }),
  beneficiary: ref('Beneficiary', { required: true, index: true }),
  church: ref('Church', { required: true }),
  amount: minor({ required: true }),
  date: { type: Date, required: true, index: true },
  reference: { type: String, required: true, unique: true },
  source: { type: String, enum: ['cash', 'assistance_deduction'], default: 'cash' },
  assistanceRecord: ref('AssistanceRecord', { sparse: true, unique: true }), // one deduction per assistance record
  idempotencyKey: { type: String, sparse: true, unique: true },              // blocks duplicate submissions
  allocations: [{ installment: ref('Installment'), amount: minor() }],
  notes: { type: String, default: '' },
  recordedBy: ref('User'),
}, opts);
export const Repayment = mongoose.models.Repayment ?? mongoose.model('Repayment', repaymentSchema);

export const FinancialTransaction = mongoose.models.FinancialTransaction ?? mongoose.model('FinancialTransaction', new Schema({
  reference: { type: String, required: true, unique: true },
  type: { type: String, enum: ['assistance_payment', 'loan_disbursement', 'repayment', 'assistance_deduction'], required: true, index: true },
  /** out = money leaves the office, in = money collected, offset = settled against assistance (no cash moves) */
  direction: { type: String, enum: ['out', 'in', 'offset'], required: true },
  amount: minor({ required: true }),
  date: { type: Date, required: true, index: true },
  beneficiary: ref('Beneficiary', { required: true, index: true }),
  church: ref('Church', { required: true, index: true }),
  loan: ref('Loan'),
  assistanceRecord: ref('AssistanceRecord'),
  repayment: ref('Repayment'),
  status: { type: String, enum: ['completed'], default: 'completed' },
  recordedBy: ref('User'),
}, opts));

export const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', new Schema({
  user: ref('User'),
  userName: String,
  action: { type: String, required: true, index: true },
  entity: { type: String, required: true, index: true },
  entityId: String,
  summary: String,
  changes: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } }));

export const SystemSetting = mongoose.models.SystemSetting ?? mongoose.model('SystemSetting', new Schema({
  _id: String,
  value: Schema.Types.Mixed,
}, opts));

export type Id = Types.ObjectId | string;
