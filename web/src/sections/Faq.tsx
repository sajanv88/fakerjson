import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@nuvui/react';
import type { ReactNode } from 'react';
import './Faq.scss';

const c = (text: string) => <code className="inline-code">{text}</code>;

const questions: { q: string; a: ReactNode }[] = [
  {
    q: 'Is it really free? Do I need an API key?',
    a: <>Yes, and no. There is no sign-up, no key and no SDK. CORS is open to every origin, so it works from the browser, a server, a test runner or curl.</>,
  },
  {
    q: 'Is anything stored when I POST, PUT, PATCH or DELETE?',
    a: (
      <>
        No. Writes are validated and answered exactly as a real API would (201 with a {c('Location')}, 200, 204, 404,
        or 422 with field errors), but the data never changes. That keeps it safe to share and identical for everyone.
      </>
    ),
  },
  {
    q: 'Will the data change under my tests?',
    a: (
      <>
        No. Rows are generated from a seed, so the same URL returns the same JSON on every call. Add {c('?seed=7')}{' '}
        for a different dataset that is just as stable, or {c('?locale=fr')} for French names and addresses.
      </>
    ),
  },
  {
    q: 'What are the rate limits?',
    a: (
      <>
        Per IP: 300 requests a minute, bursts of 25 a second, and 60 writes a minute. Every response carries{' '}
        {c('X-RateLimit-Limit')}, {c('X-RateLimit-Remaining')} and {c('X-RateLimit-Reset')}; a 429 carries{' '}
        {c('Retry-After')}.
      </>
    ),
  },
  {
    q: 'How do I test loading and error states?',
    a: (
      <>
        Add {c('?delay=2000')} to any request to slow it down, or call {c('/v1/status/503')} (or any code from 200
        to 599). Errors come back as RFC 9457 {c('application/problem+json')}, like they would in production.
      </>
    ),
  },
  {
    q: 'Can I generate a typed client?',
    a: (
      <>
        Yes. The full OpenAPI 3 document is at {c('/openapi.json')} (and {c('/openapi.yaml')}). Feed it to
        openapi-typescript, Orval or your favourite generator, or import it into Postman.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section className="site-section site-section--muted" id="faq" aria-labelledby="faq-title">
      <div className="site-section__inner faq">
        <div className="site-section__intro">
          <p className="site-section__eyebrow">// faq</p>
          <h2 className="site-section__title" id="faq-title">
            Questions developers ask
          </h2>
        </div>
        <Accordion type="single" collapsible defaultValue="q-0" className="faq__list">
          {questions.map((item, i) => (
            <AccordionItem key={item.q} value={`q-${i}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>
                <p className="faq__answer">{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
