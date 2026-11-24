/**
 * دين — Quran List Page
 * Displays all 114 surahs with debounced, diacritic-insensitive Arabic & English search.
 */

import { t } from '../i18n/index.js';
import { getSurahList, searchSurahs } from '../api/quran.js';
import { renderSurahCard } from '../components/surah-card.js';

let allSurahs = [];
let isMounted = false;
let searchDebounceTimer = null;

export async function render(container) {
  cleanup();
  isMounted = true;

  container.innerHTML = `
    <div class="page page--quran-list fade-in">
      <h2 class="page-title">${t('quran_title')}</h2>

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
}
