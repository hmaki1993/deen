/**
 * دين — Prayer Times Page
 * Full daily schedule with cached instant load, localized Hijri date,
 * manual location refresh button, and Qibla link.
 */

import { t, getLang } from '../i18n/index.js';
import {
  getPrayerTimes,
  getPrayerTimesByCity,
  getNextPrayer,
  getUserLocation,
  getLastKnownLocation,
  syncPrayerNotificationsIfEnabled,
} from '../api/prayer.js';
import {
  getPrayerNotificationsEnabled,
  setPrayerNotificationsEnabled,
} from '../utils/storage.js';
import { renderPrayerCard } from '../components/prayer-card.js';
import { formatNum } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';

const PRAYER_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
let isMounted = false;

export async function render(container) {
  cleanup();
  isMounted = true;

  container.innerHTML = `
    <div class="page page--prayer fade-in">
      <div class="page-header page-header--spread">
        <h2 class="page-title">${t('prayer_title')}</h2>
        <button id="btn-refresh-location" class="header-action-pill" aria-label="${t('prayer_detect')}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${t('prayer_detect')}</span>
        </button>
      </div>

      <div id="prayer-hijri" class="prayer-hijri glass-card"></div>

      <div id="prayer-list" class="prayer-list">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>${t('loading')}</p>
        </div>
      </div>

      <div class="prayer-notif-card glass-card">
        <div class="prayer-notif-card__info">
          <span class="prayer-notif-card__title">🔔 ${t('prayer_notif_title')}</span>
          <span class="prayer-notif-card__desc">${t('prayer_notif_desc')}</span>
        </div>
        <label class="deen-switch" aria-label="${t('prayer_notif_title')}">
          <input type="checkbox" id="prayer-notif-toggle" ${getPrayerNotificationsEnabled() ? 'checked' : ''} />
          <span class="deen-switch__slider"></span>
        </label>
      </div>

      <div class="prayer-actions">
        <a href="#/qibla" class="btn btn--secondary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
          <span>${t('qibla_title')}</span>
        </a>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh-location')?.addEventListener('click', () => {
    loadAndRender(true);
  });

  document.getElementById('prayer-notif-toggle')?.addEventListener('change', async (e) => {
    const enabled = Boolean(e.target.checked);
    setPrayerNotificationsEnabled(enabled);
    if (enabled) {
      const granted = await syncPrayerNotificationsIfEnabled();
      if (!isMounted) return;
      if (granted === false && window.Capacitor?.isNativePlatform?.()) {
        e.target.checked = false;
        setPrayerNotificationsEnabled(false);
        showToast(t('prayer_notif_denied'), 'error', 3000);
      } else {
        showToast(t('prayer_notif_enabled'), 'success', 2200);
      }
    } else {
      await syncPrayerNotificationsIfEnabled();
      if (isMounted) showToast(t('prayer_notif_disabled'), 'info', 1800);
    }
  });

  await loadAndRender(false);
}

async function loadAndRender(forceRefresh) {
  const list = document.getElementById('prayer-list');
  if (forceRefresh && list) {
    list.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>${t('loading')}</p>
      </div>
    `;
  }

  try {
    let data;
    let locNote = '';
    let resolvedCoords = null;
    try {
      const pos = await getUserLocation(forceRefresh);
      resolvedCoords = pos;
      data = await getPrayerTimes(pos.lat, pos.lng, 5, forceRefresh);
    } catch {
      const lastKnown = !forceRefresh ? getLastKnownLocation() : null;
      if (lastKnown) {
        resolvedCoords = lastKnown;
        locNote = t('prayer_gps_loc');
        data = await getPrayerTimes(lastKnown.lat, lastKnown.lng, 5, forceRefresh);
      } else {
        locNote = t('prayer_fallback_cairo');
        data = await getPrayerTimesByCity('Cairo', 'Egypt', 5, forceRefresh);
      }
    }

    if (!isMounted) return;
    syncPrayerNotificationsIfEnabled(resolvedCoords);

    const next = getNextPrayer(data.timings);
    const lang = getLang();

    const hijriEl = document.getElementById('prayer-hijri');
    if (hijriEl && data.date?.hijri) {
      const h = data.date.hijri;
      const hijriText =
        lang === 'ar'
          ? `${formatNum(h.day)} ${h.month.ar} ${formatNum(h.year)} هـ`
          : `${h.day} ${h.month.en} ${h.year} AH`;

      const badges = [];
      if (locNote) badges.push(locNote);
      if (data.offline) badges.push(t('prayer_offline_badge'));

      hijriEl.innerHTML = `
        <div class="hijri-date">
          <span class="hijri-date__label">${t('prayer_hijri')}</span>
          <span class="hijri-date__value">${hijriText}</span>
          <span class="hijri-date__gregorian">${data.date.readable}</span>
          ${badges.length > 0 ? `<span class="hijri-date__loc">${badges.join(' • ')}</span>` : ''}
        </div>
      `;
    }

    const listEl = document.getElementById('prayer-list');
    if (listEl) {
      listEl.innerHTML = PRAYER_ORDER.map((p) =>
        renderPrayerCard(p, data.timings[p], p === next.name)
      ).join('');
    }
  } catch {
    if (!isMounted) return;
    const listEl = document.getElementById('prayer-list');
    if (listEl) {
      listEl.innerHTML = `
        <div class="error-state">
          <p>${t('error')}</p>
          <button id="prayer-retry-btn" class="btn btn--primary">${t('retry')}</button>
        </div>
      `;
      document.getElementById('prayer-retry-btn')?.addEventListener('click', () => loadAndRender(true));
    }
  }
}

export function cleanup() {
  isMounted = false;
}
