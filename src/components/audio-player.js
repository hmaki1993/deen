import { audioPlayer } from '../api/audio.js';
import { formatNum } from '../utils/helpers.js';

export function renderAudioPlayer() {
  return `
    <!-- Settings Drawer Card -->
    <div id="audio-settings-card" class="audio-settings-card hidden" dir="rtl">
      <div class="settings-card-header">
        <h3>خيارات التكرار والسرعة</h3>
        <button id="close-settings-card" class="card-close-btn" aria-label="Close Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <div class="settings-card-body">
        <!-- Speed Control -->
        <div class="settings-row">
          <label for="audio-speed">سرعة التلاوة:</label>
          <div class="select-wrapper">
            <select id="audio-speed">
              <option value="0.75">0.75x (بطيء)</option>
              <option value="1" selected>1.0x (طبيعي)</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x (سريع)</option>
            </select>
          </div>
        </div>
        
        <!-- Repeat Count -->
        <div class="settings-row">
          <label for="audio-repeat">تكرار الآية الواحدة:</label>
          <div class="select-wrapper">
            <select id="audio-repeat">
              <option value="1" selected>مرة واحدة (بلا تكرار)</option>
              <option value="2">مرتين (2x)</option>
              <option value="3">3 مرات</option>
              <option value="5">5 مرات</option>
              <option value="10">10 مرات</option>
              <option value="999">تكرار مستمر</option>
            </select>
          </div>
        </div>
        
        <!-- Range Selection -->
        <div class="settings-row range-row">
          <label>نطاق التلاوة (من آية إلى آية):</label>
          <div class="range-inputs">
            <div class="select-wrapper range-select">
              <select id="audio-range-start"></select>
            </div>
            <span class="range-sep">إلى</span>
            <div class="select-wrapper range-select">
              <select id="audio-range-end"></select>
            </div>
          </div>
        </div>
      </div>
      
      <div class="settings-card-footer">
        <button id="btn-play-all" class="btn-all">تشغيل السورة كاملة</button>
        <button id="btn-apply-settings" class="btn-apply">تطبيق الخيارات</button>
      </div>
    </div>

    <!-- Main Audio Player Capsule -->
    <div id="quran-audio-player" class="audio-player hidden">
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
      
      <div class="audio-player__meta-actions" style="display: flex; gap: 8px; align-items: center;">
        <button id="ap-settings" class="ap-settings-btn" aria-label="Audio Settings" title="خيارات التكرار والسرعة">
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
        <button id="ap-close" class="ap-close-btn" aria-label="Close Player">
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
  
  // Re-build options
  startSelect.innerHTML = '';
  endSelect.innerHTML = '';
  
  for (let i = 1; i <= totalAyahs; i++) {
    const text = `الآية ${formatNum(i)}`;
    
    const optStart = document.createElement('option');
    optStart.value = i;
    optStart.textContent = text;
    startSelect.appendChild(optStart);
    
    const optEnd = document.createElement('option');
    optEnd.value = i;
    optEnd.textContent = text;
    if (i === totalAyahs) optEnd.selected = true;
    endSelect.appendChild(optEnd);
  }
  
  // Restore currently saved range selections
  if (audioPlayer.startAyahNum) {
    startSelect.value = audioPlayer.startAyahNum;
  }
  if (audioPlayer.endAyahNum) {
    endSelect.value = audioPlayer.endAyahNum;
  }
  
  // Sync speed and repeat select states
  const speedSelect = document.getElementById('audio-speed');
  if (speedSelect) {
    speedSelect.value = String(audioPlayer.playbackRate);
  }
  const repeatSelect = document.getElementById('audio-repeat');
  if (repeatSelect) {
    repeatSelect.value = String(audioPlayer.ayahRepeatCount);
  }
}

export function initAudioPlayerEvents() {
  document.getElementById('ap-play-pause')?.addEventListener('click', () => {
    audioPlayer.togglePlay();
  });
  
  document.getElementById('ap-stop')?.addEventListener('click', () => {
    audioPlayer.stop();
  });
  
  document.getElementById('ap-next')?.addEventListener('click', () => {
    audioPlayer.playNext();
  });
  
  document.getElementById('ap-prev')?.addEventListener('click', () => {
    audioPlayer.playPrevious();
  });

  document.getElementById('ap-close')?.addEventListener('click', () => {
    audioPlayer.stop();
    document.getElementById('audio-settings-card')?.classList.add('hidden');
  });

  // Toggle settings drawer
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

  // Ensure start range <= end range
  document.getElementById('audio-range-start')?.addEventListener('change', (e) => {
    const startVal = parseInt(e.target.value);
    const endSelect = document.getElementById('audio-range-end');
    if (endSelect && parseInt(endSelect.value) < startVal) {
      endSelect.value = startVal;
    }
  });

  document.getElementById('audio-range-end')?.addEventListener('change', (e) => {
    const endVal = parseInt(e.target.value);
    const startSelect = document.getElementById('audio-range-start');
    if (startSelect && parseInt(startSelect.value) > endVal) {
      startSelect.value = endVal;
    }
  });

  // Apply button
  document.getElementById('btn-apply-settings')?.addEventListener('click', () => {
    const speed = document.getElementById('audio-speed')?.value;
    const repeat = document.getElementById('audio-repeat')?.value;
    const rangeStart = document.getElementById('audio-range-start')?.value;
    const rangeEnd = document.getElementById('audio-range-end')?.value;

    audioPlayer.updateSettings({ speed, repeat, rangeStart, rangeEnd });
    document.getElementById('audio-settings-card')?.classList.add('hidden');
  });

  // Play All reset button
  document.getElementById('btn-play-all')?.addEventListener('click', () => {
    const startSelect = document.getElementById('audio-range-start');
    const endSelect = document.getElementById('audio-range-end');
    const speedSelect = document.getElementById('audio-speed');
    const repeatSelect = document.getElementById('audio-repeat');

    if (startSelect) startSelect.value = 1;
    if (endSelect) endSelect.value = audioPlayer.surahAyahs.length;
    if (speedSelect) speedSelect.value = 1.0;
    if (repeatSelect) repeatSelect.value = 1;

    audioPlayer.resetRange();
    audioPlayer.playbackRate = 1.0;
    audioPlayer.ayahRepeatCount = 1;

    document.getElementById('audio-settings-card')?.classList.add('hidden');
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
    ayahNumEl.textContent = `السورة كاملة`;
    if (prevBtn) prevBtn.style.opacity = '0.3';
    if (nextBtn) nextBtn.style.opacity = '0.3';
  } else if (state.currentAyah) {
    playerEl.classList.remove('hidden');
    
    // Check if range is active to show range text in status
    if (audioPlayer.startAyahNum || audioPlayer.endAyahNum) {
      const start = audioPlayer.startAyahNum || 1;
      const end = audioPlayer.endAyahNum || audioPlayer.surahAyahs.length;
      ayahNumEl.textContent = `الآية ${formatNum(state.currentAyah.numberInSurah)} (نطاق ${formatNum(start)}-${formatNum(end)})`;
    } else {
      ayahNumEl.textContent = `الآية ${formatNum(state.currentAyah.numberInSurah)}`;
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
  
  // Highlight active ayah in the DOM
  document.querySelectorAll('.ayah-wrapper, .mushaf-ayah').forEach(el => el.classList.remove('ayah-playing'));
  if (!state.isSurahMode && state.currentAyah) {
    // Use surah-scoped ID to avoid duplicate IDs across surahs in mushaf view
    const ayahId = state.surahNumber 
      ? `ayah-${state.surahNumber}-${state.currentAyah.numberInSurah}`
      : `ayah-${state.currentAyah.numberInSurah}`;
    const activeAyahEl = document.getElementById(ayahId);
    if (activeAyahEl) {
      activeAyahEl.classList.add('ayah-playing');
      activeAyahEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (state.currentAyah.page) {
      const pageWrapper = document.getElementById(`page-wrapper-${state.currentAyah.page}`);
      if (pageWrapper) {
        pageWrapper.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        // Retry highlighting after a short delay to allow IntersectionObserver to load the page
        setTimeout(() => {
          const loadedEl = document.getElementById(ayahId);
          if (loadedEl) {
            loadedEl.classList.add('ayah-playing');
            loadedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
      }
    }
  }
}
