import { Card, CardDescription, CardHeader, CardTitle } from '@nuvui/react';
import {
  AlertTriangleIcon,
  DatabaseIcon,
  EditIcon,
  FileCodeIcon,
  FilterIcon,
  LanguagesIcon,
  NetworkIcon,
  TimerIcon,
  ZapIcon,
} from '@nuvui/icons';
import type { ComponentType } from 'react';
import './Features.scss';

const features: { Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; title: string; text: string; code: string }[] = [
  {
    Icon: DatabaseIcon,
    title: 'Same data, every call',
    text: 'Every row is generated from a seed, so user 7 is the same person on every request, every server, every day. Snapshot tests stay green.',
    code: '?seed=7',
  },
  {
    Icon: NetworkIcon,
    title: 'Relations that hold up',
    text: 'A post’s userId is a real user, an order is priced from real products, a product’s rating is the average of its reviews.',
    code: '?expand=user',
  },
  {
    Icon: FilterIcon,
    title: 'Lists like production',
    text: 'Pagination with meta, links, X-Total-Count and Link headers. Filters, ranges, search, sorting and sparse fields.',
    code: '?price_gte=10&sort=-rating',
  },
  {
    Icon: EditIcon,
    title: 'Writes that validate',
    text: 'POST, PUT, PATCH and DELETE check the body and answer 201, 200, 204, 404 or 422 with field errors. Nothing is stored.',
    code: 'POST /v1/posts → 201',
  },
  {
    Icon: LanguagesIcon,
    title: '16 locales',
    text: 'Names, addresses and text in German, Japanese, Arabic, Brazilian Portuguese and more, to test your layout and i18n.',
    code: '?locale=ja',
  },
  {
    Icon: TimerIcon,
    title: 'Unhappy paths on demand',
    text: 'Slow any response down to see your loading states, or get any status code to see your error states.',
    code: '?delay=1500 · /v1/status/503',
  },
  {
    Icon: AlertTriangleIcon,
    title: 'Errors you can parse',
    text: 'Every error is an RFC 9457 problem+json document, with one entry per invalid field. Write your error handling once.',
    code: 'application/problem+json',
  },
  {
    Icon: ZapIcon,
    title: 'Fast and cacheable',
    text: 'ETags and 304s, Cache-Control, and a two-tier server cache. Fair per-IP rate limits with standard headers.',
    code: 'If-None-Match → 304',
  },
  {
    Icon: FileCodeIcon,
    title: 'OpenAPI 3, typed clients',
    text: 'A complete spec with every schema, filter and error. Generate a typed client, import it into Postman, or browse it in Swagger UI.',
    code: '/openapi.json',
  },
];

export function Features() {
  return (
    <section className="site-section site-section--muted" id="features" aria-labelledby="features-title">
      <div className="site-section__inner">
        <div className="site-section__intro">
          <p className="site-section__eyebrow">// features</p>
          <h2 className="site-section__title" id="features-title">
            Everything your UI will meet in production, minus the backend
          </h2>
          <p className="site-section__lead">
            Build the screens first. FakerJson behaves like the API you’ll eventually have, so the code you write
            against it survives the switch.
          </p>
        </div>
        <ul className="features__list">
          {features.map(({ Icon, title, text, code }) => (
            <li key={title}>
              <Card className="features__card">
                <CardHeader>
                  <span className="features__icon">
                    <Icon aria-hidden size={20} />
                  </span>
                  <CardTitle asChild>
                    <h3>{title}</h3>
                  </CardTitle>
                  <CardDescription>{text}</CardDescription>
                  <code className="features__code">{code}</code>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
