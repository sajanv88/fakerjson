import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Computed, CreatedAt, Decimal, Id, Int, OneOf, Ref, Strings, Text, UpdatedAt, Url, Urls } from '../fields.js';
import { picsum, round2 } from '../shared.js';

export const PRODUCT_STATUSES = ['active', 'draft', 'discontinued'] as const;
export const CURRENCY = 'USD';

export class Product {
  @Id() id: number;

  @Ref('category') categoryId: number;

  @Text(3, 40, { example: 'ELE-0001-8F3K' })
  sku: string;

  @Text(2, 200, { example: 'Ergonomic Steel Keyboard' })
  name: string;

  @Computed({ type: String, example: 'ergonomic-steel-keyboard' })
  slug: string;

  @Text(0, 5_000, { example: 'The slim & simple Maple Gaming Keyboard from Dev Byte comes with a sleek body.' })
  description: string;

  @Text(1, 80, { example: 'Acme' })
  brand: string;

  @Decimal(0, 1_000_000, { example: 129.99, description: 'List price.' })
  price: number;

  @Decimal(0, 90, { example: 10, description: 'Percentage off the list price.' })
  discountPercentage: number;

  @Computed({ type: Number, example: 116.99, description: 'Price after discount.' })
  finalPrice: number;

  @Computed({ type: String, example: CURRENCY })
  currency: string;

  @Int(0, 1_000_000, { example: 42 })
  stock: number;

  @Computed({ type: Number, minimum: 1, maximum: 5, example: 4.3, description: 'Average review rating.' })
  rating: number;

  @Computed({ type: 'integer', example: 5 })
  reviewCount: number;

  @Url({ example: 'https://picsum.photos/seed/product-1/300/300' })
  thumbnail: string;

  @Urls(10, { example: ['https://picsum.photos/seed/product-1-0/1200/1200'] })
  images: string[];

  @Strings(10, { example: ['wireless', 'bestseller'] })
  tags: string[];

  @OneOf(PRODUCT_STATUSES, { example: 'active' })
  status: (typeof PRODUCT_STATUSES)[number];

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateProductDto extends OmitType(Product, [
  'id', 'slug', 'finalPrice', 'currency', 'rating', 'reviewCount', 'createdAt', 'updatedAt',
] as const) {}
export class UpdateProductDto extends PartialType(CreateProductDto) {}

const TAGS = ['bestseller', 'new', 'eco', 'limited', 'sale', 'premium', 'wireless', 'handmade', 'gift', 'bundle'];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Unit price a shopper pays, used by carts and orders too. */
export const finalPrice = (price: number, discountPercentage: number) => round2(price * (1 - discountPercentage / 100));

export const products = defineResource<Product>({
  name: 'products',
  singular: 'product',
  group: 'E-commerce',
  description: 'Catalogue items with price, stock, rating and images, twenty-five per category.',
  count: 500,
  entity: Product,
  createDto: CreateProductDto,
  replaceDto: CreateProductDto,
  patchDto: UpdateProductDto,
  parent: { resource: 'categories', key: 'categoryId', perParent: 25 },
  relations: [{ name: 'category', key: 'categoryId', resource: 'categories' }],
  filters: [
    { field: 'categoryId', type: 'number' },
    { field: 'brand', type: 'string' },
    { field: 'status', type: 'enum', values: PRODUCT_STATUSES },
    { field: 'tags', type: 'string', description: 'Products carrying this tag.' },
    { field: 'price', type: 'number', range: true },
    { field: 'finalPrice', type: 'number', range: true },
    { field: 'rating', type: 'number', range: true },
    { field: 'stock', type: 'number', range: true },
  ],
  sortable: ['name', 'brand', 'price', 'finalPrice', 'discountPercentage', 'rating', 'stock', 'createdAt', 'updatedAt'],
  searchable: ['name', 'description', 'brand', 'sku', 'tags'],
  generate: ({ faker, id, parentId, get, timestamps }) => {
    // Rating is the real average of this product's five reviews.
    const reviewRatings = Array.from({ length: 5 }, (_, i) => get<{ rating: number }>('reviews', (id - 1) * 5 + i + 1).rating);
    const rating = round2(reviewRatings.reduce((a, b) => a + b, 0) / reviewRatings.length);
    const name = faker.commerce.productName();
    const price = Number(faker.commerce.price({ min: 5, max: 2_000, dec: 2 }));
    const discountPercentage = faker.helpers.maybe(() => faker.helpers.arrayElement([5, 10, 15, 20, 25, 30, 40, 50]), { probability: 0.35 }) ?? 0;
    const imageCount = faker.number.int({ min: 1, max: 5 });
    return {
      id,
      categoryId: parentId,
      sku: `${faker.string.alpha({ length: 3, casing: 'upper' })}-${String(id).padStart(4, '0')}-${faker.string.alphanumeric({ length: 4, casing: 'upper' })}`,
      name,
      slug: slug(name),
      description: faker.commerce.productDescription(),
      brand: faker.company.name().split(/[ ,-]/)[0] ?? 'Generic',
      price,
      discountPercentage,
      finalPrice: finalPrice(price, discountPercentage),
      currency: CURRENCY,
      stock: faker.helpers.weightedArrayElement([
        { weight: 1, value: 0 },
        { weight: 9, value: faker.number.int({ min: 1, max: 500 }) },
      ]),
      rating,
      reviewCount: reviewRatings.length,
      thumbnail: picsum(`product-${id}`, 300, 300),
      images: Array.from({ length: imageCount }, (_, i) => picsum(`product-${id}-${i}`, 1200, 1200)),
      tags: faker.helpers.arrayElements(TAGS, { min: 0, max: 3 }),
      status: faker.helpers.weightedArrayElement([
        { weight: 17, value: 'active' as const },
        { weight: 2, value: 'draft' as const },
        { weight: 1, value: 'discontinued' as const },
      ]),
      ...timestamps(),
    };
  },
  derive: (row) => ({
    slug: slug(row.name),
    finalPrice: finalPrice(row.price, row.discountPercentage),
    currency: CURRENCY,
    rating: row.rating ?? 0,
    reviewCount: row.reviewCount ?? 0,
  }),
});
