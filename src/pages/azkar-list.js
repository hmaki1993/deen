/**
 * دين — Azkar Categories Page
 */

import { t } from '../i18n/index.js';
import { getCategories } from '../api/azkar.js';
import { formatNum } from '../utils/helpers.js';

export function render(container) {
  const categories = getCategories();

  container.innerHTML = `
    <div class="page page--azkar-list fade-in">
      <h2 class="page-title">${t('azkar_title')}</h2>

      <div class="azkar-grid stagger-in">
        ${categories
          .map(
            (cat) => `
          <a href="#/azkar/${cat.id}" class="azkar-category-card glass-card">
            <span class="azkar-category__icon">${cat.icon}</span>
            <span class="azkar-category__name">${cat.name}</span>
            <span class="azkar-category__count">${formatNum(cat.count)} ${t('azkar_items')}</span>
          </a>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}
