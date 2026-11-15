import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Computed, CreatedAt, Id, NestedList, Ref, UpdatedAt } from '../fields.js';
import { LineItem, fakeLines, repriceLines, totalsOf } from './line-items.js';
import { CURRENCY } from './products.resource.js';

export class Cart {
  @Id() id: number;

  @Ref('user') userId: number;

  @NestedList(() => LineItem, 50)
  items: LineItem[];

  @Computed({ type: 'integer', example: 3, description: 'Distinct products.' })
  totalItems: number;

  @Computed({ type: 'integer', example: 5, description: 'Sum of quantities.' })
  totalQuantity: number;

  @Computed({ type: Number, example: 349.97 })
  subtotal: number;

  @Computed({ type: String, example: CURRENCY })
  currency: string;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateCartDto extends OmitType(Cart, [
  'id', 'totalItems', 'totalQuantity', 'subtotal', 'currency', 'createdAt', 'updatedAt',
] as const) {}
export class UpdateCartDto extends PartialType(CreateCartDto) {}

export const carts = defineResource<Cart>({
  name: 'carts',
  singular: 'cart',
  group: 'E-commerce',
  description: 'Shopping carts, one per user. Lines are priced from the real products.',
  count: 100,
  entity: Cart,
  createDto: CreateCartDto,
  replaceDto: CreateCartDto,
  patchDto: UpdateCartDto,
  parent: { resource: 'users', key: 'userId', perParent: 1 },
  relations: [{ name: 'user', key: 'userId', resource: 'users' }],
  filters: [
    { field: 'userId', type: 'number' },
    { field: 'subtotal', type: 'number', range: true },
    { field: 'totalQuantity', type: 'number', range: true },
  ],
  sortable: ['subtotal', 'totalQuantity', 'createdAt', 'updatedAt'],
  generate: ({ faker, id, parentId, get, count, timestamps }) => {
    const items = fakeLines(faker, get, count('products'), 5);
    return { id, userId: parentId, items, ...totalsOf(items), currency: CURRENCY, ...timestamps() };
  },
  derive: (row, lookup) => {
    const items = repriceLines(row.items, lookup);
    return { items, ...totalsOf(items), currency: CURRENCY };
  },
});
