/**
 * ════════════════════════════════════════════
 *  دين (Deen) — Surah Card Component
 * ════════════════════════════════════════════
 *  Renders a single surah entry for the Quran
 *  index. Shows surah number, Arabic name,
 *  English name, ayah count & revelation type.
 * ════════════════════════════════════════════
 */

import { t, getLang } from '../i18n/index.js';
import { formatNum } from '../utils/helpers.js';

// ── Render ─────────────────────────────────

/**
 * Render a surah list-item card
 * @param {Object} surah — Surah data object
 * @param {number} surah.number
 * @param {string} surah.name          — Arabic surah name
 * @param {string} surah.englishName   — English transliteration
 * @param {number} surah.numberOfAyahs
 * @param {string} surah.revelationType — 'Meccan' | 'Medinan'
 * @returns {string} Card markup (anchor link to surah reader)
 */
export function renderSurahCard(surah) {
  const revType =
    surah.revelationType === 'Meccan'
      ? t('quran_meccan')
      : t('quran_medinan');

  return `
    <a href="#/quran/${surah.number}" class="surah-card glass-card">
      <div class="surah-card__number">
        <span>${formatNum(surah.number)}</span>
      </div>
      <div class="surah-card__info">
        <span class="surah-card__name-ar">${surah.name}</span>
        <span class="surah-card__name-en">${surah.englishName}</span>
      </div>
      <div class="surah-card__meta">
        <span class="surah-card__ayahs">${formatNum(surah.numberOfAyahs)} ${t('quran_ayahs')}</span>
        <span class="surah-card__type surah-card__type--${surah.revelationType.toLowerCase()}">${revType}</span>
      </div>
    </a>
  `;
}
