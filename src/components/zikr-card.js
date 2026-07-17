/**
 * ════════════════════════════════════════════
 *  دين (Deen) — Zikr Card Component
 * ════════════════════════════════════════════
 *  Interactive dhikr counter card. Users tap
 *  to increment. Includes haptic feedback,
 *  pulse animation, and a completed state.
 * ════════════════════════════════════════════
 */

import { t } from '../i18n/index.js';

// ── Render ─────────────────────────────────

/**
 * Render a zikr (remembrance) card
 * @param {Object} zikr           — Zikr data object
 * @param {string} zikr.text      — The dhikr text (Arabic)
 * @param {number} zikr.count     — Target repetition count
 * @param {string} [zikr.reference] — Hadith / source reference
 * @param {number} index          — Unique index for DOM ids
 * @returns {string} Card markup
 */
export function renderZikrCard(zikr, index) {
  return `
    <div class="zikr-card" id="zikr-${index}" data-count="${zikr.count}" data-current="0">
      <div class="zikr-card__text">${zikr.text}</div>
      <div class="zikr-card__counter">
        <button class="zikr-card__tap" id="zikr-tap-${index}" aria-label="Tap to count">
          <span class="zikr-card__current" id="zikr-current-${index}">0</span>
          <span class="zikr-card__separator">/</span>
          <span class="zikr-card__total">${zikr.count}</span>
        </button>
      </div>
      ${zikr.reference ? `<div class="zikr-card__reference">${zikr.reference}</div>` : ''}
    </div>
  `;
}

// ── Interactivity ──────────────────────────

/**
 * Attach tap-to-count handlers to all zikr cards
 * currently in the DOM. Call after rendering.
 */
export function initZikrCounters() {
  document.querySelectorAll('.zikr-card__tap').forEach(btn => {
    btn.addEventListener('click', () => {
      const card     = btn.closest('.zikr-card');
      const index    = card.id.replace('zikr-', '');
      const maxCount = parseInt(card.dataset.count);
      let current    = parseInt(card.dataset.current);

      if (current < maxCount) {
        current++;
        card.dataset.current = current;
        document.getElementById(`zikr-current-${index}`).textContent = current;

        // Haptic feedback (mobile devices)
        if (navigator.vibrate) navigator.vibrate(30);

        // Visual pulse animation
        btn.classList.add('pulse');
        setTimeout(() => btn.classList.remove('pulse'), 200);

        // Mark as completed when target reached
        if (current >= maxCount) {
          card.classList.add('zikr-card--completed');
        }
      }
    });
  });
}
