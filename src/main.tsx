import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setCsrfFallback } from './api';
import Fair from './Fair';
import './story.css';

// Шаблон главной: <div id="alterlit-story" data-csrf="{{ csrf_token }}"></div> на месте #fair-wrap
const rootEl = document.getElementById('alterlit-story');
if (rootEl) {
  setCsrfFallback(rootEl.dataset.csrf ?? '');
  // старые обработчики ярмарки в base.html висят на #fair и body — клики острова до них не доходят
  rootEl.addEventListener('click', (e) => e.stopPropagation());
  createRoot(rootEl).render(
    <StrictMode>
      <Fair root={rootEl} />
    </StrictMode>,
  );
}
