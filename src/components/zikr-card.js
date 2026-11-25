/**
 * دين (Deen) — Zikr Card Component
 * Interactive dhikr counter with daily persistence, localized numerals,
 * per-card reset, and full-card tap ergonomics.
 */

import { t } from '../i18n/index.js';
import { formatNum } from '../utils/helpers.js';
import { getAzkarProgress, saveAzkarProgress } from '../utils/storage.js';
import { showToast } from '../utils/toast.js';

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function computeStrokeOffset(current, maxCount) {
  if (!maxCount || maxCount <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, current / maxCount));
  return (RING_CIRCUMFERENCE * (1 - ratio)).toFixed(2);
}

export function renderZikrCard(zikr, index, savedCurrent = 0) {
  const current = Math.min(zikr.count, Math.max(0, savedCurrent || 0));
  const completed = current >= zikr.count;
  const dashOffset = computeStrokeOffset(current, zikr.count);

  const dhikrBody = zikr.isEn
    ? `<div class="zikr-card__text zikr-card__text--ar" dir="rtl">${zikr.textAr}</div>
       <div class="zikr-card__translit" dir="ltr">${zikr.textEn}</div>`
    : `<div class="zikr-card__text" dir="rtl">${zikr.text}</div>`;

  return `
    <div class="zikr-card ${completed ? 'zikr-card--completed' : ''}" id="zikr-${index}" data-index="${index}" data-count="${zikr.count}" data-current="${current}">
      ${dhikrBody}
      <div class="zikr-card__counter">
        <button class="zikr-card__tap" id="zikr-tap-${index}" aria-label="${t('azkar_count')}">
          <svg class="zikr-ring-svg" viewBox="0 0 96 96" aria-hidden="true">
            <circle class="zikr-ring-track" cx="48" cy="48" r="${RING_RADIUS}" />
            <circle
              class="zikr-ring-progress"
              id="zikr-ring-${index}"
              cx="48"
              cy="48"
              r="${RING_RADIUS}"
              stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}"
              stroke-dashoffset="${dashOffset}"
            />
          </svg>
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
 * Single delegated event handler on .zikr-list with daily localStorage persistence,
 * live SVG circular progress ring updates, and smooth auto-advance to next incomplete Zikr.
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
      const maxCount = parseInt(card.dataset.count, 10) || 1;
      card.dataset.current = '0';
      card.classList.remove('zikr-card--completed');
      const curEl = document.getElementById(`zikr-current-${idx}`);
      if (curEl) curEl.textContent = formatNum(0);
      const ringEl = document.getElementById(`zikr-ring-${idx}`);
      if (ringEl) ringEl.setAttribute('stroke-dashoffset', computeStrokeOffset(0, maxCount));
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
      const ringEl = document.getElementById(`zikr-ring-${index}`);
      if (ringEl) ringEl.setAttribute('stroke-dashoffset', computeStrokeOffset(current, maxCount));

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
        const allCards = Array.from(list.querySelectorAll('.zikr-card'));
        const curPos = allCards.indexOf(card);
        const nextIncomplete =
          allCards.slice(curPos + 1).find((c) => !c.classList.contains('zikr-card--completed')) ||
          allCards.find((c) => !c.classList.contains('zikr-card--completed'));

        if (nextIncomplete) {
          setTimeout(() => {
            nextIncomplete.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 360);
        } else {
          showToast(t('azkar_all_done'), 'success', 3200);
        }
      }
    }
  });
}
