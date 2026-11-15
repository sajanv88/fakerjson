import { Button, Separator } from '@nuvui/react';
import { ArrowRightIcon, BracesIcon } from '@nuvui/icons';
import './SiteFooter.scss';

const groups = [
  {
    title: 'API',
    links: [
      { name: 'API reference', href: '/docs' },
      { name: 'OpenAPI (JSON)', href: '/openapi.json' },
      { name: 'OpenAPI (YAML)', href: '/openapi.yaml' },
      { name: 'Index (/v1)', href: '/v1' },
    ],
  },
  {
    title: 'Try',
    links: [
      { name: 'A user', href: '/v1/users/1' },
      { name: 'Products by rating', href: '/v1/products?sort=-rating&limit=5' },
      { name: 'A slow response', href: '/v1/todos?delay=1500&limit=3' },
      { name: 'A 503 error', href: '/v1/status/503' },
    ],
  },
  {
    title: 'Page',
    links: [
      { name: 'Playground', href: '#playground' },
      { name: 'Features', href: '#features' },
      { name: 'Resources', href: '#resources' },
      { name: 'FAQ', href: '#faq' },
    ],
  },
];

/** The X logo. @nuvui/icons has no brand marks. */
function XLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function SiteFooter({ version }: { version: string }) {
  return (
    <>
      <section className="site-section cta" aria-labelledby="cta-title">
        <div className="cta__inner">
          <h2 className="cta__title" id="cta-title">
            Your next UI is one <code>fetch</code> away
          </h2>
          <p className="cta__lead">Free, stable, no sign-up. Point your app at fakerjson.com and start building.</p>
          <div className="cta__actions">
            <Button asChild size="lg">
              <a href="#playground">
                Open the playground <ArrowRightIcon size={18} aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" intent="secondary">
              <a href="/docs">Browse the reference</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__top">
            <div className="site-footer__about">
              <a className="site-footer__brand" href="#top">
                <BracesIcon size={20} aria-hidden="true" />
                FakerJson
              </a>
              <p className="site-footer__text">
                A free fake REST API with realistic, stable data for prototypes, demos, tests and tutorials.
              </p>
              <p className="site-footer__credit">
                Built by{' '}
                <a className="site-footer__credit-link" href="https://github.com/sajanv88">
                  sajanv88
                </a>
              </p>
              <Button asChild size="sm" intent="secondary">
                <a href="https://x.com/sajanvtech">
                  <XLogo />
                  Follow @sajanvtech
                </a>
              </Button>
            </div>
            {groups.map((group) => (
              <nav key={group.title} className="site-footer__group" aria-labelledby={`footer-${group.title.toLowerCase()}`}>
                <h2 className="site-footer__heading" id={`footer-${group.title.toLowerCase()}`}>
                  {group.title}
                </h2>
                <ul className="site-footer__list">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a className="site-footer__link" href={link.href}>
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <Separator />
          <div className="site-footer__foot">
            <p className="site-footer__note">
              FakerJson v{version} · Data generated with Faker · Served by NestJS
            </p>
            <p className="site-footer__note">Fake data only. Don’t send anything real.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
