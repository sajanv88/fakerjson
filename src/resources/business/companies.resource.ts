import { OmitType, PartialType } from '@nestjs/swagger';
import { defineResource } from '../../data/resource.types.js';
import { CreatedAt, Email, Id, Int, Nested, OneOf, Text, UpdatedAt, Url } from '../fields.js';
import { Address, fakeAddress, picsum } from '../shared.js';

export const INDUSTRIES = [
  'Software', 'Fintech', 'E-commerce', 'Healthcare', 'Education', 'Manufacturing',
  'Logistics', 'Media', 'Energy', 'Real Estate', 'Hospitality', 'Consulting',
] as const;

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;

export class Company {
  @Id() id: number;

  @Text(1, 120, { example: 'Romaguera-Crona' })
  name: string;

  @OneOf(INDUSTRIES, { example: 'Software' })
  industry: (typeof INDUSTRIES)[number];

  @Text(1, 200, { example: 'Multi-layered client-server neural-net' })
  catchPhrase: string;

  @Text(0, 2_000, { example: 'We help teams ship faster.' })
  description: string;

  @Url({ example: 'https://romaguera-crona.example.com' })
  website: string;

  @Email({ example: 'hello@romaguera-crona.example.com' })
  email: string;

  @Text(3, 40, { example: '+1-202-555-0143' })
  phone: string;

  @Url({ example: 'https://picsum.photos/seed/company-1/256/256' })
  logoUrl: string;

  @Int(1800, 2100, { example: 2012 })
  foundedYear: number;

  @OneOf(COMPANY_SIZES, { example: '51-200' })
  size: (typeof COMPANY_SIZES)[number];

  @Nested(() => Address)
  address: Address;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateCompanyDto extends OmitType(Company, ['id', 'createdAt', 'updatedAt'] as const) {}
export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {}

export const companies = defineResource<Company>({
  name: 'companies',
  singular: 'company',
  group: 'Business',
  description: 'Companies with industry, size and address. Parents of employees, invoices and transactions.',
  count: 50,
  entity: Company,
  createDto: CreateCompanyDto,
  replaceDto: CreateCompanyDto,
  patchDto: UpdateCompanyDto,
  filters: [
    { field: 'industry', type: 'enum', values: INDUSTRIES },
    { field: 'size', type: 'enum', values: COMPANY_SIZES },
    { field: 'foundedYear', type: 'number', range: true },
    { field: 'address.countryCode', type: 'string', description: 'Filter by ISO 3166-1 alpha-2 country code.' },
  ],
  sortable: ['name', 'industry', 'foundedYear', 'createdAt'],
  searchable: ['name', 'catchPhrase', 'description', 'industry'],
  generate: ({ faker, id, timestamps }) => {
    const name = faker.company.name();
    const domain = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `company-${id}`}.example.com`;
    return {
      id,
      name,
      industry: faker.helpers.arrayElement(INDUSTRIES),
      catchPhrase: faker.company.catchPhrase(),
      description: faker.lorem.paragraph(),
      website: `https://${domain}`,
      email: `hello@${domain}`,
      phone: faker.phone.number({ style: 'international' }),
      logoUrl: picsum(`company-${id}`, 256, 256),
      foundedYear: faker.number.int({ min: 1950, max: 2024 }),
      size: faker.helpers.arrayElement(COMPANY_SIZES),
      address: fakeAddress(faker),
      ...timestamps(),
    };
  },
});
