import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { CreatedAt, DateOnly, Email, Id, Nested, OneOf, Text, UpdatedAt, Url } from '../fields.js';
import { Address, fakeAddress } from '../shared.js';

export const USER_ROLES = ['admin', 'editor', 'author', 'viewer'] as const;

export class UserCompany {
  @Text(1, 120, { example: 'Romaguera-Crona' })
  name: string;

  @Text(1, 200, { example: 'Multi-layered client-server neural-net' })
  catchPhrase: string;

  @Text(1, 80, { example: 'Engineering' })
  department: string;

  @Text(1, 120, { example: 'Senior Frontend Developer' })
  jobTitle: string;
}

export class User {
  @Id() id: number;

  @Text(1, 60, { example: 'Leanne' })
  firstName: string;

  @Text(1, 60, { example: 'Graham' })
  lastName: string;

  @Text(3, 40, { example: 'leanne.graham' })
  username: string;

  @Email({ example: 'leanne.graham@example.com' })
  email: string;

  @Text(3, 40, { example: '+1-770-736-8031' })
  phone: string;

  @Url({ example: 'https://avatars.githubusercontent.com/u/1' })
  avatar: string;

  @DateOnly({ example: '1990-04-12' })
  birthDate: string;

  @OneOf(USER_ROLES, { example: 'author' })
  role: (typeof USER_ROLES)[number];

  @Url({ example: 'https://hildegard.org' })
  website: string;

  @Nested(() => Address)
  address: Address;

  @Nested(() => UserCompany)
  company: UserCompany;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateUserDto extends OmitType(User, ['id', 'createdAt', 'updatedAt'] as const) {}
export class UpdateUserDto extends PartialType(CreateUserDto) {}

export const users = defineResource<User>({
  name: 'users',
  singular: 'user',
  group: 'Classic',
  description: 'People with profile, address and employer. Owners of posts, albums, todos, orders and more.',
  count: 100,
  entity: User,
  createDto: CreateUserDto,
  replaceDto: CreateUserDto,
  patchDto: UpdateUserDto,
  filters: [
    { field: 'role', type: 'enum', values: USER_ROLES },
    { field: 'username', type: 'string' },
    { field: 'email', type: 'string' },
    { field: 'address.city', type: 'string', description: 'Filter by city.' },
    { field: 'address.countryCode', type: 'string', description: 'Filter by ISO 3166-1 alpha-2 country code.' },
    { field: 'birthDate', type: 'date', range: true },
  ],
  sortable: ['firstName', 'lastName', 'username', 'email', 'birthDate', 'createdAt', 'updatedAt'],
  searchable: ['firstName', 'lastName', 'username', 'email', 'company.name'],
  generate: ({ faker, id, timestamps }) => {
    const sex = faker.person.sexType();
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName(sex);
    return {
      id,
      firstName,
      lastName,
      username: faker.internet.username({ firstName, lastName }).toLowerCase(),
      email: faker.internet.email({ firstName, lastName, provider: 'example.com' }).toLowerCase(),
      phone: faker.phone.number({ style: 'international' }),
      avatar: faker.image.avatar(),
      birthDate: faker.date.birthdate({ mode: 'age', min: 18, max: 75 }).toISOString().slice(0, 10),
      role: faker.helpers.weightedArrayElement([
        { weight: 1, value: 'admin' as const },
        { weight: 3, value: 'editor' as const },
        { weight: 6, value: 'author' as const },
        { weight: 10, value: 'viewer' as const },
      ]),
      website: `https://${faker.internet.domainName()}`,
      address: fakeAddress(faker),
      company: {
        name: faker.company.name(),
        catchPhrase: faker.company.catchPhrase(),
        department: faker.commerce.department(),
        jobTitle: faker.person.jobTitle(),
      },
      ...timestamps(),
    };
  },
});
