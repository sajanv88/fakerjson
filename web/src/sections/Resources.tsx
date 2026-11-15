import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nuvui/react';
import { BriefcaseIcon, MessageCircleIcon, ShoppingCartIcon, UsersIcon } from '@nuvui/icons';
import type { ComponentType } from 'react';
import { type ApiIndex, FAMILIES, type Family, formatCount } from '../api';
import './Resources.scss';

const FAMILY_INFO: Record<Family, { Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; text: string }> = {
  Classic: { Icon: UsersIcon, text: 'The JSONPlaceholder six, with richer fields and real timestamps.' },
  'E-commerce': { Icon: ShoppingCartIcon, text: 'A catalogue with prices, stock, reviews, carts and orders.' },
  Business: { Icon: BriefcaseIcon, text: 'Companies, an org chart, invoices and the money that moves.' },
  Social: { Icon: MessageCircleIcon, text: 'Articles, notifications and two-way conversations.' },
};

export function Resources({ index }: { index: ApiIndex }) {
  return (
    <section className="site-section" id="resources" aria-labelledby="resources-title">
      <div className="site-section__inner">
        <div className="site-section__intro">
          <p className="site-section__eyebrow">// resources</p>
          <h2 className="site-section__title" id="resources-title">
            {index.resources.length} resources in four families
          </h2>
          <p className="site-section__lead">
            Each one has list, get, create, replace, update and delete, plus a nested route under its parent, like{' '}
            <code className="inline-code">/v1/users/3/posts</code>.
          </p>
        </div>
        <div className="resources__grid">
          {FAMILIES.map((family) => {
            const { Icon, text } = FAMILY_INFO[family];
            const items = index.resources.filter((r) => r.group === family);
            return (
              <Card key={family} className="resources__card">
                <CardHeader>
                  <div className="resources__head">
                    <span className="resources__icon">
                      <Icon size={20} aria-hidden />
                    </span>
                    <CardTitle asChild>
                      <h3>{family}</h3>
                    </CardTitle>
                  </div>
                  <CardDescription>{text}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="resources__list">
                    {items.map((r) => (
                      <li key={r.name} className="resources__item">
                        <a className="resources__link" href={`${r.href}?limit=5`}>
                          <span className="resources__method">GET</span> /v1/{r.name}
                        </a>
                        <Badge variant="outline">{formatCount(r.count)}</Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
