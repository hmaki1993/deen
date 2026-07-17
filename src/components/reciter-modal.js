import { t, getLang } from '../i18n/index.js';
import { RECITERS } from '../api/audio.js';
import { getReciter, setReciter } from '../utils/storage.js';

export function renderReciterModal() {
  const currentId = getReciter();
  const lang = getLang();
  
  return `
    <div id="reciter-modal" class="reciter-page hidden" dir="rtl">
      <div class="reciter-page-header">
        <button id="close-reciter-modal" class="icon-btn" aria-label="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h3 class="page-title">${t('quran_reciter')}</h3>
      </div>
      <div class="reciter-page-content">
        <div class="reciter-list">
          ${RECITERS.map(r => `
            <button class="reciter-option ${r.id === currentId ? 'active' : ''}" data-id="${r.id}">
              ${lang === 'ar' ? r.nameAr : r.nameEn}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

export function initReciterModalEvents(onReciterChanged) {
  const modal = document.getElementById('reciter-modal');
  const bottomNav = document.querySelector('.bottom-nav');
  
  document.getElementById('close-reciter-modal')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    if (bottomNav) bottomNav.style.display = '';
  });
  
  document.querySelectorAll('.reciter-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active from all
      document.querySelectorAll('.reciter-option').forEach(b => b.classList.remove('active'));
      // Add active to clicked
      const target = e.currentTarget;
      target.classList.add('active');
      
      // Save
      const newId = target.dataset.id;
      setReciter(newId);
      
      // Close modal
      modal.classList.add('hidden');
      if (bottomNav) bottomNav.style.display = '';
      
      if (onReciterChanged) onReciterChanged();
    });
  });
}

export function openReciterModal() {
  const modal = document.getElementById('reciter-modal');
  const bottomNav = document.querySelector('.bottom-nav');
  if (modal) {
    modal.classList.remove('hidden');
    if (bottomNav) bottomNav.style.display = 'none';
  }
}
