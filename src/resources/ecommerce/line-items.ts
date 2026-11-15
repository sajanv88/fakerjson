import { HttpStatus } from '@nestjs/common';
import type { Faker } from '@faker-js/faker';
import { ApiValidationException } from '../../common/errors.js';
import type { Entity } from '../../data/resource.types.js';
import { Computed, Int, Ref } from '../fields.js';
import { round2 } from '../shared.js';
import type { Product } from './products.resource.js';

/** One product line. Clients send `productId` and `quantity`; the rest is priced by the server. */
export class LineItem {
  @Ref('product') productId: number;

  @Int(1, 99, { example: 2 })
  quantity: number;

  @Computed({ type: String, example: 'Ergonomic Steel Keyboard' })
  name: string;

  @Computed({ type: String, format: 'uri', example: 'https://picsum.photos/seed/product-1/300/300' })
  thumbnail: string;

  @Computed({ type: Number, example: 116.99, description: 'Product final price at the time of purchase.' })
  unitPrice: number;

  @Computed({ type: Number, example: 233.98 })
  lineTotal: number;
}

export interface Totals {
  totalItems: number;
  totalQuantity: number;
  subtotal: number;
}

export function priceLine(product: Pick<Product, 'id' | 'name' | 'thumbnail' | 'finalPrice'>, quantity: number): LineItem {
  return {
    productId: product.id,
    quantity,
    name: product.name,
    thumbnail: product.thumbnail,
    unitPrice: product.finalPrice,
    lineTotal: round2(product.finalPrice * quantity),
  };
}

export function totalsOf(items: LineItem[]): Totals {
  return {
    totalItems: items.length,
    totalQuantity: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: round2(items.reduce((n, i) => n + i.lineTotal, 0)),
  };
}

/** 1–`max` distinct products, priced from the real product rows. */
export function fakeLines(faker: Faker, get: <T>(resource: string, id: number) => T, productCount: number, max: number): LineItem[] {
  const ids = faker.helpers.uniqueArray(() => faker.number.int({ min: 1, max: productCount }), faker.number.int({ min: 1, max }));
  return ids.map((pid) => priceLine(get<Product>('products', pid), faker.number.int({ min: 1, max: 4 })));
}

/** Re-prices client-sent lines from the product catalogue (422 when a product does not exist). */
export function repriceLines(
  items: { productId: number; quantity: number }[] | undefined,
  lookup: (resource: string, id: number) => Entity | undefined,
  field = 'items',
): LineItem[] {
  const missing: { field: string; message: string }[] = [];
  const priced = (items ?? []).flatMap((item, i) => {
    const product = lookup('products', item.productId) as unknown as Product | undefined;
    if (!product) {
      missing.push({ field: `${field}.${i}.productId`, message: `Product ${item.productId} does not exist` });
      return [];
    }
    return [priceLine(product, item.quantity)];
  });
  if (missing.length) {
    throw new ApiValidationException(missing, HttpStatus.UNPROCESSABLE_ENTITY, 'The request body references rows that do not exist.');
  }
  return priced;
}
