/**
 * ════════════════════════════════════════════
 *  دين (Deen) — Prayer Time Card
 * ════════════════════════════════════════════
 *  Renders a single prayer time entry with
 *  an icon, localized name, formatted time,
 *  and a "next" badge for the upcoming prayer.
 * ════════════════════════════════════════════
 */

import { t, getLang } from '../i18n/index.js';
import { formatTime } from '../utils/helpers.js';

// ── Localization key map ───────────────────

const prayerKeyMap = {
  Fajr:    'prayer_fajr',
  Sunrise: 'prayer_sunrise',
  Dhuhr:   'prayer_dhuhr',
  Asr:     'prayer_asr',
  Maghrib: 'prayer_maghrib',
  Isha:    'prayer_isha',
};

// ── Icons per prayer ───────────────────────

const prayerIcons = {
  Fajr:    '🌅',
  Sunrise: '☀️',
  Dhuhr:   '🌤️',
  Asr:     '⛅',
  Maghrib: '🌇',
  Isha:    '🌙',
};

// ── Render ─────────────────────────────────

/**
 * Render a prayer time card
 * @param {string}  prayerName — English prayer name (key into maps above)
 * @param {string}  time       — Raw time string (HH:MM format)
 * @param {boolean} isNext     — Whether this is the next upcoming prayer
 * @returns {string} Card markup
 */
export function renderPrayerCard(prayerName, time, isNext = false) {
  const labelKey = prayerKeyMap[prayerName] || prayerName;
  const icon     = prayerIcons[prayerName] || '🕐';

  return `
    <div class="prayer-card ${isNext ? 'prayer-card--next' : ''}">
      <div class="prayer-card__icon">${icon}</div>
      <div class="prayer-card__info">
        <span class="prayer-card__name">${t(labelKey)}</span>
        ${isNext ? `<span class="prayer-card__badge">${t('prayer_next')}</span>` : ''}
      </div>
      <div class="prayer-card__time">${formatTime(time)}</div>
    </div>
  `;
}
