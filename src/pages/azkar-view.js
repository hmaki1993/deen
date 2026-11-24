/**
 * دين — Azkar View Page
 * Displays azkar with daily progress persistence, RTL-correct back button, and reset-all button.
 */

import { t } from '../i18n/index.js';
import { getAzkarByCategory } from '../api/azkar.js';
import { renderZikrCard, initZikrCounters } from '../components/zikr-card.js';
import { getAzkarProgress, resetAzkarProgress } from '../utils/storage.js';
import { showToast } from '../utils/toast.js';

export function render(container, categoryId) {
  const category = getAzkarByCategory(categoryId);

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

  const savedProgress = getAzkarProgress(categoryId);

  container.innerHTML = `
    <div class="page page--azkar-view fade-in">
      <div class="page-header page-header--spread">
        <a href="#/azkar" class="back-btn">
          <svg class="icon-back-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          <span>${t('back')}</span>
        </a>
        <h2 class="page-title">${category.icon} ${category.name}</h2>
        <button id="azkar-reset-all" class="header-action-pill" aria-label="${t('azkar_reset')}">
          ${t('azkar_reset')}
        </button>
      </div>

      <div class="zikr-list">
        ${category.azkar.map((z, i) => renderZikrCard(z, i, savedProgress[i] || 0)).join('')}
      </div>
    </div>
  `;

  initZikrCounters(categoryId);

  document.getElementById('azkar-reset-all')?.addEventListener('click', () => {
    resetAzkarProgress(categoryId);
    showToast(t('azkar_reset_done'), 'info', 1800);
    render(container, categoryId);
  });
}
