import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { CreatedAt, Id, OneOf, Ref, Text, UpdatedAt, Url } from '../fields.js';
import { picsum } from '../shared.js';

export const ALBUM_VISIBILITY = ['public', 'unlisted', 'private'] as const;

export class Album {
  @Id() id: number;

  @Ref('user') userId: number;

  @Text(1, 120, { example: 'quidem molestiae enim' })
  title: string;

  @Text(0, 1_000, { example: 'Summer trip to the coast.' }, true)
  description: string | null;

  @Url({ example: 'https://picsum.photos/seed/album-1/600/400' })
  coverUrl: string;

  @OneOf(ALBUM_VISIBILITY, { example: 'public' })
  visibility: (typeof ALBUM_VISIBILITY)[number];

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateAlbumDto extends OmitType(Album, ['id', 'createdAt', 'updatedAt'] as const) {}
export class UpdateAlbumDto extends PartialType(CreateAlbumDto) {}

export const albums = defineResource<Album>({
  name: 'albums',
  singular: 'album',
  group: 'Classic',
  description: 'Photo albums, five per user.',
  count: 500,
  entity: Album,
  createDto: CreateAlbumDto,
  replaceDto: CreateAlbumDto,
  patchDto: UpdateAlbumDto,
  parent: { resource: 'users', key: 'userId', perParent: 5 },
  relations: [{ name: 'user', key: 'userId', resource: 'users' }],
  filters: [
    { field: 'userId', type: 'number' },
    { field: 'visibility', type: 'enum', values: ALBUM_VISIBILITY },
  ],
  sortable: ['title', 'createdAt', 'updatedAt'],
  searchable: ['title', 'description'],
  generate: ({ faker, id, parentId, scope, timestamps }) => ({
    id,
    userId: parentId,
    title: faker.lorem.words({ min: 2, max: 5 }),
    description: faker.datatype.boolean({ probability: 0.7 }) ? faker.lorem.sentence() : null,
    coverUrl: picsum(`album-${scope.seed}-${id}`, 600, 400),
    visibility: faker.helpers.arrayElement(ALBUM_VISIBILITY),
    ...timestamps(),
  }),
});
