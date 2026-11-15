import { OmitType, PartialType } from '@nestjs/swagger';
import { REFERENCE_DATE } from '../../data/locales.js';
import { defineResource } from '../../data/resource.types.js';
import {
  Computed,
  CreatedAt,
  DateOnly,
  DateTime,
  Decimal,
  Email,
  Id,
  Int,
  NestedList,
  OneOf,
  Ref,
  Text,
  UpdatedAt,
} from '../fields.js';
import { round2 } from '../shared.js';

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void'] as const;
export const CURRENCIES = ['USD', 'EUR', 'GBP'] as const;

export class InvoiceLine {
  @Text(1, 200, { example: 'Consulting services (hours)' })
  description: string;

  @Int(1, 10_000, { example: 12 })
  quantity: number;

  @Decimal(0, 1_000_000, { example: 150 })
  unitPrice: number;

  @Computed({ type: Number, example: 1800 })
  amount: number;
}

export class Invoice {
  @Id() id: number;

  @Ref('company') companyId: number;

  @Computed({ type: String, example: 'INV-0001-0001', description: 'Issuer company and sequence.' })
  invoiceNumber: string;

  @Text(1, 120, { example: 'Hettinger Group' })
  customerName: string;

  @Email({ example: 'billing@hettinger.example.com' })
  customerEmail: string;

  @OneOf(INVOICE_STATUSES, { example: 'sent' })
  status: (typeof INVOICE_STATUSES)[number];

  @OneOf(CURRENCIES, { example: 'EUR' })
  currency: (typeof CURRENCIES)[number];

  @NestedList(() => InvoiceLine, 100)
  lines: InvoiceLine[];

  @Computed({ type: Number, example: 1800 })
  subtotal: number;

  @Decimal(0, 50, { example: 21, description: 'Tax rate in percent.' })
  taxRate: number;

  @Computed({ type: Number, example: 378 })
  tax: number;

  @Computed({ type: Number, example: 2178 })
  total: number;

  @DateOnly({ example: '2025-05-01' })
  issueDate: string;

  @DateOnly({ example: '2025-05-31' })
  dueDate: string;

  @DateTime({ example: '2025-05-20T10:12:00.000Z' }, true)
  paidAt: string | null;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateInvoiceDto extends OmitType(Invoice, [
  'id', 'invoiceNumber', 'subtotal', 'tax', 'total', 'createdAt', 'updatedAt',
] as const) {}
export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

const PER_COMPANY = 20;

const invoiceNumber = (id: number, companyId: number) =>
  `INV-${String(companyId).padStart(4, '0')}-${String(((id - 1) % PER_COMPANY) + 1).padStart(4, '0')}`;

function totals(lines: { description: string; quantity: number; unitPrice: number }[], taxRate: number) {
  const priced = lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: round2(l.quantity * l.unitPrice),
  }));
  const subtotal = round2(priced.reduce((n, l) => n + l.amount, 0));
  const tax = round2((subtotal * taxRate) / 100);
  return { lines: priced, subtotal, tax, total: round2(subtotal + tax) };
}

const SERVICES = [
  'Consulting services (hours)', 'Software license', 'Support plan', 'Implementation',
  'Training workshop', 'Cloud hosting', 'Design work (hours)', 'Maintenance retainer',
];

export const invoices = defineResource<Invoice>({
  name: 'invoices',
  singular: 'invoice',
  group: 'Business',
  description: 'Invoices issued by companies, with lines, tax and payment status, twenty per company.',
  count: 1_000,
  entity: Invoice,
  createDto: CreateInvoiceDto,
  replaceDto: CreateInvoiceDto,
  patchDto: UpdateInvoiceDto,
  parent: { resource: 'companies', key: 'companyId', perParent: PER_COMPANY },
  relations: [{ name: 'company', key: 'companyId', resource: 'companies' }],
  filters: [
    { field: 'companyId', type: 'number' },
    { field: 'status', type: 'enum', values: INVOICE_STATUSES },
    { field: 'currency', type: 'enum', values: CURRENCIES },
    { field: 'total', type: 'number', range: true },
    { field: 'issueDate', type: 'date', range: true },
    { field: 'dueDate', type: 'date', range: true },
  ],
  sortable: ['invoiceNumber', 'customerName', 'total', 'issueDate', 'dueDate', 'createdAt'],
  searchable: ['invoiceNumber', 'customerName', 'customerEmail'],
  generate: ({ faker, id, parentId, timestamps }) => {
    const issue = faker.date.past({ years: 2, refDate: REFERENCE_DATE });
    const due = new Date(issue.getTime() + faker.helpers.arrayElement([14, 30, 45, 60]) * 86_400_000);
    const customerName = faker.company.name();
    const status = due < REFERENCE_DATE
      ? faker.helpers.weightedArrayElement([
          { weight: 14, value: 'paid' as const },
          { weight: 4, value: 'overdue' as const },
          { weight: 1, value: 'void' as const },
        ])
      : faker.helpers.weightedArrayElement([
          { weight: 2, value: 'draft' as const },
          { weight: 6, value: 'sent' as const },
          { weight: 3, value: 'paid' as const },
        ]);
    const lines = Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
      description: faker.helpers.arrayElement(SERVICES),
      quantity: faker.number.int({ min: 1, max: 40 }),
      unitPrice: Number(faker.commerce.price({ min: 20, max: 2_000, dec: 2 })),
    }));
    const taxRate = faker.helpers.arrayElement([0, 5, 10, 19, 20, 21]);
    return {
      id,
      companyId: parentId,
      invoiceNumber: invoiceNumber(id, parentId),
      customerName,
      customerEmail: `billing@${customerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.example.com`,
      status,
      currency: faker.helpers.arrayElement(CURRENCIES),
      taxRate,
      ...totals(lines, taxRate),
      issueDate: issue.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      paidAt: status === 'paid' ? faker.date.between({ from: issue, to: due < REFERENCE_DATE ? due : REFERENCE_DATE }).toISOString() : null,
      ...timestamps(),
    };
  },
  derive: (row) => ({ invoiceNumber: invoiceNumber(row.id, row.companyId), ...totals(row.lines ?? [], row.taxRate) }),
});
