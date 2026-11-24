/**
 * Deen App — Audio Player & Settings Drawer Component
 * Fully localized (AR/EN), O(1) active-ayah highlighting, and working Play Full Surah reset.
 */

import { audioPlayer } from '../api/audio.js';
import { formatNum } from '../utils/helpers.js';
import { t, getLang } from '../i18n/index.js';

let lastHighlightedAyahEl = null;

export function renderAudioPlayer() {
  const dir = getLang() === 'ar' ? 'rtl' : 'ltr';
  return `
    <!-- Settings Drawer Card -->
    <div id="audio-settings-card" class="audio-settings-card hidden" dir="${dir}">
      <div class="settings-card-header">
        <h3>${t('audio_settings_title')}</h3>
        <button id="close-settings-card" class="card-close-btn" aria-label="${t('cancel')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div class="settings-card-body">
        <div class="settings-row">
          <label for="audio-speed">${t('audio_speed')}</label>
          <div class="select-wrapper">
            <select id="audio-speed">
              <option value="0.75">${t('audio_speed_slow')}</option>
              <option value="1" selected>${t('audio_speed_normal')}</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">${t('audio_speed_fast')}</option>
            </select>
          </div>
        </div>

        <div class="settings-row">
          <label for="audio-repeat">${t('audio_repeat')}</label>
          <div class="select-wrapper">
            <select id="audio-repeat">
              <option value="1" selected>${t('audio_repeat_1')}</option>
              <option value="2">${t('audio_repeat_2')}</option>
              <option value="3">${t('audio_repeat_3')}</option>
              <option value="5">${t('audio_repeat_5')}</option>
              <option value="10">${t('audio_repeat_10')}</option>
              <option value="999">${t('audio_repeat_inf')}</option>
            </select>
          </div>
        </div>

        <div class="settings-row range-row">
          <label>${t('audio_range')}</label>
          <div class="range-inputs">
            <div class="select-wrapper range-select">
              <select id="audio-range-start"></select>
            </div>
            <span class="range-sep">${t('audio_to')}</span>
            <div class="select-wrapper range-select">
              <select id="audio-range-end"></select>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-card-footer">
        <button id="btn-play-all" class="btn-all">${t('audio_play_all')}</button>
        <button id="btn-apply-settings" class="btn-apply">${t('audio_apply')}</button>
      </div>
    </div>

    <!-- Main Audio Player Capsule -->
    <div id="quran-audio-player" class="audio-player hidden" dir="${dir}">
      <div class="audio-player__info">
        <span id="ap-ayah-number" class="ap-ayah-number"></span>
      </div>
      <div class="audio-player__controls">
        <button id="ap-prev" class="ap-btn" aria-label="Previous">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4"></polygon><rect x="5" y="4" width="2" height="16"></rect></svg>
        </button>
        <button id="ap-play-pause" class="ap-btn ap-btn--main" aria-label="Play/Pause">
          <svg id="ap-play-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"></polygon></svg>
        </button>
        <button id="ap-stop" class="ap-btn" aria-label="Stop">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
        </button>
        <button id="ap-next" class="ap-btn" aria-label="Next">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20"></polygon><rect x="17" y="4" width="2" height="16"></rect></svg>
        </button>
      </div>

      <div class="audio-player__meta-actions">
        <button id="ap-settings" class="ap-settings-btn" aria-label="${t('audio_settings_title')}" title="${t('audio_settings_title')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="21" x2="4" y2="14"></line>
            <line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line>
            <line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line>
            <line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
        </button>
        <button id="ap-close" class="ap-close-btn" aria-label="${t('quran_stop')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
  `;
}

export function populateRangeSelects() {
  const startSelect = document.getElementById('audio-range-start');
  const endSelect = document.getElementById('audio-range-end');
  if (!startSelect || !endSelect) return;

  const totalAyahs = audioPlayer.surahAyahs.length;
  if (totalAyahs === 0) return;

  const fragStart = document.createDocumentFragment();
  const fragEnd = document.createDocumentFragment();

  for (let i = 1; i <= totalAyahs; i++) {
    const label = `${t('quran_ayah_single')} ${formatNum(i)}`;

    const optStart = document.createElement('option');
    optStart.value = i;
    optStart.textContent = label;
    fragStart.appendChild(optStart);

    const optEnd = document.createElement('option');
    optEnd.value = i;
    optEnd.textContent = label;
    if (i === totalAyahs) optEnd.selected = true;
    fragEnd.appendChild(optEnd);
  }

  startSelect.innerHTML = '';
  endSelect.innerHTML = '';
  startSelect.appendChild(fragStart);
  endSelect.appendChild(fragEnd);

  if (audioPlayer.startAyahNum) startSelect.value = audioPlayer.startAyahNum;
  if (audioPlayer.endAyahNum) endSelect.value = audioPlayer.endAyahNum;

  const speedSelect = document.getElementById('audio-speed');
  if (speedSelect) speedSelect.value = String(audioPlayer.playbackRate);
  const repeatSelect = document.getElementById('audio-repeat');
  if (repeatSelect) repeatSelect.value = String(audioPlayer.ayahRepeatCount);
}

export function initAudioPlayerEvents() {
  lastHighlightedAyahEl = null;

  document.getElementById('ap-play-pause')?.addEventListener('click', () => audioPlayer.togglePlay());
  document.getElementById('ap-stop')?.addEventListener('click', () => audioPlayer.stop());
  document.getElementById('ap-next')?.addEventListener('click', () => audioPlayer.playNext());
  document.getElementById('ap-prev')?.addEventListener('click', () => audioPlayer.playPrevious());

  document.getElementById('ap-close')?.addEventListener('click', () => {
    audioPlayer.stop();
    document.getElementById('audio-settings-card')?.classList.add('hidden');
  });

  document.getElementById('ap-settings')?.addEventListener('click', () => {
    const card = document.getElementById('audio-settings-card');
    if (card) {
      card.classList.toggle('hidden');
      if (!card.classList.contains('hidden')) {
        populateRangeSelects();
      }
    }
  });

  document.getElementById('close-settings-card')?.addEventListener('click', () => {
    document.getElementById('audio-settings-card')?.classList.add('hidden');
  });

  document.getElementById('audio-range-start')?.addEventListener('change', (e) => {
    const startVal = parseInt(e.target.value, 10);
    const endSelect = document.getElementById('audio-range-end');
    if (endSelect && parseInt(endSelect.value, 10) < startVal) {
      endSelect.value = startVal;
    }
  });

  document.getElementById('audio-range-end')?.addEventListener('change', (e) => {
    const endVal = parseInt(e.target.value, 10);
    const startSelect = document.getElementById('audio-range-start');
    if (startSelect && parseInt(startSelect.value, 10) > endVal) {
      startSelect.value = endVal;
    }
  });

  document.getElementById('btn-apply-settings')?.addEventListener('click', () => {
    const speed = document.getElementById('audio-speed')?.value;
    const repeat = document.getElementById('audio-repeat')?.value;
    const rangeStart = document.getElementById('audio-range-start')?.value;
    const rangeEnd = document.getElementById('audio-range-end')?.value;

    audioPlayer.updateSettings({ speed, repeat, rangeStart, rangeEnd });
    document.getElementById('audio-settings-card')?.classList.add('hidden');

    // If current ayah is outside chosen range, jump to rangeStart immediately
    if (rangeStart && audioPlayer.surahAyahs.length > 0) {
      const startNum = parseInt(rangeStart, 10);
      const endNum = rangeEnd ? parseInt(rangeEnd, 10) : audioPlayer.surahAyahs.length;
      const curNum = audioPlayer.currentAyah?.numberInSurah;
      if (!curNum || curNum < startNum || curNum > endNum) {
        audioPlayer.playFullSurah(audioPlayer.surahNumber);
      }
    }
  });

  document.getElementById('btn-play-all')?.addEventListener('click', () => {
    const startSelect = document.getElementById('audio-range-start');
    const endSelect = document.getElementById('audio-range-end');
    const speedSelect = document.getElementById('audio-speed');
    const repeatSelect = document.getElementById('audio-repeat');

    if (startSelect) startSelect.value = 1;
    if (endSelect) endSelect.value = audioPlayer.surahAyahs.length;
    if (speedSelect) speedSelect.value = '1';
    if (repeatSelect) repeatSelect.value = '1';

    audioPlayer.resetRange();
    document.getElementById('audio-settings-card')?.classList.add('hidden');
    // Actually play full surah from ayah 1!
    audioPlayer.playFullSurah(audioPlayer.surahNumber);
  });
}

export function updateAudioPlayerUI(state) {
  const playerEl = document.getElementById('quran-audio-player');
  const playPauseBtn = document.getElementById('ap-play-pause');
  const ayahNumEl = document.getElementById('ap-ayah-number');
  const prevBtn = document.getElementById('ap-prev');
  const nextBtn = document.getElementById('ap-next');

  if (!playerEl) return;

  if (state.isSurahMode) {
    playerEl.classList.remove('hidden');
    if (ayahNumEl) ayahNumEl.textContent = t('audio_full_surah');
    if (prevBtn) prevBtn.style.opacity = '0.3';
    if (nextBtn) nextBtn.style.opacity = '0.3';
  } else if (state.currentAyah) {
    playerEl.classList.remove('hidden');

    if (ayahNumEl) {
      if (audioPlayer.startAyahNum || audioPlayer.endAyahNum) {
        const start = audioPlayer.startAyahNum || 1;
        const end = audioPlayer.endAyahNum || audioPlayer.surahAyahs.length;
        ayahNumEl.textContent = `${t('quran_ayah_single')} ${formatNum(state.currentAyah.numberInSurah)} (${formatNum(start)}-${formatNum(end)})`;
      } else {
        ayahNumEl.textContent = `${t('quran_ayah_single')} ${formatNum(state.currentAyah.numberInSurah)}`;
      }
    }

    if (prevBtn) prevBtn.style.opacity = '1';
    if (nextBtn) nextBtn.style.opacity = '1';
  } else {
    playerEl.classList.add('hidden');
    document.getElementById('audio-settings-card')?.classList.add('hidden');
  }

  if (playPauseBtn) {
    if (state.isPlaying) {
      playPauseBtn.innerHTML = `<svg id="ap-pause-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    } else {
      playPauseBtn.innerHTML = `<svg id="ap-play-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"></polygon></svg>`;
    }
  }

  // O(1) active ayah highlight update (no full-DOM querySelectorAll scan!)
  if (lastHighlightedAyahEl) {
    lastHighlightedAyahEl.classList.remove('ayah-playing');
    lastHighlightedAyahEl = null;
  }

  if (!state.isSurahMode && state.currentAyah) {
    const scopedId = state.surahNumber
      ? `ayah-${state.surahNumber}-${state.currentAyah.numberInSurah}`
      : null;
    const localId = `ayah-${state.currentAyah.numberInSurah}`;
    const activeAyahEl = (scopedId && document.getElementById(scopedId)) || document.getElementById(localId);

    if (activeAyahEl) {
      activeAyahEl.classList.add('ayah-playing');
      lastHighlightedAyahEl = activeAyahEl;
      activeAyahEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (state.currentAyah.page) {
      const pageWrapper = document.getElementById(`page-wrapper-${state.currentAyah.page}`);
      if (pageWrapper) {
        pageWrapper.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        const targetId = scopedId || localId;
        setTimeout(() => {
          const loadedEl = document.getElementById(targetId);
          if (loadedEl) {
            if (lastHighlightedAyahEl) lastHighlightedAyahEl.classList.remove('ayah-playing');
            loadedEl.classList.add('ayah-playing');
            lastHighlightedAyahEl = loadedEl;
            loadedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 450);
      }
    }
  }
}
