/**
 * ═══════════════════════════════════════════════
 *  دين — Azkar View Page
 *  Shows individual azkar within a category
 *  with interactive tap-to-count functionality
 * ═══════════════════════════════════════════════
 */

import { t } from '../i18n/index.js';
import { getAzkarByCategory } from '../api/azkar.js';
import { renderZikrCard, initZikrCounters } from '../components/zikr-card.js';

// ─── Main Render ────────────────────────────────
export function render(container, categoryId) {
  const category = getAzkarByCategory(categoryId);

  // Guard: invalid / missing category
  if (!category) {
    container.innerHTML = `
      <div class="page fade-in">
        <div class="error-state">
          <p>${t('error')}</p>
          <a href="#/azkar" class="btn btn--primary">${t('back')}</a>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page page--azkar-view fade-in">
      <div class="page-header">
        <a href="#/azkar" class="back-btn">← ${t('back')}</a>
        <h2 class="page-title">${category.icon} ${category.name}</h2>
      </div>

      <div class="zikr-list">
        ${category.azkar.map((z, i) => renderZikrCard(z, i)).join('')}
      </div>
    </div>
  `;

  // Defer counter initialization until DOM has painted
  setTimeout(() => initZikrCounters(), 50);
}
