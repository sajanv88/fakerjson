import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Computed, CreatedAt, DateTime, Id, OneOf, Ref, Strings, Text, UpdatedAt } from '../fields.js';
import { slugify } from '../shared.js';

export const POST_STATUSES = ['draft', 'published', 'archived'] as const;

export class Post {
  @Id() id: number;

  @Ref('user') userId: number;

  @Text(3, 200, { example: 'sunt aut facere repellat provident occaecati' })
  title: string;

  @Computed({ type: String, example: 'sunt-aut-facere-repellat-provident-occaecati', description: 'Derived from the title.' })
  slug: string;

  @Text(1, 10_000, { example: 'quia et suscipit\nsuscipit recusandae consequuntur expedita' })
  body: string;

  @Strings(10, { example: ['history', 'crime'] })
  tags: string[];

  @OneOf(POST_STATUSES, { example: 'published' })
  status: (typeof POST_STATUSES)[number];

  @DateTime({ example: '2025-03-02T10:00:00.000Z' }, true)
  publishedAt: string | null;

  @Computed({ type: 'integer', minimum: 0, example: 1532 })
  views: number;

  @Computed({ type: 'integer', minimum: 0, example: 87 })
  likes: number;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreatePostDto extends OmitType(Post, ['id', 'slug', 'views', 'likes', 'createdAt', 'updatedAt'] as const) {}
export class UpdatePostDto extends PartialType(CreatePostDto) {}

export const posts = defineResource<Post>({
  name: 'posts',
  singular: 'post',
  group: 'Classic',
  description: 'Blog posts, ten per user.',
  count: 1_000,
  entity: Post,
  createDto: CreatePostDto,
  replaceDto: CreatePostDto,
  patchDto: UpdatePostDto,
  parent: { resource: 'users', key: 'userId', perParent: 10 },
  relations: [{ name: 'user', key: 'userId', resource: 'users' }],
  filters: [
    { field: 'userId', type: 'number' },
    { field: 'status', type: 'enum', values: POST_STATUSES },
    { field: 'tags', type: 'string', description: 'Posts carrying this tag.' },
    { field: 'views', type: 'number', range: true },
    { field: 'publishedAt', type: 'date', range: true },
  ],
  sortable: ['title', 'views', 'likes', 'publishedAt', 'createdAt', 'updatedAt'],
  searchable: ['title', 'body', 'tags'],
  generate: ({ faker, id, parentId, timestamps }) => {
    const title = faker.lorem.sentence({ min: 3, max: 8 }).replace(/\.$/, '');
    const ts = timestamps();
    const status = faker.helpers.weightedArrayElement([
      { weight: 7, value: 'published' as const },
      { weight: 2, value: 'draft' as const },
      { weight: 1, value: 'archived' as const },
    ]);
    return {
      id,
      userId: parentId,
      title,
      slug: slugify(faker, title),
      body: faker.lorem.paragraphs({ min: 2, max: 5 }, '\n\n'),
      tags: faker.helpers.uniqueArray(() => faker.word.noun().toLowerCase(), faker.number.int({ min: 1, max: 4 })),
      status,
      publishedAt: status === 'draft' ? null : ts.createdAt,
      views: status === 'draft' ? 0 : faker.number.int({ min: 10, max: 25_000 }),
      likes: status === 'draft' ? 0 : faker.number.int({ min: 0, max: 1_500 }),
      ...ts,
    };
  },
  derive: (row) => ({
    slug: row.title ? row.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : row.slug,
    views: row.views ?? 0,
    likes: row.likes ?? 0,
  }),
});
