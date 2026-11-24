/**
 * دين — Home Page
 * Dashboard with live prayer countdown (auto-rollover), quick access grid,
 * last-read bookmark, and saved bookmarks list.
 */

import { t, getLang } from '../i18n/index.js';
import {
  getPrayerTimes,
  getPrayerTimesByCity,
  getNextPrayer,
  getUserLocation,
} from '../api/prayer.js';
import { formatCountdown, pad, formatTime, getTimeDiff, formatNum } from '../utils/helpers.js';
import { getLastRead, getBookmarks, removeBookmark } from '../utils/storage.js';

let countdownInterval = null;
let isMounted = false;
let activeTimings = null;

const PRAYER_KEYS = {
  Fajr: 'prayer_fajr',
  Dhuhr: 'prayer_dhuhr',
  Asr: 'prayer_asr',
  Maghrib: 'prayer_maghrib',
  Isha: 'prayer_isha',
};

export function render(container) {
  cleanup();
  isMounted = true;

  container.innerHTML = `
    <div class="page page--home fade-in">
      <!-- ✦ Next Prayer Widget ✦ -->
      <div class="prayer-widget-wrapper">
        <div class="home-prayer-widget glass-card">
          <div class="prayer-widget__label">${t('home_next_prayer')}</div>
          <div class="prayer-widget__name" id="next-prayer-name">--</div>
          <div class="prayer-widget__time" id="next-prayer-time">--:--</div>
          <div class="prayer-widget__countdown">
            <span class="countdown-label">${t('home_time_remaining')}</span>
            <div class="countdown-timer" id="countdown-timer" dir="ltr">
              <div class="countdown-unit">
                <span id="cd-hours">00</span>
                <small>${t('hours')}</small>
              </div>
              <div class="countdown-sep">:</div>
              <div class="countdown-unit">
                <span id="cd-minutes">00</span>
                <small>${t('minutes')}</small>
              </div>
              <div class="countdown-sep">:</div>
              <div class="countdown-unit">
                <span id="cd-seconds">00</span>
                <small>${t('seconds')}</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ✦ Quick Access Grid ✦ -->
      <section class="home-section">
        <h2 class="section-title">${t('home_quick_access')}</h2>
        <div class="quick-access-grid">
          <a href="#/quran" class="quick-card">
            <div class="quick-card__icon-wrapper">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/></svg>
            </div>
            <span class="quick-card__title">${t('nav_quran')}</span>
          </a>
          <a href="#/azkar" class="quick-card">
            <div class="quick-card__icon-wrapper">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="1.4" fill="currentColor"/><circle cx="18.9" cy="8" r="1.4" fill="currentColor"/><circle cx="18.9" cy="16" r="1.4" fill="currentColor"/><circle cx="12" cy="20" r="1.4" fill="currentColor"/><circle cx="5.1" cy="16" r="1.4" fill="currentColor"/><circle cx="5.1" cy="8" r="1.4" fill="currentColor"/></svg>
            </div>
            <span class="quick-card__title">${t('nav_azkar')}</span>
          </a>
          <a href="#/prayer" class="quick-card">
            <div class="quick-card__icon-wrapper">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
            </div>
            <span class="quick-card__title">${t('nav_prayer')}</span>
          </a>
          <a href="#/qibla" class="quick-card">
            <div class="quick-card__icon-wrapper">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
            </div>
            <span class="quick-card__title">${t('home_qibla')}</span>
          </a>
        </div>
      </section>

      <!-- ✦ Last Read Bookmark ✦ -->
      ${renderLastRead()}

      <!-- ✦ Saved Bookmarks ✦ -->
      ${renderBookmarksList()}
    </div>
  `;

  loadPrayerData();
  initBookmarkDeleteEvents(container);
}

function renderLastRead() {
  const lastRead = getLastRead();
  if (!lastRead) return '';

  const ayahInfo = lastRead.ayahNumber
    ? `<div class="last-read__ayah">${t('quran_ayah_single')} ${formatNum(lastRead.ayahNumber)}</div>
       ${lastRead.ayahText ? `<div class="last-read__snippet">${lastRead.ayahText}</div>` : ''}`
    : '';

  const ayahPath = lastRead.ayahNumber ? `/${lastRead.ayahNumber}` : '';
  const arrow = getLang() === 'ar' ? '←' : '→';

  return `
    <a href="#/quran/${lastRead.surahNumber}${ayahPath}" class="last-read-card glass-card">
      <span class="last-read__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </span>
      <div class="last-read__info">
        <span class="last-read__label">${t('quran_last_read')}</span>
        <span class="last-read__surah">${lastRead.surahName}</span>
        ${ayahInfo}
      </div>
      <span class="last-read__action">${t('quran_continue')} ${arrow}</span>
    </a>
  `;
}

function renderBookmarksList() {
  const bookmarks = getBookmarks();
  if (!bookmarks || bookmarks.length === 0) return '';

  return `
    <section class="bookmarks-section">
      <h2 class="section-title">${t('quran_bookmarks')}</h2>
      <div class="bookmarks-grid">
        ${bookmarks
          .map(
            (b) => `
          <div class="bookmark-card glass-card" id="bookmark-item-${b.surahNumber}-${b.ayahNumber}">
            <a href="#/quran/${b.surahNumber}/${b.ayahNumber}" class="bookmark-card__link">
              <span class="bookmark-card__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-4-8 4V4a2 2 0 0 1 2-2z"/></svg>
              </span>
              <div class="bookmark-card__info">
                <span class="bookmark-card__surah">${b.surahName}</span>
                <span class="bookmark-card__ayah">${t('quran_ayah_single')} ${formatNum(b.ayahNumber)}</span>
                ${b.ayahText ? `<p class="bookmark-card__snippet">${b.ayahText}</p>` : ''}
              </div>
            </a>
            <button class="bookmark-card__delete" data-surah="${b.surahNumber}" data-ayah="${b.ayahNumber}" aria-label="Delete Bookmark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    </section>
  `;
}

function initBookmarkDeleteEvents(container) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.bookmark-card__delete');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const surahNum = parseInt(btn.dataset.surah, 10);
    const ayahNum = parseInt(btn.dataset.ayah, 10);
    removeBookmark(surahNum, ayahNum);

    const card = document.getElementById(`bookmark-item-${surahNum}-${ayahNum}`);
    if (card) {
      card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        card.remove();
        if (getBookmarks().length === 0) {
          container.querySelector('.bookmarks-section')?.remove();
        }
      }, 250);
    }
  });
}

async function loadPrayerData() {
  try {
    let data;
    try {
      const pos = await getUserLocation();
      data = await getPrayerTimes(pos.lat, pos.lng);
    } catch {
      data = await getPrayerTimesByCity('Cairo', 'Egypt');
    }

    if (!isMounted || !data?.timings) return;

    activeTimings = data.timings;
    applyCurrentNextPrayer();
  } catch {
    // Gracefully stay at placeholder if completely offline and uncached
  }
}

function applyCurrentNextPrayer() {
  if (!isMounted || !activeTimings) return;
  const next = getNextPrayer(activeTimings);

  const nameEl = document.getElementById('next-prayer-name');
  const timeEl = document.getElementById('next-prayer-time');

  if (nameEl) nameEl.textContent = t(PRAYER_KEYS[next.name] || next.name);
  if (timeEl) timeEl.textContent = formatTime(next.time);

  startCountdown(next.time);
}

function startCountdown(timeStr) {
  if (countdownInterval) clearInterval(countdownInterval);
  if (!isMounted || !timeStr || timeStr === '--:--') return;

  let prevDiff = getTimeDiff(timeStr);

  function tick() {
    if (!isMounted) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      return;
    }

    const diff = getTimeDiff(timeStr);
    // Detect rollover past prayer time (diff jumps up to ~24h or drops to <= 1s)
    if (diff <= 1000 || diff > prevDiff + 60000) {
      applyCurrentNextPrayer();
      return;
    }
    prevDiff = diff;

    const { hours, minutes, seconds } = formatCountdown(diff);
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-minutes');
    const sEl = document.getElementById('cd-seconds');

    if (hEl) hEl.textContent = pad(hours);
    if (mEl) mEl.textContent = pad(minutes);
    if (sEl) sEl.textContent = pad(seconds);
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

export function cleanup() {
  isMounted = false;
  activeTimings = null;
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
