import { useEffect, useState } from 'react';
import { createSlimHighlighter } from './highlighter';

/** Shown in snippets: the public address, whatever host the page is served from. */
export const PUBLIC_ORIGIN = 'https://fakerjson.com';

/** One highlighter for the whole page. Shiki loads on first use, one grammar per language. */
export const highlighter = createSlimHighlighter();

export type Family = 'Classic' | 'E-commerce' | 'Business' | 'Social';
export const FAMILIES: Family[] = ['Classic', 'E-commerce', 'Business', 'Social'];

export interface ResourceSummary {
  name: string;
  group: Family;
  description: string;
  count: number;
  href: string;
  nestedUnder: string | null;
}

export interface ApiIndex {
  version: string;
  defaultSeed: number;
  locales: string[];
  resources: ResourceSummary[];
}

const r = (name: string, group: Family, count: number, description: string, parent?: string): ResourceSummary => ({
  name,
  group,
  count,
  description,
  href: `/v1/${name}`,
  nestedUnder: parent ? `/v1/${parent}/{id}/${name}` : null,
});

/** What the page shows until `/v1` answers (and if it never does). */
export const FALLBACK_INDEX: ApiIndex = {
  version: '1.0.0',
  defaultSeed: 42,
  locales: ['en', 'en_GB', 'en_IN', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'sv', 'tr', 'pt_BR', 'ar', 'ja', 'ko', 'zh_CN'],
  resources: [
    r('users', 'Classic', 100, 'People with profile, address and employer.'),
    r('posts', 'Classic', 1000, 'Blog posts, ten per user.', 'users'),
    r('comments', 'Classic', 5000, 'Comments on posts, five per post.', 'posts'),
    r('albums', 'Classic', 500, 'Photo albums, five per user.', 'users'),
    r('photos', 'Classic', 5000, 'Photos with real, stable image URLs.', 'albums'),
    r('todos', 'Classic', 2000, 'Tasks with priority and due date.', 'users'),
    r('categories', 'E-commerce', 20, 'Product categories.'),
    r('products', 'E-commerce', 500, 'Catalogue items with price, stock and rating.', 'categories'),
    r('reviews', 'E-commerce', 2500, 'Product reviews written by users.', 'products'),
    r('carts', 'E-commerce', 100, 'Shopping carts, priced from real products.', 'users'),
    r('orders', 'E-commerce', 1000, 'Orders with lines, tax and shipping.', 'users'),
    r('companies', 'Business', 50, 'Companies with industry, size and address.'),
    r('employees', 'Business', 1000, 'Employees with a real reporting line.', 'companies'),
    r('invoices', 'Business', 1000, 'Invoices with lines, tax and status.', 'companies'),
    r('transactions', 'Business', 5000, 'Bank transactions, some tied to invoices.', 'companies'),
    r('articles', 'Social', 500, 'Long-form articles in Markdown.', 'users'),
    r('notifications', 'Social', 2000, 'Likes, comments, follows and order updates.', 'users'),
    r('messages', 'Social', 5000, 'Direct messages grouped by conversation.', 'users'),
  ],
};

/** The live index from `/v1`, with the built-in copy until it arrives. */
export function useApiIndex(): { index: ApiIndex; live: boolean } {
  const [state, setState] = useState({ index: FALLBACK_INDEX, live: false });
  useEffect(() => {
    const controller = new AbortController();
    fetch('/v1', { signal: controller.signal, headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? (res.json() as Promise<ApiIndex>) : Promise.reject(new Error(String(res.status)))))
      .then((index) => setState({ index, live: true }))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return state;
}

export const formatCount = (n: number) => new Intl.NumberFormat('en-US').format(n);
