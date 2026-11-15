import { OmitType, PartialType } from '@nestjs/swagger';
import { REFERENCE_DATE } from '../../data/locales.js';
import { defineResource } from '../../data/resource.types.js';
import { CreatedAt, DateTime, Decimal, Id, OneOf, Ref, Text, UpdatedAt } from '../fields.js';
import { CURRENCIES } from './invoices.resource.js';

export const TRANSACTION_TYPES = ['credit', 'debit'] as const;
export const TRANSACTION_STATUSES = ['pending', 'completed', 'failed', 'reversed'] as const;
export const TRANSACTION_CATEGORIES = [
  'sales', 'payroll', 'rent', 'software', 'travel', 'marketing', 'utilities', 'taxes', 'refund', 'other',
] as const;

const PER_COMPANY = 100;
const INVOICES_PER_COMPANY = 20;

export class Transaction {
  @Id() id: number;

  @Ref('company') companyId: number;

  @Ref('invoice', true) invoiceId: number | null;

  @OneOf(TRANSACTION_TYPES, { example: 'credit', description: 'credit = money in, debit = money out.' })
  type: (typeof TRANSACTION_TYPES)[number];

  @OneOf(TRANSACTION_CATEGORIES, { example: 'sales' })
  category: (typeof TRANSACTION_CATEGORIES)[number];

  @Decimal(0.01, 10_000_000, { example: 1250.5 })
  amount: number;

  @OneOf(CURRENCIES, { example: 'USD' })
  currency: (typeof CURRENCIES)[number];

  @Text(1, 300, { example: 'invoice transaction at Kozey LLC using card ending with ***(...4365)' })
  description: string;

  @Text(1, 120, { example: 'Kozey LLC' })
  counterparty: string;

  @Text(4, 40, { example: 'TX-8F3K2Q9Z' })
  reference: string;

  @OneOf(TRANSACTION_STATUSES, { example: 'completed' })
  status: (typeof TRANSACTION_STATUSES)[number];

  @DateTime({ example: '2025-08-14T09:21:00.000Z' })
  occurredAt: string;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateTransactionDto extends OmitType(Transaction, ['id', 'createdAt', 'updatedAt'] as const) {}
export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}

const DEBIT_CATEGORIES = TRANSACTION_CATEGORIES.filter((c) => c !== 'sales');

export const transactions = defineResource<Transaction>({
  name: 'transactions',
  singular: 'transaction',
  group: 'Business',
  description: 'Bank transactions (money in and out), some linked to invoices, one hundred per company.',
  count: 5_000,
  entity: Transaction,
  createDto: CreateTransactionDto,
  replaceDto: CreateTransactionDto,
  patchDto: UpdateTransactionDto,
  parent: { resource: 'companies', key: 'companyId', perParent: PER_COMPANY },
  relations: [
    { name: 'company', key: 'companyId', resource: 'companies' },
    { name: 'invoice', key: 'invoiceId', resource: 'invoices', nullable: true },
  ],
  filters: [
    { field: 'companyId', type: 'number' },
    { field: 'invoiceId', type: 'number' },
    { field: 'type', type: 'enum', values: TRANSACTION_TYPES },
    { field: 'category', type: 'enum', values: TRANSACTION_CATEGORIES },
    { field: 'status', type: 'enum', values: TRANSACTION_STATUSES },
    { field: 'currency', type: 'enum', values: CURRENCIES },
    { field: 'amount', type: 'number', range: true },
    { field: 'occurredAt', type: 'date', range: true },
  ],
  sortable: ['amount', 'occurredAt', 'category', 'createdAt'],
  searchable: ['description', 'counterparty', 'reference'],
  generate: ({ faker, id, parentId, timestamps }) => {
    const type = faker.helpers.weightedArrayElement([
      { weight: 2, value: 'credit' as const },
      { weight: 3, value: 'debit' as const },
    ]);
    const category = type === 'credit' ? faker.helpers.arrayElement(['sales', 'sales', 'sales', 'refund'] as const) : faker.helpers.arrayElement(DEBIT_CATEGORIES);
    // Sales receipts settle one of the same company's invoices.
    const invoiceId =
      category === 'sales'
        ? (parentId - 1) * INVOICES_PER_COMPANY + faker.number.int({ min: 1, max: INVOICES_PER_COMPANY })
        : null;
    const occurredAt = faker.date.past({ years: 2, refDate: REFERENCE_DATE }).toISOString();
    return {
      id,
      companyId: parentId,
      invoiceId,
      type,
      category,
      amount: Number(faker.finance.amount({ min: 5, max: category === 'payroll' ? 50_000 : 10_000, dec: 2 })),
      currency: faker.helpers.arrayElement(CURRENCIES),
      description: faker.finance.transactionDescription(),
      counterparty: faker.company.name(),
      reference: `TX-${faker.string.alphanumeric({ length: 8, casing: 'upper' })}`,
      status: faker.helpers.weightedArrayElement([
        { weight: 2, value: 'pending' as const },
        { weight: 16, value: 'completed' as const },
        { weight: 1, value: 'failed' as const },
        { weight: 1, value: 'reversed' as const },
      ]),
      occurredAt,
      ...timestamps(),
    };
  },
});
