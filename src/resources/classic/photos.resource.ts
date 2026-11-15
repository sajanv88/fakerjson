import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { CreatedAt, Id, Int, Ref, Text, UpdatedAt, Url } from '../fields.js';
import { picsum } from '../shared.js';

export class Photo {
  @Id() id: number;

  @Ref('album') albumId: number;

  @Text(1, 200, { example: 'accusamus beatae ad facilis cum similique qui sunt' })
  title: string;

  @Url({ example: 'https://picsum.photos/seed/photo-1/1200/800' })
  url: string;

  @Url({ example: 'https://picsum.photos/seed/photo-1/150/100' })
  thumbnailUrl: string;

  @Int(1, 10_000, { example: 1200 })
  width: number;

  @Int(1, 10_000, { example: 800 })
  height: number;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreatePhotoDto extends OmitType(Photo, ['id', 'createdAt', 'updatedAt'] as const) {}
export class UpdatePhotoDto extends PartialType(CreatePhotoDto) {}

const SIZES = [
  [1200, 800],
  [800, 1200],
  [1024, 1024],
  [1600, 900],
] as const;

export const photos = defineResource<Photo>({
  name: 'photos',
  singular: 'photo',
  group: 'Classic',
  description: 'Photos with real, stable image URLs (Picsum), ten per album.',
  count: 5_000,
  entity: Photo,
  createDto: CreatePhotoDto,
  replaceDto: CreatePhotoDto,
  patchDto: UpdatePhotoDto,
  parent: { resource: 'albums', key: 'albumId', perParent: 10 },
  relations: [{ name: 'album', key: 'albumId', resource: 'albums' }],
  filters: [
    { field: 'albumId', type: 'number' },
    { field: 'width', type: 'number', range: true },
    { field: 'height', type: 'number', range: true },
  ],
  sortable: ['title', 'width', 'height', 'createdAt'],
  searchable: ['title'],
  generate: ({ faker, id, parentId, scope, timestamps }) => {
    const [width, height] = faker.helpers.arrayElement(SIZES);
    const seed = `photo-${scope.seed}-${id}`;
    return {
      id,
      albumId: parentId,
      title: faker.lorem.sentence({ min: 3, max: 8 }).replace(/\.$/, ''),
      url: picsum(seed, width, height),
      thumbnailUrl: picsum(seed, Math.round(width / 8), Math.round(height / 8)),
      width,
      height,
      ...timestamps(),
    };
  },
});
