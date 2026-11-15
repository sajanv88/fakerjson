import type { CodeHighlighter } from '@nuvui/chat';

/**
 * Like `@nuvui/chat/shiki`, with the same theme variables, but bundling only the six grammars
 * this page shows instead of every language Shiki knows (9 MB of chunks down to a few hundred KB).
 * Shiki is still fetched lazily, the first time a block is colored.
 */
const GRAMMARS = {
  json: () => import('shiki/langs/json.mjs'),
  js: () => import('shiki/langs/javascript.mjs'),
  ts: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  sh: () => import('shiki/langs/shellscript.mjs'),
  http: () => import('shiki/langs/http.mjs'),
} as const;

type Lang = keyof typeof GRAMMARS;
/** The id each grammar registers under in Shiki. */
const SHIKI_ID: Record<Lang, string> = {
  json: 'json',
  js: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  sh: 'shellscript',
  http: 'http',
};
const isLang = (l: string): l is Lang => Object.hasOwn(GRAMMARS, l);

// The library's defaults: every token color is a theme token, so dark mode just works.
const defaults = {
  foreground: 'currentcolor',
  'token-comment': 'var(--color-muted-foreground)',
  'token-punctuation': 'var(--color-muted-foreground)',
  'token-keyword': 'var(--color-danger)',
  'token-string': 'var(--color-success)',
  'token-string-expression': 'var(--color-success)',
  'token-constant': 'var(--color-warning)',
  'token-function': 'currentcolor',
  'token-parameter': 'currentcolor',
  'token-link': 'currentcolor',
  'token-inserted': 'var(--color-success)',
  'token-deleted': 'var(--color-danger)',
  'token-changed': 'var(--color-warning)',
};

async function start() {
  const [core, engine] = await Promise.all([import('shiki/core'), import('shiki/engine/javascript')]);
  const theme = core.createCssVariablesTheme({
    name: 'fakerjson',
    variablePrefix: '--nuv-code-block-',
    variableDefaults: defaults,
    fontStyle: true,
  });
  return core.createHighlighterCore({
    themes: [theme],
    langs: [],
    engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
  });
}

export function createSlimHighlighter(): CodeHighlighter {
  let shiki: ReturnType<typeof start> | undefined;
  const loading = new Map<Lang, Promise<void>>();

  return async (code, language) => {
    const lang = language?.toLowerCase() ?? '';
    if (!isLang(lang)) return null;
    shiki ??= start();
    const highlighter = await shiki;
    if (!loading.has(lang)) {
      loading.set(lang, GRAMMARS[lang]().then((m) => highlighter.loadLanguage(m.default)));
    }
    await loading.get(lang);
    const { tokens } = highlighter.codeToTokens(code, { lang: SHIKI_ID[lang], theme: 'fakerjson' });
    return tokens.map((line) =>
      line.map((token) => {
        const style = token.fontStyle ?? 0;
        return {
          content: token.content,
          ...(token.color && { color: token.color }),
          ...(style & 1 && { fontStyle: 'italic' as const }),
          ...(style & 2 && { fontWeight: 'bold' as const }),
          ...(style & 4 && { textDecoration: 'underline' as const }),
          ...(style & 8 && { textDecoration: 'line-through' as const }),
        };
      }),
    );
  };
}
