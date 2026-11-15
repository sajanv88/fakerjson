import {
  Button,
  Navbar,
  NavbarActions,
  NavbarBrand,
  NavbarLink,
  NavbarMenu,
  NavbarNav,
} from '@nuvui/react';
import { BracesIcon, MoonIcon, SunIcon } from '@nuvui/icons';
import { useEffect, useState } from 'react';
import './SiteHeader.scss';

const links = [
  { name: 'Playground', href: '#playground' },
  { name: 'Features', href: '#features' },
  { name: 'Resources', href: '#resources' },
  { name: 'Quick start', href: '#quick-start' },
  { name: 'FAQ', href: '#faq' },
];

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'fakerjson-theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage blocked: follow the system.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Dark mode is `data-theme` on <html>; the choice is remembered on this device. */
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = () =>
    setTheme((now) => {
      const next = now === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not remembered, still applied.
      }
      return next;
    });
  return [theme, toggle];
}

export function SiteHeader() {
  const [theme, toggleTheme] = useTheme();

  return (
    <Navbar sticky className="site-header">
      <NavbarBrand>
        <a className="site-header__brand" href="#top">
          <span className="site-header__logo" aria-hidden="true">
            <BracesIcon size={18} />
          </span>
          FakerJson
        </a>
      </NavbarBrand>
      <NavbarNav aria-label="Main">
        {links.map((link) => (
          <NavbarLink key={link.href} href={link.href}>
            {link.name}
          </NavbarLink>
        ))}
      </NavbarNav>
      <NavbarActions>
        <Button
          intent="ghost"
          size="sm"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon size={18} aria-hidden="true" /> : <MoonIcon size={18} aria-hidden="true" />}
        </Button>
        <Button asChild intent="secondary" className="site-header__wide">
          <a href="/openapi.json">OpenAPI</a>
        </Button>
        <Button asChild>
          <a href="/docs">API reference</a>
        </Button>
        <NavbarMenu>
          <nav aria-label="Main">
            {links.map((link) => (
              <NavbarLink key={link.href} href={link.href}>
                {link.name}
              </NavbarLink>
            ))}
            <NavbarLink href="/openapi.json">OpenAPI spec</NavbarLink>
          </nav>
        </NavbarMenu>
      </NavbarActions>
    </Navbar>
  );
}
