/**
 * دين — Quran List Page
 * Displays all 114 surahs with debounced, diacritic-insensitive Arabic & English search.
 */

import { t } from '../i18n/index.js';
import { getSurahList, searchSurahs, downloadFullQuranOffline } from '../api/quran.js';
import { isFullQuranDownloaded } from '../utils/storage.js';
import { showToast } from '../utils/toast.js';
import { renderSurahCard } from '../components/surah-card.js';

let allSurahs = [];
let isMounted = false;
let searchDebounceTimer = null;
let autoWarmTimer = null;

function renderOfflineBarMarkup() {
  if (isFullQuranDownloaded()) {
    return `
      <div class="offline-quran-bar offline-quran-bar--ready" id="offline-quran-bar">
        <span>${t('quran_offline_ready')}</span>
      </div>
    `;
  }
  return `
    <div class="offline-quran-bar" id="offline-quran-bar">
      <button id="btn-download-quran" class="offline-quran-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span id="offline-quran-btn-label">${t('quran_download_offline')}</span>
      </button>
    </div>
  `;
}

export async function render(container) {
  cleanup();
  isMounted = true;

  container.innerHTML = `
    <div class="page page--quran-list fade-in">
      <div class="page-header page-header--spread">
        <h2 class="page-title">${t('quran_title')}</h2>
        ${renderOfflineBarMarkup()}
      </div>

      <div class="search-box">
        <input
          type="search"
          id="surah-search"
          class="search-input"
          placeholder="${t('quran_search')}"
          autocomplete="off"
        />
      </div>

      <div class="surah-list" id="surah-list">
        <div class="shimmer-loading">
          <div class="shimmer-card"></div>
          <div class="shimmer-card"></div>
          <div class="shimmer-card"></div>
          <div class="shimmer-card"></div>
          <div class="shimmer-card"></div>
          <div class="shimmer-card"></div>
        </div>
      </div>
    </div>
  `;

  const triggerOfflineDownload = async (silent = false) => {
    const btn = document.getElementById('btn-download-quran');
    const lbl = document.getElementById('offline-quran-btn-label');
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = t('quran_downloading_offline');

    try {
      const ok = await downloadFullQuranOffline();
      if (!isMounted) return;
      if (ok) {
        const bar = document.getElementById('offline-quran-bar');
        if (bar) bar.outerHTML = renderOfflineBarMarkup();
        if (!silent) showToast(t('quran_offline_ready'), 'success', 2500);
      } else if (!silent) {
        if (btn) btn.disabled = false;
        if (lbl) lbl.textContent = t('quran_download_offline');
        showToast(t('quran_download_failed'), 'error');
      }
    } catch {
      if (!isMounted) return;
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = t('quran_download_offline');
      if (!silent) showToast(t('quran_download_failed'), 'error');
    }
  };

  document.getElementById('btn-download-quran')?.addEventListener('click', () => {
    triggerOfflineDownload(false);
  });

  if (!isFullQuranDownloaded() && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    autoWarmTimer = setTimeout(() => {
      if (isMounted && !isFullQuranDownloaded()) {
        triggerOfflineDownload(true);
      }
    }, 2200);
  }

  try {
    allSurahs = await getSurahList();
    if (!isMounted) return;

    renderSurahList(allSurahs);

    const searchInput = document.getElementById('surah-search');
    searchInput?.addEventListener('input', (e) => {
      const query = e.target.value;
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        if (!isMounted) return;
        const filtered = searchSurahs(allSurahs, query);
        renderSurahList(filtered, false);
      }, 120);
    });
  } catch {
    if (!isMounted) return;
    const list = document.getElementById('surah-list');
    if (list) {
      list.innerHTML = `
        <div class="error-state">
          <p>${t('error')}</p>
          <button id="quran-retry-btn" class="btn btn--primary">${t('retry')}</button>
        </div>
      `;
      document.getElementById('quran-retry-btn')?.addEventListener('click', () => render(container));
    }
  }
}

function renderSurahList(surahs, animate = true) {
  const list = document.getElementById('surah-list');
  if (!list) return;

  if (surahs.length === 0) {
    list.classList.remove('stagger-in');
    list.innerHTML = `<p class="empty-state">${t('quran_no_results')}</p>`;
    return;
  }

  list.innerHTML = surahs.map((s) => renderSurahCard(s)).join('');
  list.classList.toggle('stagger-in', animate);
}

export function cleanup() {
  isMounted = false;
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  if (autoWarmTimer) {
    clearTimeout(autoWarmTimer);
    autoWarmTimer = null;
  }
}
