/**
 * ═══════════════════════════════════════════════
 *  دين — Quran List Page
 *  Displays all 114 surahs with live search
 * ═══════════════════════════════════════════════
 */

import { t } from '../i18n/index.js';
import { getSurahList, searchSurahs } from '../api/quran.js';
import { renderSurahCard } from '../components/surah-card.js';

/** Cache the full list so search can filter without re-fetching */
let allSurahs = [];

// ─── Main Render ────────────────────────────────
export async function render(container) {
  container.innerHTML = `
    <div class="page page--quran-list fade-in">
      <!-- Ambient background glow elements for spatial depth -->
      <div class="ambient-glow ambient-glow--1"></div>
      <div class="ambient-glow ambient-glow--2"></div>

      <h2 class="page-title">${t('quran_title')}</h2>

      <!-- ✦ Search Box ✦ -->
      <div class="search-box">
        <input
          type="text"
          id="surah-search"
          class="search-input"
          placeholder="${t('quran_search')}"
        />
      </div>

      <!-- ✦ Surah List Container ✦ -->
      <div class="surah-list" id="surah-list">
        <div class="shimmer-loading">
          <div class="shimmer-card"></div>
          <div class="shimmer-card"></div>
          <div class="shimmer-card"></div>
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
    renderSurahList(allSurahs);

    // Wire up live search
    const searchInput = document.getElementById('surah-search');
    searchInput?.addEventListener('input', (e) => {
      const query    = e.target.value.trim();
      const filtered = searchSurahs(allSurahs, query);
      renderSurahList(filtered);
    });
  } catch (_err) {
    document.getElementById('surah-list').innerHTML = `
      <div class="error-state">
        <p>${t('error')}</p>
        <button class="btn btn--primary" onclick="location.reload()">${t('retry')}</button>
      </div>
    `;
  }
}

// ─── Helpers ────────────────────────────────────
function renderSurahList(surahs) {
  const list = document.getElementById('surah-list');
  if (!list) return;

  if (surahs.length === 0) {
    list.innerHTML = `<p class="empty-state">${t('quran_no_results') || 'No results found'}</p>`;
    return;
  }

  list.innerHTML = surahs.map(s => renderSurahCard(s)).join('');
  list.classList.add('stagger-in');
}
