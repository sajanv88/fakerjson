import { OmitType, PartialType } from '@nestjs/swagger';
import { REFERENCE_DATE } from '../../data/locales.js';
import { defineResource } from '../../data/resource.types.js';
import { CreatedAt, DateOnly, Email, Id, Int, OneOf, Ref, Text, UpdatedAt, Url } from '../fields.js';

export const DEPARTMENTS = [
  'Engineering', 'Product', 'Design', 'Sales', 'Marketing', 'Finance', 'People', 'Operations', 'Support', 'Legal',
] as const;
export const EMPLOYMENT_STATUSES = ['active', 'on_leave', 'terminated'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor', 'intern'] as const;

const PER_COMPANY = 20;
const LEADS = 4;

/**
 * Reporting line inside each company: the first employee is the CEO, the next four
 * report to the CEO, and everyone else reports to one of those four leads.
 */
export function managerOf(id: number): number | null {
  const index = (id - 1) % PER_COMPANY;
  const ceo = id - index;
  if (index === 0) return null;
  if (index <= LEADS) return ceo;
  return ceo + 1 + (index % LEADS);
}

export class Employee {
  @Id() id: number;

  @Ref('company') companyId: number;

  @Ref('employee', true) managerId: number | null;

  @Text(1, 60, { example: 'Clementine' })
  firstName: string;

  @Text(1, 60, { example: 'Bauch' })
  lastName: string;

  @Email({ example: 'clementine.bauch@romaguera-crona.example.com' })
  email: string;

  @Text(3, 40, { example: '+1-463-123-4447' })
  phone: string;

  @Text(1, 120, { example: 'Senior Frontend Engineer' })
  jobTitle: string;

  @OneOf(DEPARTMENTS, { example: 'Engineering' })
  department: (typeof DEPARTMENTS)[number];

  @OneOf(EMPLOYMENT_TYPES, { example: 'full_time' })
  employmentType: (typeof EMPLOYMENT_TYPES)[number];

  @Int(0, 10_000_000, { example: 98_000, description: 'Yearly gross salary in USD.' })
  salary: number;

  @DateOnly({ example: '2021-09-01' })
  hireDate: string;

  @OneOf(EMPLOYMENT_STATUSES, { example: 'active' })
  status: (typeof EMPLOYMENT_STATUSES)[number];

  @Url({ example: 'https://avatars.githubusercontent.com/u/2' })
  avatar: string;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateEmployeeDto extends OmitType(Employee, ['id', 'createdAt', 'updatedAt'] as const) {}
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export const employees = defineResource<Employee>({
  name: 'employees',
  singular: 'employee',
  group: 'Business',
  description: 'Employees with department, salary and a real reporting line (managerId), twenty per company.',
  count: 1_000,
  entity: Employee,
  createDto: CreateEmployeeDto,
  replaceDto: CreateEmployeeDto,
  patchDto: UpdateEmployeeDto,
  parent: { resource: 'companies', key: 'companyId', perParent: PER_COMPANY },
  relations: [
    { name: 'company', key: 'companyId', resource: 'companies' },
    { name: 'manager', key: 'managerId', resource: 'employees', nullable: true },
  ],
  filters: [
    { field: 'companyId', type: 'number' },
    { field: 'managerId', type: 'number' },
    { field: 'department', type: 'enum', values: DEPARTMENTS },
    { field: 'employmentType', type: 'enum', values: EMPLOYMENT_TYPES },
    { field: 'status', type: 'enum', values: EMPLOYMENT_STATUSES },
    { field: 'salary', type: 'number', range: true },
    { field: 'hireDate', type: 'date', range: true },
  ],
  sortable: ['firstName', 'lastName', 'jobTitle', 'department', 'salary', 'hireDate', 'createdAt'],
  searchable: ['firstName', 'lastName', 'email', 'jobTitle'],
  generate: ({ faker, id, parentId, get, timestamps }) => {
    const company = get<{ website: string }>('companies', parentId);
    const domain = new URL(company.website).hostname;
    const sex = faker.person.sexType();
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName(sex);
    const managerId = managerOf(id);
    const isCeo = managerId === null;
    const isLead = !isCeo && managerId === id - ((id - 1) % PER_COMPANY);
    const department = isCeo ? 'Operations' : faker.helpers.arrayElement(DEPARTMENTS);
    return {
      id,
      companyId: parentId,
      managerId,
      firstName,
      lastName,
      email: faker.internet.email({ firstName, lastName, provider: domain }).toLowerCase(),
      phone: faker.phone.number({ style: 'international' }),
      jobTitle: isCeo ? 'Chief Executive Officer' : isLead ? `Head of ${department}` : faker.person.jobTitle(),
      department,
      employmentType: isCeo || isLead ? 'full_time' : faker.helpers.weightedArrayElement([
        { weight: 14, value: 'full_time' as const },
        { weight: 2, value: 'part_time' as const },
        { weight: 3, value: 'contractor' as const },
        { weight: 1, value: 'intern' as const },
      ]),
      salary: Math.round(faker.number.int({ min: isCeo ? 180_000 : isLead ? 120_000 : 45_000, max: isCeo ? 400_000 : isLead ? 220_000 : 160_000 }) / 500) * 500,
      hireDate: faker.date.past({ years: 12, refDate: REFERENCE_DATE }).toISOString().slice(0, 10),
      status: isCeo ? 'active' : faker.helpers.weightedArrayElement([
        { weight: 17, value: 'active' as const },
        { weight: 2, value: 'on_leave' as const },
        { weight: 1, value: 'terminated' as const },
      ]),
      avatar: faker.image.avatar(),
      ...timestamps(),
    };
  },
});
