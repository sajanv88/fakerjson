import { CodeBlock } from '@nuvui/chat';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nuvui/react';
import { PUBLIC_ORIGIN, highlighter } from '../api';
import './QuickStart.scss';

const samples = [
  {
    id: 'fetch',
    label: 'fetch',
    language: 'ts',
    title: 'Paginated list',
    code: `const res = await fetch('${PUBLIC_ORIGIN}/v1/posts?page=1&limit=10&sort=-createdAt');
const { data, meta, links } = await res.json();

console.log(meta.totalItems);  // 1000
console.log(links.next);       // "/v1/posts?page=2&limit=10&sort=-createdAt"`,
  },
  {
    id: 'react',
    label: 'React',
    language: 'tsx',
    title: 'UserCard.tsx',
    code: `import { useEffect, useState } from 'react';

type User = { id: number; firstName: string; lastName: string; avatar: string };

export function UserCard({ id }: { id: number }) {
  const [user, setUser] = useState<User>();

  useEffect(() => {
    fetch(\`${PUBLIC_ORIGIN}/v1/users/\${id}?fields=firstName,lastName,avatar\`)
      .then((res) => res.json())
      .then(setUser);
  }, [id]);

  if (!user) return <p>Loading…</p>;
  return <img src={user.avatar} alt={\`\${user.firstName} \${user.lastName}\`} />;
}`,
  },
  {
    id: 'errors',
    label: 'Errors',
    language: 'ts',
    title: 'Handling a 422',
    code: `const res = await fetch('${PUBLIC_ORIGIN}/v1/posts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 1, title: 'Hi' }),
});

if (!res.ok) {
  // RFC 9457: { type, title, status, detail, errors: [{ field, message }] }
  const problem = await res.json();
  problem.errors.forEach((e) => form.setError(e.field, e.message));
}`,
  },
  {
    id: 'curl',
    label: 'curl',
    language: 'sh',
    title: 'Terminal',
    code: `# Filter, sort and pick fields
curl "${PUBLIC_ORIGIN}/v1/products?price_gte=100&sort=-rating&fields=id,name,price"

# Conditional GET: the second call answers 304 Not Modified
curl -i "${PUBLIC_ORIGIN}/v1/users/1" -H 'If-None-Match: "<etag from the first call>"'`,
  },
  {
    id: 'types',
    label: 'Typed client',
    language: 'sh',
    title: 'Generate types from the OpenAPI spec',
    code: `npx openapi-typescript ${PUBLIC_ORIGIN}/openapi.json -o fakerjson.d.ts

# Or import ${PUBLIC_ORIGIN}/openapi.json into Postman, Insomnia or Bruno.`,
  },
];

export function QuickStart() {
  return (
    <section className="site-section site-section--muted" id="quick-start" aria-labelledby="quick-start-title">
      <div className="site-section__inner quick-start">
        <div className="site-section__intro">
          <p className="site-section__eyebrow">// quick start</p>
          <h2 className="site-section__title" id="quick-start-title">
            No key, no SDK, no setup
          </h2>
          <p className="site-section__lead">
            It’s plain HTTP with CORS open to every origin. Paste a URL into your code and start building.
          </p>
        </div>
        <Tabs defaultValue="fetch" className="quick-start__tabs">
          <TabsList aria-label="Examples">
            {samples.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {samples.map((s) => (
            <TabsContent key={s.id} value={s.id}>
              <CodeBlock code={s.code} language={s.language} title={s.title} highlighter={highlighter} label={`${s.label} example`} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
