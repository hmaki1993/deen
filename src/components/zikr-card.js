/**
 * دين (Deen) — Zikr Card Component
 * Interactive dhikr counter with daily persistence, localized numerals,
 * per-card reset, and full-card tap ergonomics.
 */

import { t } from '../i18n/index.js';
import { formatNum } from '../utils/helpers.js';
import { getAzkarProgress, saveAzkarProgress } from '../utils/storage.js';

export function renderZikrCard(zikr, index, savedCurrent = 0) {
  const current = Math.min(zikr.count, Math.max(0, savedCurrent || 0));
  const completed = current >= zikr.count;

  return `
    <div class="zikr-card ${completed ? 'zikr-card--completed' : ''}" id="zikr-${index}" data-index="${index}" data-count="${zikr.count}" data-current="${current}">
      <div class="zikr-card__text">${zikr.text}</div>
      <div class="zikr-card__counter">
        <button class="zikr-card__tap" id="zikr-tap-${index}" aria-label="${t('azkar_count')}">
          <span class="zikr-card__current" id="zikr-current-${index}">${formatNum(current)}</span>
          <span class="zikr-card__separator">/</span>
          <span class="zikr-card__total">${formatNum(zikr.count)}</span>
        </button>
        <button class="zikr-card__reset" data-reset="${index}" aria-label="${t('azkar_reset')}" title="${t('azkar_reset')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
      </div>
      ${zikr.reference ? `<div class="zikr-card__reference">${zikr.reference}</div>` : ''}
    </div>
  `;
}

/**
 * Single delegated event handler on .zikr-list with daily localStorage persistence.
 */
export function initZikrCounters(categoryId) {
  const list = document.querySelector('.zikr-list');
  if (!list) return;

  const progress = getAzkarProgress(categoryId);

  list.addEventListener('click', (e) => {
    const resetBtn = e.target.closest('.zikr-card__reset');
    if (resetBtn) {
      e.stopPropagation();
      const idx = resetBtn.dataset.reset;
      const card = document.getElementById(`zikr-${idx}`);
      if (!card) return;
      card.dataset.current = '0';
      card.classList.remove('zikr-card--completed');
      const curEl = document.getElementById(`zikr-current-${idx}`);
      if (curEl) curEl.textContent = formatNum(0);
      progress[idx] = 0;
      saveAzkarProgress(categoryId, progress);
      return;
    }

    const tapBtn = e.target.closest('.zikr-card__tap');
    const card = tapBtn ? tapBtn.closest('.zikr-card') : e.target.closest('.zikr-card');
    if (!card) return;

    const index = card.dataset.index;
    const maxCount = parseInt(card.dataset.count, 10);
    let current = parseInt(card.dataset.current, 10) || 0;

    if (current < maxCount) {
      current++;
      card.dataset.current = String(current);
      const curEl = document.getElementById(`zikr-current-${index}`);
      if (curEl) curEl.textContent = formatNum(current);

      progress[index] = current;
      saveAzkarProgress(categoryId, progress);

      if (navigator.vibrate) {
        try { navigator.vibrate(current >= maxCount ? [30, 40, 50] : 20); } catch {}
      }

      const visualBtn = document.getElementById(`zikr-tap-${index}`);
      if (visualBtn) {
        visualBtn.classList.remove('pulse');
        void visualBtn.offsetWidth;
        visualBtn.classList.add('pulse');
        setTimeout(() => visualBtn.classList.remove('pulse'), 220);
      }

      if (current >= maxCount) {
        card.classList.add('zikr-card--completed');
      }
    }
  });
}
