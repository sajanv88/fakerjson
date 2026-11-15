import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Computed, CreatedAt, Id, Text, UpdatedAt, Url } from '../fields.js';
import { picsum } from '../shared.js';

/** Fixed names keep categories unique and recognisable across seeds. */
export const CATEGORY_NAMES = [
  'Electronics', 'Computers', 'Smartphones', 'Audio', 'Cameras',
  'Home & Kitchen', 'Furniture', 'Garden', 'Tools', 'Automotive',
  'Fashion', 'Shoes', 'Jewelry', 'Beauty', 'Health',
  'Sports & Outdoors', 'Toys & Games', 'Books', 'Grocery', 'Pet Supplies',
] as const;

const toSlug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export class Category {
  @Id() id: number;

  @Text(2, 80, { example: 'Electronics' })
  name: string;

  @Computed({ type: String, example: 'electronics', description: 'Derived from the name.' })
  slug: string;

  @Text(0, 500, { example: 'Gadgets, devices and accessories.' })
  description: string;

  @Url({ example: 'https://picsum.photos/seed/category-1/640/360' })
  imageUrl: string;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateCategoryDto extends OmitType(Category, ['id', 'slug', 'createdAt', 'updatedAt'] as const) {}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export const categories = defineResource<Category>({
  name: 'categories',
  singular: 'category',
  group: 'E-commerce',
  description: 'Product categories.',
  count: CATEGORY_NAMES.length,
  entity: Category,
  createDto: CreateCategoryDto,
  replaceDto: CreateCategoryDto,
  patchDto: UpdateCategoryDto,
  sortable: ['name', 'createdAt'],
  searchable: ['name', 'description'],
  generate: ({ faker, id, timestamps }) => {
    const name = CATEGORY_NAMES[id - 1] ?? `Category ${id}`;
    return {
      id,
      name,
      slug: toSlug(name),
      description: faker.commerce.productDescription(),
      imageUrl: picsum(`category-${id}`, 640, 360),
      ...timestamps(),
    };
  },
  derive: (row) => ({ slug: toSlug(row.name) }),
});
