import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Computed, CreatedAt, DateTime, Id, Ref, Text, UpdatedAt } from '../fields.js';

export class Message {
  @Id() id: number;

  @Ref('user') senderId: number;

  @Ref('user') recipientId: number;

  @Computed({ type: String, example: '3-17', description: 'Same for both directions: `<lowerUserId>-<higherUserId>`.' })
  conversationId: string;

  @Text(1, 5_000, { example: 'Are we still on for Friday?' })
  body: string;

  @DateTime({ example: '2025-09-01T18:22:00.000Z' }, true)
  readAt: string | null;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateMessageDto extends OmitType(Message, ['id', 'conversationId', 'createdAt', 'updatedAt'] as const) {}
export class UpdateMessageDto extends PartialType(CreateMessageDto) {}

const conversationId = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/**
 * Each user talks to four stable contacts. The offsets are symmetric (A+7 writes back to A
 * with -7), so every conversation has messages in both directions.
 */
const CONTACT_OFFSETS = [7, -7, 14, -14] as const;

export const messages = defineResource<Message>({
  name: 'messages',
  singular: 'message',
  group: 'Social',
  description: 'Direct messages between users, grouped by conversationId, fifty sent per user.',
  count: 5_000,
  entity: Message,
  createDto: CreateMessageDto,
  replaceDto: CreateMessageDto,
  patchDto: UpdateMessageDto,
  parent: { resource: 'users', key: 'senderId', perParent: 50 },
  relations: [
    { name: 'sender', key: 'senderId', resource: 'users' },
    { name: 'recipient', key: 'recipientId', resource: 'users' },
  ],
  filters: [
    { field: 'senderId', type: 'number' },
    { field: 'recipientId', type: 'number' },
    { field: 'conversationId', type: 'string' },
    { field: 'createdAt', type: 'date', range: true },
  ],
  sortable: ['createdAt'],
  searchable: ['body'],
  generate: ({ faker, id, parentId, count, timestamps }) => {
    const users = count('users');
    const offset = faker.helpers.arrayElement(CONTACT_OFFSETS);
    const recipientId = ((((parentId - 1 + offset) % users) + users) % users) + 1;
    const ts = timestamps();
    return {
      id,
      senderId: parentId,
      recipientId,
      conversationId: conversationId(parentId, recipientId),
      body: faker.helpers.arrayElement([faker.lorem.sentence(), faker.lorem.sentences({ min: 1, max: 3 }), faker.hacker.phrase()]),
      readAt: faker.datatype.boolean({ probability: 0.7 }) ? ts.updatedAt : null,
      ...ts,
    };
  },
  derive: (row) => ({ conversationId: conversationId(row.senderId, row.recipientId) }),
});
