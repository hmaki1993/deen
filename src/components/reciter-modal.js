/**
 * Deen App — Reciter Selection Fullscreen Sheet
 * Properly styled via .reciter-page, localized (AR/EN), dynamic RTL/LTR,
 * and never caches stale .bottom-nav DOM references.
 */

import { t, getLang } from '../i18n/index.js';
import { RECITERS } from '../api/audio.js';
import { getReciter, setReciter } from '../utils/storage.js';

export function renderReciterModal() {
  const currentId = getReciter();
  const lang = getLang();
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  return `
    <div id="reciter-modal" class="reciter-page hidden" dir="${dir}" role="dialog" aria-modal="true">
      <div class="reciter-page-header">
        <button id="close-reciter-modal" class="icon-btn" aria-label="${t('back')}">
          <svg class="icon-back-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h3 class="reciter-page-title">${t('quran_reciter')}</h3>
        <div style="width: 44px;"></div>
      </div>
      <div class="reciter-page-content">
        <div class="reciter-list" id="reciter-list">
          ${RECITERS.map(
            (r) => `
            <button class="reciter-option ${r.id === currentId ? 'active' : ''}" data-id="${r.id}">
              <span class="reciter-option__name">${lang === 'ar' ? r.nameAr : r.nameEn}</span>
              <span class="reciter-option__check">${r.id === currentId ? '✓' : ''}</span>
            </button>
          `
          ).join('')}
        </div>
      </div>
    </div>
  `;
}

export function closeReciterModal() {
  const modal = document.getElementById('reciter-modal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

export function openReciterModal() {
  const modal = document.getElementById('reciter-modal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }
}

export function initReciterModalEvents(onReciterChanged) {
  document.getElementById('close-reciter-modal')?.addEventListener('click', closeReciterModal);

  const list = document.getElementById('reciter-list');
  list?.addEventListener('click', (e) => {
    const btn = e.target.closest('.reciter-option');
    if (!btn) return;

    list.querySelectorAll('.reciter-option').forEach((b) => {
      b.classList.remove('active');
      const chk = b.querySelector('.reciter-option__check');
      if (chk) chk.textContent = '';
    });

    btn.classList.add('active');
    const chk = btn.querySelector('.reciter-option__check');
    if (chk) chk.textContent = '✓';

    setReciter(btn.dataset.id);
    closeReciterModal();

    if (onReciterChanged) onReciterChanged();
  });
}
