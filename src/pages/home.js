/**
 * ═══════════════════════════════════════════════
 *  دين — Home Page
 *  Main dashboard with prayer countdown,
 *  last-read bookmark, and quick-access cards
 * ═══════════════════════════════════════════════
 */

import { t, getLang } from '../i18n/index.js';
import { getPrayerTimes, getNextPrayer, getUserLocation } from '../api/prayer.js';
import { formatCountdown, pad, formatTime, getTimeDiff, formatNum } from '../utils/helpers.js';
import { getLastRead, getBookmarks, removeBookmark } from '../utils/storage.js';

/** Holds the live countdown interval so we can tear it down on navigation */
let countdownInterval = null;

// ─── Main Render ────────────────────────────────
export function render(container) {
  // Clear any existing interval from a previous visit
  if (countdownInterval) clearInterval(countdownInterval);

  container.innerHTML = `
    <div class="page page--home fade-in">
      <!-- Ambient background glow elements for spatial depth -->
      <div class="ambient-glow ambient-glow--1"></div>
      <div class="ambient-glow ambient-glow--2"></div>

      <!-- ✦ Next Prayer Widget ✦ -->
      <div class="prayer-widget-wrapper">
        <div class="home-prayer-widget glass-card">
          <div class="prayer-widget__label">${t('home_next_prayer')}</div>
          <div class="prayer-widget__name" id="next-prayer-name">--</div>
          <div class="prayer-widget__time" id="next-prayer-time">--:--</div>
          <div class="prayer-widget__countdown">
            <span class="countdown-label">${t('home_time_remaining')}</span>
            <div class="countdown-timer" id="countdown-timer">
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

      <!-- ✦ Last Read Bookmark (conditional) ✦ -->
      ${renderLastRead()}
    </div>
  `;

  // Kick off async prayer data fetch
  loadPrayerData();
  // Initialize delete events for bookmarks
  initBookmarkDeleteEvents(container);
}

// ─── Last-Read Bookmark Card ────────────────────
function renderLastRead() {
  const lastRead = getLastRead();
  if (!lastRead) return '';
  
  const ayahInfo = lastRead.ayahNumber 
    ? `<div class="last-read__ayah">${t('quran_ayahs')} ${formatNum(lastRead.ayahNumber)}</div>
       ${lastRead.ayahText ? `<div class="last-read__snippet" style="font-size:0.8rem;opacity:0.7;margin-top:4px;">${lastRead.ayahText}</div>` : ''}` 
    : '';
  
  const ayahPath = lastRead.ayahNumber ? `/${lastRead.ayahNumber}` : '';
    
  return `
    <a href="#/quran/${lastRead.surahNumber}${ayahPath}" class="last-read-card glass-card">
      <span class="last-read__icon">📑</span>
      <div class="last-read__info">
        <span class="last-read__label">${t('quran_last_read')}</span>
        <span class="last-read__surah">${lastRead.surahName}</span>
        ${ayahInfo}
      </div>
      <span class="last-read__action">${t('quran_continue')} →</span>
    </a>
  `;
}

// ─── Bookmarks List Section ──────────────────────
function renderBookmarksList() {
  const bookmarks = getBookmarks();
  if (!bookmarks || bookmarks.length === 0) return '';
  
  return `
    <div class="bookmarks-section">
      <h2 class="section-title">${t('quran_bookmarks')}</h2>
      <div class="bookmarks-grid">
        ${bookmarks.map((b) => `
          <div class="bookmark-card glass-card" id="bookmark-item-${b.surahNumber}-${b.ayahNumber}">
            <a href="#/quran/${b.surahNumber}/${b.ayahNumber}" class="bookmark-card__link">
              <span class="bookmark-card__icon">🔖</span>
              <div class="bookmark-card__info">
                <span class="bookmark-card__surah">${b.surahName}</span>
                <span class="bookmark-card__ayah">${t('quran_ayahs')} ${formatNum(b.ayahNumber)}</span>
                ${b.ayahText ? `<p class="bookmark-card__snippet">${b.ayahText}</p>` : ''}
              </div>
            </a>
            <button class="bookmark-card__delete" data-surah="${b.surahNumber}" data-ayah="${b.ayahNumber}" aria-label="Delete Bookmark">
              🗑️
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Initialize Bookmark Delete Events ──────────
function initBookmarkDeleteEvents(container) {
  container.querySelectorAll('.bookmark-card__delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const surahNum = parseInt(btn.dataset.surah);
      const ayahNum = parseInt(btn.dataset.ayah);
      
      removeBookmark(surahNum, ayahNum);
      
      const card = document.getElementById(`bookmark-item-${surahNum}-${ayahNum}`);
      if (card) {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => {
          card.remove();
          const bookmarks = getBookmarks();
          if (bookmarks.length === 0) {
            const section = container.querySelector('.bookmarks-section');
            if (section) section.remove();
          }
        }, 300);
      }
    });
  });
}

// ─── Prayer Data Loader ─────────────────────────
async function loadPrayerData() {
  /** Map API prayer names → i18n keys */
  const prayerKeys = {
    Fajr:    'prayer_fajr',
    Dhuhr:   'prayer_dhuhr',
    Asr:     'prayer_asr',
    Maghrib: 'prayer_maghrib',
    Isha:    'prayer_isha',
  };

  try {
    // Attempt geolocation-based times first
    const pos  = await getUserLocation();
    const data = await getPrayerTimes(pos.lat, pos.lng);
    const next = getNextPrayer(data.timings);

    applyPrayerUI(next, prayerKeys);
  } catch (_primaryErr) {
    // Fallback: Cairo, Egypt (Egyptian General Authority method)
    try {
      const res  = await fetch('https://api.aladhan.com/v1/timingsByCity?city=Cairo&country=Egypt&method=5');
      const data = await res.json();

      if (data.code === 200) {
        const next = getNextPrayer(data.data.timings);
        applyPrayerUI(next, prayerKeys);
      }
    } catch (_fallbackErr) {
      // Silently degrade — widget stays at "--"
    }
  }
}

/** Populate the prayer widget and start the live countdown */
function applyPrayerUI(next, prayerKeys) {
  const nameEl = document.getElementById('next-prayer-name');
  const timeEl = document.getElementById('next-prayer-time');

  if (nameEl) nameEl.textContent = t(prayerKeys[next.name] || next.name);
  if (timeEl) timeEl.textContent = formatTime(next.time);

  startCountdown(next.time);
}

// ─── Live Countdown ─────────────────────────────
function startCountdown(timeStr) {
  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    const diff = getTimeDiff(timeStr);
    const { hours, minutes, seconds } = formatCountdown(diff);

    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-minutes');
    const sEl = document.getElementById('cd-seconds');

    if (hEl) hEl.textContent = pad(hours);
    if (mEl) mEl.textContent = pad(minutes);
    if (sEl) sEl.textContent = pad(seconds);
  }

  tick();                                   // immediate first render
  countdownInterval = setInterval(tick, 1000);
}

// ─── Cleanup (called on page exit) ─────────────
export function cleanup() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
