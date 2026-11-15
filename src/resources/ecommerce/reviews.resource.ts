import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Bool, Computed, CreatedAt, Id, Int, Ref, Text, UpdatedAt } from '../fields.js';

export class Review {
  @Id() id: number;

  @Ref('product') productId: number;

  @Ref('user') userId: number;

  @Int(1, 5, { example: 4 })
  rating: number;

  @Text(2, 120, { example: 'Great value for money' })
  title: string;

  @Text(1, 5_000, { example: 'Arrived quickly and works exactly as described.' })
  comment: string;

  @Bool({ example: true })
  verifiedPurchase: boolean;

  @Computed({ type: 'integer', minimum: 0, example: 12 })
  helpfulCount: number;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateReviewDto extends OmitType(Review, ['id', 'helpfulCount', 'createdAt', 'updatedAt'] as const) {}
export class UpdateReviewDto extends PartialType(CreateReviewDto) {}

const TITLES: Record<number, string[]> = {
  1: ['Very disappointed', 'Would not recommend', 'Broke after a week'],
  2: ['Not great', 'Below expectations', 'Meh'],
  3: ['It is okay', 'Does the job', 'Average quality'],
  4: ['Really good', 'Great value for money', 'Happy with it'],
  5: ['Excellent!', 'Exactly what I needed', 'Five stars, would buy again'],
};

export const reviews = defineResource<Review>({
  name: 'reviews',
  singular: 'review',
  group: 'E-commerce',
  description: 'Product reviews written by users, five per product.',
  count: 2_500,
  entity: Review,
  createDto: CreateReviewDto,
  replaceDto: CreateReviewDto,
  patchDto: UpdateReviewDto,
  parent: { resource: 'products', key: 'productId', perParent: 5 },
  relations: [
    { name: 'product', key: 'productId', resource: 'products' },
    { name: 'user', key: 'userId', resource: 'users' },
  ],
  filters: [
    { field: 'productId', type: 'number' },
    { field: 'userId', type: 'number' },
    { field: 'rating', type: 'number', range: true },
    { field: 'verifiedPurchase', type: 'boolean' },
  ],
  sortable: ['rating', 'helpfulCount', 'createdAt'],
  searchable: ['title', 'comment'],
  generate: ({ faker, id, parentId, pickId, timestamps }) => {
    const rating = faker.helpers.weightedArrayElement([
      { weight: 1, value: 1 },
      { weight: 1, value: 2 },
      { weight: 2, value: 3 },
      { weight: 4, value: 4 },
      { weight: 5, value: 5 },
    ]);
    return {
      id,
      productId: parentId,
      userId: pickId('users'),
      rating,
      title: faker.helpers.arrayElement(TITLES[rating] ?? TITLES[3]!),
      comment: faker.lorem.sentences({ min: 1, max: 4 }),
      verifiedPurchase: faker.datatype.boolean({ probability: 0.8 }),
      helpfulCount: faker.number.int({ min: 0, max: 80 }),
      ...timestamps(),
    };
  },
  derive: (row) => ({ helpfulCount: row.helpfulCount ?? 0 }),
});
