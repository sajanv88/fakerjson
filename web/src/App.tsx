import { ScrollProgress } from '@nuvui/react';
import { useApiIndex } from './api';
import { Comparison } from './sections/Comparison';
import { Faq } from './sections/Faq';
import { Features } from './sections/Features';
import { Hero } from './sections/Hero';
import { Playground } from './sections/Playground';
import { QuickStart } from './sections/QuickStart';
import { Resources } from './sections/Resources';
import { SiteFooter } from './sections/SiteFooter';
import { SiteHeader } from './sections/SiteHeader';

export function App() {
  const { index, live } = useApiIndex();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollProgress />
      <SiteHeader />
      <main id="main">
        <Hero index={index} live={live} />
        <Playground index={index} />
        <Features />
        <Resources index={index} />
        <QuickStart />
        <Comparison />
        <Faq />
      </main>
      <SiteFooter version={index.version} />
    </>
  );
}
