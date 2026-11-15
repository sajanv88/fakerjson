import { CodeBlock } from '@nuvui/chat';
import { GlyphBackground } from '@nuvui/backgrounds/glyph-background';
import { AnimatedNumber, Badge, Button } from '@nuvui/react';
import { ArrowRightIcon, PauseIcon, PlayIcon } from '@nuvui/icons';
import { useEffect, useState } from 'react';
import { type ApiIndex, PUBLIC_ORIGIN, highlighter } from '../api';
import './Hero.scss';

const request = `const res = await fetch('${PUBLIC_ORIGIN}/v1/users/1');
const user = await res.json();`;

const fallbackUser = `{
  "id": 1,
  "firstName": "Kaleb",
  "lastName": "O'Reilly",
  "email": "kaleb_oreilly@example.com",
  "company": { "name": "Lind, Prosacco and Runolfsson", ... }
}`;

/** The real response for user 1, trimmed, so the hero shows what the API returns. */
function useSampleUser(): string {
  const [json, setJson] = useState(fallbackUser);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/v1/users/1?fields=firstName,lastName,email,role,address', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((user: { address?: { geo?: unknown } }) => {
        if (user.address) delete user.address.geo;
        setJson(JSON.stringify(user, null, 2));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return json;
}

export function Hero({ index, live }: { index: ApiIndex; live: boolean }) {
  // Anything that moves for more than five seconds needs a way to stop it.
  const [paused, setPaused] = useState(false);
  const sample = useSampleUser();
  const totalRows = index.resources.reduce((n, r) => n + r.count, 0);

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <GlyphBackground className="hero__stage" scrim="soft" paused={paused} glyphs={'{}[]:,"01'}>
        <div className="hero__inner">
          <div className="hero__words">
            <div className="hero__badges">
              <Badge intent="primary">Free</Badge>
              <Badge variant="outline">No sign-up</Badge>
              <Badge variant="outline">CORS on</Badge>
              <Badge variant="outline">OpenAPI 3</Badge>
            </div>
            <h1 className="hero__title" id="hero-title">
              Fake data.
              <br />
              <span className="hero__accent">Real API.</span>
            </h1>
            <p className="hero__lead">
              A free REST API for prototypes, demos and tests. Realistic data from Faker that stays the same on every
              call, with real relations, pagination, filters and writes that validate like production.
            </p>
            <div className="hero__actions">
              <Button asChild size="lg">
                <a href="#playground">
                  Try it live <ArrowRightIcon size={18} aria-hidden="true" />
                </a>
              </Button>
              <Button asChild size="lg" intent="secondary">
                <a href="/docs">Read the API reference</a>
              </Button>
            </div>
          </div>

          <div className="hero__code">
            <CodeBlock
              code={request}
              language="js"
              title="app.js"
              highlighter={highlighter}
              label="Example request"
              typing
              typingDuration={1400}
            />
            <CodeBlock
              code={sample}
              language="json"
              title={
                <span className="hero__response-title">
                  <span className="hero__status">200 OK</span> GET /v1/users/1
                </span>
              }
              highlighter={highlighter}
              label="Example response"
              className="hero__response"
            />
          </div>
        </div>

        <dl className="hero__stats" aria-label="FakerJson in numbers">
          <div className="hero__stat">
            <dt>Resources</dt>
            <dd>
              <AnimatedNumber value={live ? index.resources.length : 0} />
            </dd>
          </div>
          <div className="hero__stat">
            <dt>Rows ready to fetch</dt>
            <dd>
              <AnimatedNumber value={live ? totalRows : 0} />
            </dd>
          </div>
          <div className="hero__stat">
            <dt>Locales</dt>
            <dd>
              <AnimatedNumber value={live ? index.locales.length : 0} />
            </dd>
          </div>
          <div className="hero__stat">
            <dt>API keys needed</dt>
            <dd>0</dd>
          </div>
        </dl>

        <Button
          intent="ghost"
          size="sm"
          className="hero__pause"
          aria-pressed={paused}
          onClick={() => setPaused((now) => !now)}
        >
          {paused ? <PlayIcon aria-hidden="true" size={16} /> : <PauseIcon aria-hidden="true" size={16} />}
          {paused ? 'Play the background' : 'Pause the background'}
        </Button>
      </GlyphBackground>
    </section>
  );
}
