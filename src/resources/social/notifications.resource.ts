import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { Bool, CreatedAt, Id, OneOf, Ref, Text, UpdatedAt } from '../fields.js';

export const NOTIFICATION_TYPES = ['like', 'comment', 'follow', 'mention', 'order', 'system'] as const;

export class Notification {
  @Id() id: number;

  @Ref('user') userId: number;

  @Ref('user', true) actorId: number | null;

  @OneOf(NOTIFICATION_TYPES, { example: 'comment' })
  type: (typeof NOTIFICATION_TYPES)[number];

  @Text(1, 120, { example: 'New comment' })
  title: string;

  @Text(1, 500, { example: 'Ervin Howell commented on your post.' })
  message: string;

  @Text(1, 300, { example: '/v1/posts/12', description: 'Where the notification leads (API path).' }, true)
  link: string | null;

  @Bool({ example: false })
  read: boolean;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateNotificationDto extends OmitType(Notification, ['id', 'createdAt', 'updatedAt'] as const) {}
export class UpdateNotificationDto extends PartialType(CreateNotificationDto) {}

export const notifications = defineResource<Notification>({
  name: 'notifications',
  singular: 'notification',
  group: 'Social',
  description: 'In-app notifications (likes, comments, follows, orders), twenty per user.',
  count: 2_000,
  entity: Notification,
  createDto: CreateNotificationDto,
  replaceDto: CreateNotificationDto,
  patchDto: UpdateNotificationDto,
  parent: { resource: 'users', key: 'userId', perParent: 20 },
  relations: [
    { name: 'user', key: 'userId', resource: 'users' },
    { name: 'actor', key: 'actorId', resource: 'users', nullable: true },
  ],
  filters: [
    { field: 'userId', type: 'number' },
    { field: 'actorId', type: 'number' },
    { field: 'type', type: 'enum', values: NOTIFICATION_TYPES },
    { field: 'read', type: 'boolean' },
    { field: 'createdAt', type: 'date', range: true },
  ],
  sortable: ['type', 'read', 'createdAt'],
  searchable: ['title', 'message'],
  generate: ({ faker, id, parentId, pickId, get, count, timestamps }) => {
    const type = faker.helpers.weightedArrayElement([
      { weight: 5, value: 'like' as const },
      { weight: 4, value: 'comment' as const },
      { weight: 3, value: 'follow' as const },
      { weight: 2, value: 'mention' as const },
      { weight: 2, value: 'order' as const },
      { weight: 1, value: 'system' as const },
    ]);
    const hasActor = type !== 'system' && type !== 'order';
    let actorId = hasActor ? pickId('users') : null;
    if (actorId === parentId) actorId = (actorId % count('users')) + 1;
    const actor = actorId ? get<{ firstName: string; lastName: string }>('users', actorId) : null;
    const name = actor ? `${actor.firstName} ${actor.lastName}` : '';
    const postId = faker.number.int({ min: 1, max: count('posts') });
    const orderId = (parentId - 1) * 10 + faker.number.int({ min: 1, max: 10 });

    const content = {
      like: { title: 'New like', message: `${name} liked your post.`, link: `/v1/posts/${postId}` },
      comment: { title: 'New comment', message: `${name} commented on your post.`, link: `/v1/posts/${postId}/comments` },
      follow: { title: 'New follower', message: `${name} started following you.`, link: `/v1/users/${actorId}` },
      mention: { title: 'You were mentioned', message: `${name} mentioned you in a comment.`, link: `/v1/posts/${postId}` },
      order: { title: 'Order update', message: `Your order #${orderId} has shipped.`, link: `/v1/orders/${orderId}` },
      system: { title: 'Security notice', message: faker.helpers.arrayElement(['Your password was changed.', 'New sign-in from a new device.', 'Scheduled maintenance tonight at 02:00 UTC.']), link: null },
    }[type];

    return {
      id,
      userId: parentId,
      actorId,
      type,
      ...content,
      read: faker.datatype.boolean({ probability: 0.6 }),
      ...timestamps(),
    };
  },
});
