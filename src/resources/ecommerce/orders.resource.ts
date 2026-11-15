import { OmitType, PartialType } from '@nestjs/swagger';
import { REFERENCE_DATE } from '../../data/locales.js';
import { defineResource } from '../../data/resource.types.js';
import { Computed, CreatedAt, DateTime, Id, Nested, NestedList, OneOf, Ref, UpdatedAt } from '../fields.js';
import { Address, fakeAddress, round2 } from '../shared.js';
import { LineItem, fakeLines, repriceLines, totalsOf } from './line-items.js';
import { CURRENCY } from './products.resource.js';

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'] as const;
export const PAYMENT_METHODS = ['card', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer'] as const;

const TAX_RATE = 0.08;
const FREE_SHIPPING_FROM = 100;
const SHIPPING_FEE = 7.95;

export class Order {
  @Id() id: number;

  @Ref('user') userId: number;

  @Computed({ type: String, example: 'ORD-2025-000001' })
  orderNumber: string;

  @OneOf(ORDER_STATUSES, { example: 'shipped' })
  status: (typeof ORDER_STATUSES)[number];

  @NestedList(() => LineItem, 50)
  items: LineItem[];

  @Computed({ type: Number, example: 233.98 })
  subtotal: number;

  @Computed({ type: Number, example: 0, description: `Free from ${FREE_SHIPPING_FROM}, otherwise ${SHIPPING_FEE}.` })
  shipping: number;

  @Computed({ type: Number, example: 18.72, description: `${TAX_RATE * 100}% of the subtotal.` })
  tax: number;

  @Computed({ type: Number, example: 252.7 })
  total: number;

  @Computed({ type: String, example: CURRENCY })
  currency: string;

  @OneOf(PAYMENT_METHODS, { example: 'card' })
  paymentMethod: (typeof PAYMENT_METHODS)[number];

  @Nested(() => Address)
  shippingAddress: Address;

  @DateTime({ example: '2025-06-01T12:00:00.000Z' })
  placedAt: string;

  @DateTime({ example: '2025-06-05T15:30:00.000Z' }, true)
  deliveredAt: string | null;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateOrderDto extends OmitType(Order, [
  'id', 'orderNumber', 'subtotal', 'shipping', 'tax', 'total', 'currency', 'createdAt', 'updatedAt',
] as const) {}
export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

function amounts(items: LineItem[]) {
  const { subtotal } = totalsOf(items);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  const tax = round2(subtotal * TAX_RATE);
  return { subtotal, shipping, tax, total: round2(subtotal + shipping + tax), currency: CURRENCY };
}

const orderNumber = (id: number, placedAt: string) => `ORD-${placedAt.slice(0, 4)}-${String(id).padStart(6, '0')}`;

export const orders = defineResource<Order>({
  name: 'orders',
  singular: 'order',
  group: 'E-commerce',
  description: 'Orders with priced lines, tax, shipping and status history, ten per user.',
  count: 1_000,
  entity: Order,
  createDto: CreateOrderDto,
  replaceDto: CreateOrderDto,
  patchDto: UpdateOrderDto,
  parent: { resource: 'users', key: 'userId', perParent: 10 },
  relations: [{ name: 'user', key: 'userId', resource: 'users' }],
  filters: [
    { field: 'userId', type: 'number' },
    { field: 'status', type: 'enum', values: ORDER_STATUSES },
    { field: 'paymentMethod', type: 'enum', values: PAYMENT_METHODS },
    { field: 'total', type: 'number', range: true },
    { field: 'placedAt', type: 'date', range: true },
  ],
  sortable: ['orderNumber', 'total', 'placedAt', 'createdAt', 'updatedAt'],
  searchable: ['orderNumber', 'items.name'],
  generate: ({ faker, id, parentId, get, count, timestamps }) => {
    const items = fakeLines(faker, get, count('products'), 6);
    const ts = timestamps();
    const status = faker.helpers.weightedArrayElement([
      { weight: 1, value: 'pending' as const },
      { weight: 2, value: 'paid' as const },
      { weight: 2, value: 'shipped' as const },
      { weight: 8, value: 'delivered' as const },
      { weight: 1, value: 'cancelled' as const },
      { weight: 1, value: 'refunded' as const },
    ]);
    const deliveredAt =
      status === 'delivered'
        ? faker.date.between({ from: ts.createdAt, to: REFERENCE_DATE }).toISOString()
        : null;
    return {
      id,
      userId: parentId,
      orderNumber: orderNumber(id, ts.createdAt),
      status,
      items,
      ...amounts(items),
      paymentMethod: faker.helpers.arrayElement(PAYMENT_METHODS),
      shippingAddress: fakeAddress(faker),
      placedAt: ts.createdAt,
      deliveredAt,
      ...ts,
    };
  },
  derive: (row, lookup) => {
    const items = repriceLines(row.items, lookup);
    return { orderNumber: orderNumber(row.id, row.placedAt ?? row.createdAt), items, ...amounts(items) };
  },
});
