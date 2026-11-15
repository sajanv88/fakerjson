import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Computed, CreatedAt, DateTime, Id, OneOf, Ref, Strings, Text, UpdatedAt, Url } from '../fields.js';
import { picsum } from '../shared.js';

export const ARTICLE_CATEGORIES = ['technology', 'design', 'business', 'science', 'lifestyle', 'travel', 'health'] as const;
export const ARTICLE_STATUSES = ['draft', 'published'] as const;

export class Article {
  @Id() id: number;

  @Ref('user') authorId: number;

  @Text(3, 200, { example: 'Ten patterns for resilient front-ends' })
  title: string;

  @Computed({ type: String, example: 'ten-patterns-for-resilient-front-ends' })
  slug: string;

  @Text(1, 500, { example: 'What we learned shipping offline-first apps to a million users.' })
  excerpt: string;

  @Text(1, 50_000, { example: '## Introduction\n\nLorem ipsum…', description: 'Markdown.' })
  content: string;

  @Url({ example: 'https://picsum.photos/seed/article-1/1600/900' })
  coverImageUrl: string;

  @OneOf(ARTICLE_CATEGORIES, { example: 'technology' })
  category: (typeof ARTICLE_CATEGORIES)[number];

  @Strings(10, { example: ['react', 'performance'] })
  tags: string[];

  @OneOf(ARTICLE_STATUSES, { example: 'published' })
  status: (typeof ARTICLE_STATUSES)[number];

  @Computed({ type: 'integer', example: 6, description: 'At 200 words per minute.' })
  readingTimeMinutes: number;

  @Computed({ type: 'integer', example: 4210 })
  views: number;

  @Computed({ type: 'integer', example: 318 })
  likes: number;

  @DateTime({ example: '2025-04-10T08:00:00.000Z' }, true)
  publishedAt: string | null;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateArticleDto extends OmitType(Article, [
  'id', 'slug', 'readingTimeMinutes', 'views', 'likes', 'createdAt', 'updatedAt',
] as const) {}
export class UpdateArticleDto extends PartialType(CreateArticleDto) {}

const TAGS = ['react', 'vue', 'svelte', 'css', 'typescript', 'node', 'ux', 'ai', 'devops', 'startups', 'remote', 'productivity'];

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const readingTime = (markdown: string) => Math.max(1, Math.round(markdown.split(/\s+/).filter(Boolean).length / 200));

export const articles = defineResource<Article>({
  name: 'articles',
  singular: 'article',
  group: 'Social',
  description: 'Long-form articles with Markdown content, cover image and reading time, five per author.',
  count: 500,
  entity: Article,
  createDto: CreateArticleDto,
  replaceDto: CreateArticleDto,
  patchDto: UpdateArticleDto,
  parent: { resource: 'users', key: 'authorId', perParent: 5 },
  relations: [{ name: 'author', key: 'authorId', resource: 'users' }],
  filters: [
    { field: 'authorId', type: 'number' },
    { field: 'category', type: 'enum', values: ARTICLE_CATEGORIES },
    { field: 'status', type: 'enum', values: ARTICLE_STATUSES },
    { field: 'tags', type: 'string', description: 'Articles carrying this tag.' },
    { field: 'readingTimeMinutes', type: 'number', range: true },
    { field: 'publishedAt', type: 'date', range: true },
  ],
  sortable: ['title', 'views', 'likes', 'readingTimeMinutes', 'publishedAt', 'createdAt'],
  searchable: ['title', 'excerpt', 'tags'],
  generate: ({ faker, id, parentId, timestamps }) => {
    const title = faker.lorem.sentence({ min: 4, max: 9 }).replace(/\.$/, '');
    const sections = Array.from({ length: faker.number.int({ min: 3, max: 6 }) }, () =>
      `## ${faker.lorem.sentence({ min: 2, max: 5 }).replace(/\.$/, '')}\n\n${faker.lorem.paragraphs({ min: 2, max: 4 }, '\n\n')}`,
    );
    const content = sections.join('\n\n');
    const ts = timestamps();
    const status = faker.helpers.weightedArrayElement([
      { weight: 5, value: 'published' as const },
      { weight: 1, value: 'draft' as const },
    ]);
    return {
      id,
      authorId: parentId,
      title,
      slug: slug(title),
      excerpt: faker.lorem.sentences(2),
      content,
      coverImageUrl: picsum(`article-${id}`, 1600, 900),
      category: faker.helpers.arrayElement(ARTICLE_CATEGORIES),
      tags: faker.helpers.arrayElements(TAGS, { min: 1, max: 4 }),
      status,
      readingTimeMinutes: readingTime(content),
      views: status === 'draft' ? 0 : faker.number.int({ min: 50, max: 50_000 }),
      likes: status === 'draft' ? 0 : faker.number.int({ min: 0, max: 3_000 }),
      publishedAt: status === 'draft' ? null : ts.createdAt,
      ...ts,
    };
  },
  derive: (row) => ({
    slug: slug(row.title),
    readingTimeMinutes: readingTime(row.content ?? ''),
    views: row.views ?? 0,
    likes: row.likes ?? 0,
  }),
});
