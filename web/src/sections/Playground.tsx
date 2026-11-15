import { CodeBlock } from '@nuvui/chat';
import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@nuvui/react';
import { SendIcon, SparklesIcon } from '@nuvui/icons';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ApiIndex, FAMILIES, PUBLIC_ORIGIN, highlighter } from '../api';
import './Playground.scss';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Method = (typeof METHODS)[number];

interface Request {
  method: Method;
  path: string;
  query: string;
  body: string;
}

interface Result {
  status: number;
  statusText: string;
  ms: number;
  bytes: number;
  body: string;
  headers: [string, string][];
}

/** One click each: a request that shows off one thing the API does. */
const RECIPES: { label: string; request: Request }[] = [
  { label: 'Paginate', request: { method: 'GET', path: '/v1/posts', query: 'page=2&limit=3&fields=id,title,userId', body: '' } },
  { label: 'Filter + sort', request: { method: 'GET', path: '/v1/products', query: 'price_gte=100&status=active&sort=-rating&limit=3&fields=id,name,price,rating', body: '' } },
  { label: 'Search', request: { method: 'GET', path: '/v1/users', query: 'q=ann&fields=id,firstName,lastName,email', body: '' } },
  { label: 'Expand relation', request: { method: 'GET', path: '/v1/comments/1', query: 'expand=post&fields=id,body,post', body: '' } },
  { label: 'Nested route', request: { method: 'GET', path: '/v1/users/3/todos', query: 'completed=false&limit=5&fields=id,title,priority,dueDate', body: '' } },
  { label: 'German locale', request: { method: 'GET', path: '/v1/users/1', query: 'locale=de&fields=firstName,lastName,address', body: '' } },
  { label: 'Another seed', request: { method: 'GET', path: '/v1/users/1', query: 'seed=7&fields=firstName,lastName,email', body: '' } },
  { label: 'Slow (1.5 s)', request: { method: 'GET', path: '/v1/orders/1', query: 'delay=1500&fields=orderNumber,total,status', body: '' } },
  { label: '503 error', request: { method: 'GET', path: '/v1/status/503', query: '', body: '' } },
  {
    label: 'Create (201)',
    request: {
      method: 'POST',
      path: '/v1/posts',
      query: '',
      body: JSON.stringify({ userId: 1, title: 'Hello FakerJson', body: 'My first post.', tags: ['demo'], status: 'draft', publishedAt: null }, null, 2),
    },
  },
  {
    label: 'Invalid body (422)',
    request: { method: 'POST', path: '/v1/posts', query: '', body: JSON.stringify({ userId: 9999, title: 'Hi', status: 'nope' }, null, 2) },
  },
];

const DEFAULT_REQUEST = RECIPES[0]!.request;

const withQuery = (path: string, query: string) => {
  const q = query.trim().replace(/^\?/, '');
  return q ? `${path}?${q}` : path;
};

function snippetFor({ method, path, query, body }: Request): string {
  const url = `${PUBLIC_ORIGIN}${withQuery(path, query)}`;
  if (method === 'GET') {
    return `const res = await fetch('${url}');
const data = await res.json();`;
  }
  const init = [`method: '${method}'`];
  if (body.trim() && method !== 'DELETE') {
    let payload = body.trim();
    try {
      payload = JSON.stringify(JSON.parse(payload)); // one line in the snippet
    } catch {
      // Not valid JSON yet: show what was typed.
    }
    init.push(`headers: { 'Content-Type': 'application/json' }`, `body: JSON.stringify(${payload})`);
  }
  return `const res = await fetch('${url}', {
  ${init.join(',\n  ')},
});
${method === 'DELETE' ? 'console.log(res.status); // 204' : 'const data = await res.json();'}`;
}

function statusIntent(status: number): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 200) return 'success';
  return 'neutral';
}

const INTERESTING = ['x-cache', 'x-total-count', 'x-ratelimit-remaining', 'etag', 'location', 'content-type'];

export function Playground({ index }: { index: ApiIndex }) {
  const [request, setRequest] = useState<Request>(DEFAULT_REQUEST);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState('body');
  const abort = useRef<AbortController | null>(null);

  const send = useCallback(async (req: Request) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    setError(null);
    const started = performance.now();
    try {
      const hasBody = req.method !== 'GET' && req.method !== 'DELETE' && req.body.trim() !== '';
      const res = await fetch(withQuery(req.path, req.query), {
        method: req.method,
        signal: controller.signal,
        // Always a round trip (revalidates), without asking the server to bypass its cache.
        cache: 'no-cache',
        ...(hasBody && { headers: { 'Content-Type': 'application/json' }, body: req.body }),
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = text ? JSON.stringify(JSON.parse(text), null, 2) : '(empty body)';
      } catch {
        // Not JSON: show as is.
      }
      setResult({
        status: res.status,
        statusText: res.statusText,
        ms: Math.round(performance.now() - started),
        bytes: new Blob([text]).size,
        body: pretty,
        headers: [...res.headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      if (abort.current === controller) setPending(false);
    }
  }, []);

  // A first response on load, so the panel is never empty.
  useEffect(() => {
    void send(DEFAULT_REQUEST);
    return () => abort.current?.abort();
  }, [send]);

  const resourcePath = useMemo(() => request.path.split('/')[2] ?? '', [request.path]);

  const update = (patch: Partial<Request>) => setRequest((now) => ({ ...now, ...patch }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(request);
  };

  const runRecipe = (req: Request) => {
    setRequest(req);
    setTab('body');
    void send(req);
  };

  const header = (name: string) => result?.headers.find(([k]) => k === name)?.[1];

  return (
    <section className="site-section playground" id="playground" aria-labelledby="playground-title">
      <div className="site-section__inner">
        <div className="site-section__intro">
          <p className="site-section__eyebrow">// playground</p>
          <h2 className="site-section__title" id="playground-title">
            Send a real request, right here
          </h2>
          <p className="site-section__lead">
            Every call below hits the live API. Pick a recipe or build your own: the same URL works from your app,
            your tests, or curl.
          </p>
        </div>

        <div className="playground__recipes" role="group" aria-label="Example requests">
          <SparklesIcon size={18} aria-hidden="true" className="playground__recipes-icon" />
          {RECIPES.map((recipe) => (
            <Button key={recipe.label} intent="secondary" size="sm" onClick={() => runRecipe(recipe.request)}>
              {recipe.label}
            </Button>
          ))}
        </div>

        <div className="playground__grid">
          <form className="playground__form" onSubmit={onSubmit} aria-label="Request">
            <div className="playground__line">
              <Field className="playground__method">
                <FieldLabel>Method</FieldLabel>
                <Select value={request.method} onValueChange={(method) => update({ method: method as Method })}>
                  <FieldControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FieldControl>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field className="playground__resource">
                <FieldLabel>Resource</FieldLabel>
                <Select
                  value={index.resources.some((r) => r.name === resourcePath) ? resourcePath : undefined}
                  onValueChange={(name) => update({ path: `/v1/${name}`, query: 'limit=3' })}
                >
                  <FieldControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Custom path" />
                    </SelectTrigger>
                  </FieldControl>
                  <SelectContent>
                    {FAMILIES.map((family) => (
                      <SelectGroup key={family}>
                        <SelectLabel>{family}</SelectLabel>
                        {index.resources
                          .filter((r) => r.group === family)
                          .map((r) => (
                            <SelectItem key={r.name} value={r.name}>
                              {r.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel>Path</FieldLabel>
              <InputGroup>
                <InputGroupAddon>fakerjson.com</InputGroupAddon>
                <FieldControl>
                  <Input
                    value={request.path}
                    onChange={(e) => update({ path: e.target.value.startsWith('/') ? e.target.value : `/${e.target.value}` })}
                    spellCheck={false}
                    autoComplete="off"
                    className="playground__mono"
                  />
                </FieldControl>
              </InputGroup>
            </Field>

            <Field>
              <FieldLabel>Query</FieldLabel>
              <InputGroup>
                <InputGroupAddon>?</InputGroupAddon>
                <FieldControl>
                  <Input
                    value={request.query}
                    onChange={(e) => update({ query: e.target.value })}
                    placeholder="page=1&limit=10&sort=-createdAt"
                    spellCheck={false}
                    autoComplete="off"
                    className="playground__mono"
                  />
                </FieldControl>
              </InputGroup>
              <FieldDescription>
                Try <code className="inline-code">fields</code>, <code className="inline-code">expand</code>,{' '}
                <code className="inline-code">seed</code>, <code className="inline-code">locale</code> or{' '}
                <code className="inline-code">delay</code>.
              </FieldDescription>
            </Field>

            {request.method !== 'GET' && request.method !== 'DELETE' && (
              <Field>
                <FieldLabel>JSON body</FieldLabel>
                <FieldControl>
                  <Textarea
                    value={request.body}
                    onChange={(e) => update({ body: e.target.value })}
                    rows={7}
                    spellCheck={false}
                    className="playground__mono"
                  />
                </FieldControl>
                <FieldDescription>Validated like a real API, then answered. Nothing is stored.</FieldDescription>
              </Field>
            )}

            <Button type="submit" size="lg" disabled={pending} className="playground__send">
              {pending ? <Spinner size="sm" label="Sending" /> : <SendIcon size={18} aria-hidden="true" />}
              Send request
            </Button>
          </form>

          <div className="playground__response" aria-live="polite" aria-busy={pending}>
            <div className="playground__summary">
              {result ? (
                <>
                  <Badge intent={statusIntent(result.status)}>
                    {result.status} {result.statusText}
                  </Badge>
                  <span className="playground__meta">{result.ms} ms</span>
                  <span className="playground__meta">{(result.bytes / 1024).toFixed(1)} KB</span>
                  {header('x-cache') && <Badge variant="outline">cache {header('x-cache')}</Badge>}
                  {header('x-total-count') && <Badge variant="outline">{header('x-total-count')} total</Badge>}
                  {header('x-ratelimit-remaining') && (
                    <span className="playground__meta">
                      {header('x-ratelimit-remaining')}/{header('x-ratelimit-limit')} requests left this minute
                    </span>
                  )}
                </>
              ) : (
                <span className="playground__meta">{error ? `Request failed: ${error}` : 'Sending…'}</span>
              )}
            </div>

            <Tabs value={tab} onValueChange={setTab} className="playground__tabs">
              <TabsList aria-label="Response">
                <TabsTrigger value="body">Body</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
                <TabsTrigger value="code">Code</TabsTrigger>
              </TabsList>
              <TabsContent value="body">
                <CodeBlock
                  code={result?.body ?? ''}
                  language="json"
                  highlighter={highlighter}
                  label="Response body"
                  className="playground__code"
                />
              </TabsContent>
              <TabsContent value="headers">
                <CodeBlock
                  code={(result?.headers ?? [])
                    .filter(([k]) => INTERESTING.includes(k) || k.startsWith('x-ratelimit') || k === 'link' || k === 'cache-control')
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n')}
                  language="http"
                  label="Response headers"
                  className="playground__code"
                />
              </TabsContent>
              <TabsContent value="code">
                <CodeBlock
                  code={snippetFor(request)}
                  language="js"
                  highlighter={highlighter}
                  label="Code for this request"
                  className="playground__code"
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </section>
  );
}
