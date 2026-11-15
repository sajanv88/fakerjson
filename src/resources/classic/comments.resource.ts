import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Computed, CreatedAt, Email, Id, Ref, Text, UpdatedAt } from '../fields.js';

export class Comment {
  @Id() id: number;

  @Ref('post') postId: number;

  @Text(1, 120, { example: 'id labore ex et quam laborum' })
  name: string;

  @Email({ example: 'eliseo@gardner.biz' })
  email: string;

  @Text(1, 5_000, { example: 'laudantium enim quasi est quidem magnam voluptate ipsam eos' })
  body: string;

  @Computed({ type: 'integer', minimum: 0, example: 4 })
  likes: number;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateCommentDto extends OmitType(Comment, ['id', 'likes', 'createdAt', 'updatedAt'] as const) {}
export class UpdateCommentDto extends PartialType(CreateCommentDto) {}

export const comments = defineResource<Comment>({
  name: 'comments',
  singular: 'comment',
  group: 'Classic',
  description: 'Comments on posts, five per post.',
  count: 5_000,
  entity: Comment,
  createDto: CreateCommentDto,
  replaceDto: CreateCommentDto,
  patchDto: UpdateCommentDto,
  parent: { resource: 'posts', key: 'postId', perParent: 5 },
  relations: [{ name: 'post', key: 'postId', resource: 'posts' }],
  filters: [
    { field: 'postId', type: 'number' },
    { field: 'email', type: 'string' },
    { field: 'likes', type: 'number', range: true },
  ],
  sortable: ['likes', 'createdAt', 'updatedAt'],
  searchable: ['name', 'email', 'body'],
  generate: ({ faker, id, parentId, timestamps }) => ({
    id,
    postId: parentId,
    name: faker.lorem.sentence({ min: 3, max: 6 }).replace(/\.$/, ''),
    email: faker.internet.email({ provider: 'example.com' }).toLowerCase(),
    body: faker.lorem.sentences({ min: 1, max: 4 }),
    likes: faker.number.int({ min: 0, max: 120 }),
    ...timestamps(),
  }),
  derive: (row) => ({ likes: row.likes ?? 0 }),
});
