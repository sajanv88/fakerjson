import { OmitType, PartialType } from '@nestjs/swagger';
import { REFERENCE_DATE } from '../../data/locales.js';
import { defineResource } from '../../data/resource.types.js';
import { Bool, CreatedAt, DateOnly, Id, OneOf, Ref, Text, UpdatedAt } from '../fields.js';

export const TODO_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export class Todo {
  @Id() id: number;

  @Ref('user') userId: number;

  @Text(1, 200, { example: 'delectus aut autem' })
  title: string;

  @Bool({ example: false })
  completed: boolean;

  @OneOf(TODO_PRIORITIES, { example: 'medium' })
  priority: (typeof TODO_PRIORITIES)[number];

  @DateOnly({ example: '2026-02-15' }, true)
  dueDate: string | null;

  @CreatedAt() createdAt: string;
  @UpdatedAt() updatedAt: string;
}

export class CreateTodoDto extends OmitType(Todo, ['id', 'createdAt', 'updatedAt'] as const) {}
export class UpdateTodoDto extends PartialType(CreateTodoDto) {}

export const todos = defineResource<Todo>({
  name: 'todos',
  singular: 'todo',
  group: 'Classic',
  description: 'Tasks with priority and due date, twenty per user.',
  count: 2_000,
  entity: Todo,
  createDto: CreateTodoDto,
  replaceDto: CreateTodoDto,
  patchDto: UpdateTodoDto,
  parent: { resource: 'users', key: 'userId', perParent: 20 },
  relations: [{ name: 'user', key: 'userId', resource: 'users' }],
  filters: [
    { field: 'userId', type: 'number' },
    { field: 'completed', type: 'boolean' },
    { field: 'priority', type: 'enum', values: TODO_PRIORITIES },
    { field: 'dueDate', type: 'date', range: true },
  ],
  sortable: ['title', 'completed', 'dueDate', 'createdAt', 'updatedAt'],
  searchable: ['title'],
  generate: ({ faker, id, parentId, timestamps }) => ({
    id,
    userId: parentId,
    title: faker.lorem.sentence({ min: 2, max: 7 }).replace(/\.$/, ''),
    completed: faker.datatype.boolean({ probability: 0.45 }),
    priority: faker.helpers.weightedArrayElement([
      { weight: 4, value: 'low' as const },
      { weight: 4, value: 'medium' as const },
      { weight: 2, value: 'high' as const },
      { weight: 1, value: 'urgent' as const },
    ]),
    dueDate: faker.datatype.boolean({ probability: 0.75 })
      ? faker.date.soon({ days: 90, refDate: REFERENCE_DATE }).toISOString().slice(0, 10)
      : null,
    ...timestamps(),
  }),
});
