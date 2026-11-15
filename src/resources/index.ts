import type { AnyResource } from '../data/resource.types.js';
import { companies } from './business/companies.resource.js';
import { employees } from './business/employees.resource.js';
import { invoices } from './business/invoices.resource.js';
import { transactions } from './business/transactions.resource.js';
import { albums } from './classic/albums.resource.js';
import { comments } from './classic/comments.resource.js';
import { photos } from './classic/photos.resource.js';
import { posts } from './classic/posts.resource.js';
import { todos } from './classic/todos.resource.js';
import { users } from './classic/users.resource.js';
import { carts } from './ecommerce/carts.resource.js';
import { categories } from './ecommerce/categories.resource.js';
import { orders } from './ecommerce/orders.resource.js';
import { products } from './ecommerce/products.resource.js';
import { reviews } from './ecommerce/reviews.resource.js';
import { articles } from './social/articles.resource.js';
import { messages } from './social/messages.resource.js';
import { notifications } from './social/notifications.resource.js';

/** Every resource, in the order they appear in the docs (grouped by Swagger tag family). */
export const RESOURCES: readonly AnyResource[] = [
  // Classic: the JSONPlaceholder set, with richer fields
  users, posts, comments, albums, photos, todos,
  // E-commerce
  categories, products, reviews, carts, orders,
  // Business
  companies, employees, invoices, transactions,
  // Social
  articles, notifications, messages,
];
