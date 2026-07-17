/**
 * ═══════════════════════════════════════════════
 *  دين — Prayer Times Page
 *  Full daily schedule with hijri date,
 *  highlighted next prayer, and Qibla link
 * ═══════════════════════════════════════════════
 */

import { t } from '../i18n/index.js';
import {
  getPrayerTimes,
  getPrayerTimesByCity,
  getNextPrayer,
  getUserLocation,
} from '../api/prayer.js';
import { renderPrayerCard } from '../components/prayer-card.js';
import { formatTime } from '../utils/helpers.js';

/** Canonical display order for the six daily prayers */
const PRAYER_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// ─── Main Render ────────────────────────────────
export async function render(container) {
  container.innerHTML = `
    <div class="page page--prayer fade-in">
      <h2 class="page-title">${t('prayer_title')}</h2>

      <!-- ✦ Hijri / Gregorian Date ✦ -->
      <div id="prayer-hijri" class="prayer-hijri glass-card"></div>

      <!-- ✦ Prayer Time Cards ✦ -->
      <div id="prayer-list" class="prayer-list">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>${t('loading')}</p>
        </div>
      </div>

      <!-- ✦ Quick Actions ✦ -->
      <div class="prayer-actions">
        <a href="#/qibla" class="btn btn--secondary">🧭 ${t('qibla_title')}</a>
      </div>
    </div>
  `;

  try {
    // Attempt geolocation → fallback to Cairo
    let data;
    try {
      const pos = await getUserLocation();
      data = await getPrayerTimes(pos.lat, pos.lng);
    } catch (_geoErr) {
      data = await getPrayerTimesByCity('Cairo', 'Egypt');
    }

    const next = getNextPrayer(data.timings);

    // ── Hijri date banner ──
    const hijriEl = document.getElementById('prayer-hijri');
    if (hijriEl && data.date?.hijri) {
      const h = data.date.hijri;
      hijriEl.innerHTML = `
        <div class="hijri-date">
          <span class="hijri-date__label">${t('prayer_hijri')}</span>
          <span class="hijri-date__value">${h.day} ${h.month.ar} ${h.year} هـ</span>
          <span class="hijri-date__gregorian">${data.date.readable}</span>
        </div>
      `;
    }

    // ── Prayer cards ──
    const list = document.getElementById('prayer-list');
    if (list) {
      list.innerHTML = PRAYER_ORDER.map((p) =>
        renderPrayerCard(p, data.timings[p], p === next.name)
      ).join('');
    }
  } catch (_err) {
    const list = document.getElementById('prayer-list');
    if (list) {
      list.innerHTML = `
        <div class="error-state">
          <p>${t('error')}</p>
          <button class="btn btn--primary" onclick="location.reload()">${t('retry')}</button>
        </div>
      `;
    }
  }
}
