import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
// The library's stylesheets, once for the whole page, core first.
import '@nuvui/react/styles.css';
import '@nuvui/chat/styles.css';
import '@nuvui/table/styles.css';
import '@nuvui/backgrounds/styles.css';
import './app.scss';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
