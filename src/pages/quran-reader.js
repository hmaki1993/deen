/**
 * دين — Quran Reader Page (Continuous Surah View)
 * - Single delegated long-press/context-menu listener (replaces 2,500+ listeners on Al-Baqarah!)
 * - Lazy word wrapping ONLY when Memorize Mode is enabled (90%+ fewer DOM nodes!)
 * - Parental Lock properly enforced on Hint / Exit / Back
 * - Shared race-free speech engine & non-blocking toasts
 */

import { t, getLang } from '../i18n/index.js';
import { getSurah } from '../api/quran.js';
import {
  saveLastRead,
  getLastRead,
  addBookmark,
  saveParentalLock,
  updateParentalLockProgress,
  verifyParentalPin,
  getParentalLock,
  clearParentalLock,
} from '../utils/storage.js';
import { formatNum } from '../utils/helpers.js';
import { audioPlayer } from '../api/audio.js';
import {
  renderAudioPlayer,
  initAudioPlayerEvents,
  updateAudioPlayerUI,
} from '../components/audio-player.js';
import {
  renderReciterModal,
  initReciterModalEvents,
  openReciterModal,
  closeReciterModal,
} from '../components/reciter-modal.js';
import {
  normalizeArabicWords,
  stripBismillah,
  matchAyahPrefix,
  compareTexts,
} from '../utils/arabic.js';
import {
  createSpeechController,
  renderMemorizeDock,
  renderPinModal,
  wrapWordsInElement,
  unwrapWordsInElement,
} from '../utils/memorize-engine.js';
import { enableWakeLock, disableWakeLock } from '../utils/wakelock.js';
import { showToast } from '../utils/toast.js';

let isMounted = false;
let currentSurah = null;
let selectedAyah = null;
let selectedWrapper = null;

let isMemorizeMode = false;
let currentMemorizeIndex = 0;
let speechController = null;
let maxMatchedCountForCurrentAyah = 0;
let maxMatchedCountAtSessionStart = 0;
let consumedFinalWordsCount = 0;
let latestFinalCount = 0;
let lastRevealTime = 0;
let lastActiveMemorizeEl = null;

let isParentalLocked = false;
let pendingPinAction = null;

export async function render(container, surahNumber, targetAyahNumber = null, autoStartMemorize = false) {
  cleanup();
  isMounted = true;

  // Non-blocking screen wake lock
  enableWakeLock();

  const dir = getLang() === 'ar' ? 'rtl' : 'ltr';

  container.innerHTML = `
    <div class="page page--quran-reader fade-in">
      <div class="mushaf-header">
        <button id="quran-back-btn" class="icon-btn" aria-label="${t('back')}">
          <svg class="icon-back-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1 class="page-title">${t('quran_title')}</h1>
        <div class="mushaf-header__actions">
          <button id="btn-switch-mushaf" class="icon-btn" aria-label="${t('nav_quran')}" title="${t('nav_quran')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="quran-reader-viewport">
        <div id="reader-content" class="reader-content">
          <div class="loading-spinner">
            <div class="spinner"></div>
            <p>${t('quran_loading')}</p>
          </div>
        </div>
      </div>
    </div>

    ${renderAudioPlayer()}
    ${renderReciterModal()}
    ${renderMemorizeDock()}
    ${renderPinModal()}

    <div id="ayah-context-menu" class="ayah-context-menu hidden" dir="${dir}">
      <div class="context-menu-backdrop" id="ctx-backdrop"></div>
      <div class="context-menu-bubble" id="ctx-bubble">
        <button id="bubble-play-btn" class="bubble-btn">
          <span class="btn-icon">▶</span>
          <span class="btn-label">${t('quran_play_short')}</span>
        </button>
        <div class="bubble-separator"></div>
        <button id="bubble-bookmark-btn" class="bubble-btn">
          <span class="btn-icon">🔖</span>
          <span class="btn-label">${t('quran_bookmark_short')}</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById('ctx-backdrop')?.addEventListener('click', hideAyahMenu);
  document.getElementById('bubble-play-btn')?.addEventListener('click', playSelectedAyah);
  document.getElementById('bubble-bookmark-btn')?.addEventListener('click', bookmarkSelectedAyah);

  document.getElementById('quran-back-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (isMemorizeMode && isParentalLocked) {
      showPinModal('back');
    } else {
      window.location.hash = '#/quran';
    }
  });

  try {
    currentSurah = await getSurah(surahNumber);
    if (!isMounted) return;

    const lastRead = getLastRead();
    const bookmarkedAyah =
      targetAyahNumber || (lastRead && lastRead.surahNumber === surahNumber ? lastRead.ayahNumber : null);

    // Auto-save Last Read when opening Surah in continuous mode
    if (!lastRead || lastRead.surahNumber !== currentSurah.number) {
      let firstText = currentSurah.ayahs[0]?.text || '';
      if (currentSurah.number !== 1 && currentSurah.number !== 9) {
        firstText = stripBismillah(firstText);
      }
      const snippet = firstText.length > 35 ? `${firstText.substring(0, 35)}...` : firstText;
      saveLastRead(currentSurah.number, currentSurah.name, 1, snippet);
    }

    const content = document.getElementById('reader-content');
    if (!content) return;

    content.innerHTML = `
      <div class="surah-header-card glass-card">
        <h2 class="surah-header__name">${currentSurah.name}</h2>
        <p class="surah-header__info">${currentSurah.englishName} - ${currentSurah.englishNameTranslation}</p>
        <p class="surah-header__meta">${formatNum(currentSurah.numberOfAyahs)} ${t('quran_ayahs')} | ${currentSurah.revelationType === 'Meccan' ? t('quran_meccan') : t('quran_medinan')}</p>
      </div>

      <div class="quran-reader-actions">
        <button id="btn-play-surah" class="btn btn--primary">
          <span class="btn-icon">▶</span>
          <span class="btn-text">${t('quran_play_surah')}</span>
        </button>
        <div class="quran-reader-actions__row">
          <button id="btn-reciter" class="btn btn--secondary">
            <span class="btn-icon">👤</span>
            <span class="btn-text">${t('quran_reciter')}</span>
          </button>
          <button id="btn-memorize" class="btn btn--secondary">
            <span class="btn-icon">🎙️</span>
            <span class="btn-text">${t('quran_memorize')}</span>
          </button>
        </div>
      </div>

      ${currentSurah.number !== 1 && currentSurah.number !== 9 ? `<div class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>` : ''}
      <div class="ayah-container" id="ayah-container">
        ${currentSurah.ayahs
          .map((ayah) => {
            let text = ayah.text;
            if (currentSurah.number !== 1 && currentSurah.number !== 9 && ayah.numberInSurah === 1) {
              text = stripBismillah(text);
            }
            return `<span class="ayah-wrapper ${ayah.numberInSurah === bookmarkedAyah ? 'ayah-bookmarked' : ''}" id="ayah-${ayah.numberInSurah}" data-ayah="${ayah.numberInSurah}"><span class="ayah-text">${text}</span> <span class="ayah-number">﴿${formatNum(ayah.numberInSurah)}﴾</span></span>`;
          })
          .join(' ')}
      </div>
    `;

    audioPlayer.init(currentSurah.ayahs, currentSurah.number, (state) => updateAudioPlayerUI(state));
    initAudioPlayerEvents();
    initReciterModalEvents(() => audioPlayer.stop());

    document.getElementById('btn-reciter')?.addEventListener('click', openReciterModal);
    document.getElementById('btn-switch-mushaf')?.addEventListener('click', () => {
      if (currentSurah) window.location.hash = `#/quran/${currentSurah.number}`;
    });
    document.getElementById('btn-play-surah')?.addEventListener('click', () => {
      if (currentSurah) audioPlayer.playFullSurah(currentSurah.number);
    });
    document.getElementById('btn-memorize')?.addEventListener('click', () => toggleMemorizeMode());

    bindPinAndMemorizeControls();
    setupDelegatedAyahEvents();

    if (bookmarkedAyah) {
      setTimeout(() => {
        if (!isMounted) return;
        document.getElementById(`ayah-${bookmarkedAyah}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }

    const savedLock = getParentalLock();
    if ((savedLock && savedLock.surahNumber === currentSurah.number) || autoStartMemorize) {
      setTimeout(() => {
        if (isMounted) toggleMemorizeMode(true);
      }, 250);
    }
  } catch {
    if (!isMounted) return;
    const content = document.getElementById('reader-content');
    if (content) {
      content.innerHTML = `
        <div class="error-state">
          <p>${t('error')}</p>
          <a href="#/quran" class="btn btn--primary">${t('back')}</a>
        </div>
      `;
    }
  }
}

function bindPinAndMemorizeControls() {
  document.getElementById('pin-cancel-btn')?.addEventListener('click', hidePinModal);
  document.getElementById('pin-confirm-btn')?.addEventListener('click', handlePinSubmit);

  const pinInputs = document.querySelectorAll('.pin-input');
  pinInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
      if (e.target.value.length > 0 && index < pinInputs.length - 1) {
        pinInputs[index + 1].focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
        pinInputs[index - 1].focus();
      } else if (e.key === 'Enter') {
        handlePinSubmit();
      }
    });
  });

  document.getElementById('memorize-lock-btn')?.addEventListener('click', () => {
    showPinModal(isParentalLocked ? 'unlock' : 'lock');
  });

  document.getElementById('memorize-mic-btn')?.addEventListener('click', () => {
    if (speechController?.isListening()) {
      stopListening(true);
    } else {
      startListening();
    }
  });

  // Enforce Parental Lock on Hint button too!
  document.getElementById('memorize-hint-btn')?.addEventListener('click', () => {
    if (!isMemorizeMode || !currentSurah) return;
    if (isParentalLocked) {
      showPinModal('hint');
      return;
    }
    if (currentMemorizeIndex < currentSurah.ayahs.length) {
      consumedFinalWordsCount = latestFinalCount;
      revealAyah(currentMemorizeIndex + 1, true);
    }
  });
}

/**
 * Single delegated listener on #ayah-container instead of 2,500+ individual listeners!
 */
function setupDelegatedAyahEvents() {
  const containerEl = document.getElementById('ayah-container');
  if (!containerEl || !currentSurah) return;

  const ayahByNum = new Map(currentSurah.ayahs.map((a) => [a.numberInSurah, a]));

  let pressTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let isMoved = false;

  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  containerEl.addEventListener('contextmenu', (e) => {
    const wrapper = e.target.closest('.ayah-wrapper');
    if (!wrapper) return;
    e.preventDefault();
    const ayah = ayahByNum.get(parseInt(wrapper.dataset.ayah, 10));
    if (ayah) showAyahMenu(e.clientX || touchStartX, e.clientY || touchStartY, ayah, wrapper);
  });

  const handleStart = (e) => {
    if (isMemorizeMode) return;
    if (e.type === 'mousedown' && e.button !== 0) return;
    const wrapper = e.target.closest('.ayah-wrapper');
    if (!wrapper) return;
    const ayah = ayahByNum.get(parseInt(wrapper.dataset.ayah, 10));
    if (!ayah) return;

    isMoved = false;
    const pt = e.touches ? e.touches[0] : e;
    touchStartX = pt.clientX;
    touchStartY = pt.clientY;

    cancelPress();
    pressTimer = setTimeout(() => {
      if (!isMoved) {
        showAyahMenu(touchStartX, touchStartY, ayah, wrapper);
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch {}
        }
      }
    }, 480);
  };

  const handleMove = (e) => {
    if (!pressTimer) return;
    const pt = e.touches ? e.touches[0] : e;
    if (Math.abs(pt.clientX - touchStartX) > 18 || Math.abs(pt.clientY - touchStartY) > 18) {
      isMoved = true;
      cancelPress();
    }
  };

  containerEl.addEventListener('touchstart', handleStart, { passive: true });
  containerEl.addEventListener('touchmove', handleMove, { passive: true });
  containerEl.addEventListener('touchend', cancelPress, { passive: true });
  containerEl.addEventListener('touchcancel', cancelPress, { passive: true });
  containerEl.addEventListener('mousedown', handleStart);
  containerEl.addEventListener('mousemove', handleMove);
  containerEl.addEventListener('mouseup', cancelPress);
  containerEl.addEventListener('mouseleave', cancelPress);
}

// ─── Memorization Mode ────────────────────────────────────────

function toggleMemorizeMode(forceOpen = false) {
  if (isMemorizeMode && !forceOpen && isParentalLocked) {
    showPinModal('exit');
    return;
  }

  isMemorizeMode = forceOpen ? true : !isMemorizeMode;
  const btn = document.getElementById('btn-memorize');
  const containerEl = document.getElementById('ayah-container');
  const dock = document.getElementById('quran-memorize-dock');
  const player = document.getElementById('quran-audio-player');
  const btnPlay = document.getElementById('btn-play-surah');
  const btnReciter = document.getElementById('btn-reciter');

  if (!containerEl) return;

  if (isMemorizeMode) {
    audioPlayer.isBlocked = true;
    audioPlayer.stop();
    player?.classList.add('hidden');
    btnPlay?.classList.add('hidden');
    btnReciter?.classList.add('hidden');
    btn?.classList.add('btn--success');
    btn?.classList.remove('btn--secondary');
    containerEl.classList.add('memorize-active');
    dock?.classList.remove('hidden');

    const savedLock = getParentalLock();
    if (savedLock && currentSurah && savedLock.surahNumber === currentSurah.number) {
      isParentalLocked = true;
      currentMemorizeIndex = Math.min(savedLock.ayahIndex || 0, currentSurah.ayahs.length - 1);
      updateLockUI();
    } else {
      currentMemorizeIndex = 0;
    }

    consumedFinalWordsCount = 0;
    latestFinalCount = 0;
    maxMatchedCountForCurrentAyah = 0;

    containerEl.querySelectorAll('.ayah-text').forEach((el, idx) => {
      if (idx < currentMemorizeIndex) {
        el.classList.remove('ayah-text--hidden');
        el.classList.add('ayah-text--revealed');
      } else {
        el.classList.add('ayah-text--hidden');
        el.classList.remove('ayah-text--revealed');
      }
    });

    updateMicUI(false);
    updateMemorizeUI();
  } else {
    stopListening();
    audioPlayer.isBlocked = false;
    btnPlay?.classList.remove('hidden');
    btnReciter?.classList.remove('hidden');
    btn?.classList.remove('btn--success');
    btn?.classList.add('btn--secondary');
    containerEl.classList.remove('memorize-active');
    dock?.classList.add('hidden');

    containerEl.querySelectorAll('.ayah-text').forEach((el) => {
      unwrapWordsInElement(el);
      el.classList.remove('ayah-text--hidden', 'ayah-text--revealed');
    });
    if (lastActiveMemorizeEl) {
      lastActiveMemorizeEl.classList.remove('ayah-active-memorize');
      lastActiveMemorizeEl = null;
    }
  }
}

function ensureSpeechController() {
  if (speechController) return speechController;

  speechController = createSpeechController({
    onStart: () => {
      consumedFinalWordsCount = 0;
      latestFinalCount = 0;
      maxMatchedCountAtSessionStart = maxMatchedCountForCurrentAyah;
    },
    onStatus: (msg) => {
      const statusEl = document.getElementById('memorize-status-text');
      if (statusEl) statusEl.textContent = msg;
    },
    onStateChange: (listening) => {
      updateMicUI(listening);
      if (isMemorizeMode) updateMemorizeUI();
    },
    onResult: (e) => {
      const allFinalWords = [];
      const interimWords = [];
      const bestAlternativeWords = [];

      for (let i = 0; i < e.results.length; ++i) {
        const primaryWords = normalizeArabicWords(e.results[i][0].transcript).split(' ').filter(Boolean);
        if (e.results[i].isFinal) {
          allFinalWords.push(...primaryWords);
          for (let alt = 1; alt < e.results[i].length; alt++) {
            const altWords = normalizeArabicWords(e.results[i][alt].transcript).split(' ').filter(Boolean);
            bestAlternativeWords.push(...altWords);
          }
        } else {
          interimWords.push(...primaryWords);
        }
      }

      latestFinalCount = allFinalWords.length;
      const activeSpokenWords = allFinalWords.slice(consumedFinalWordsCount).concat(interimWords);
      const transcript = activeSpokenWords.join(' ').trim();

      if (transcript) {
        const matched = checkRecitation(transcript, allFinalWords.length);
        if (!matched && bestAlternativeWords.length > 0) {
          const altTranscript = bestAlternativeWords.concat(interimWords).join(' ').trim();
          if (altTranscript) checkRecitation(altTranscript, allFinalWords.length);
        }
      }
    },
  });

  return speechController;
}

function checkRecitation(transcript, finalCount) {
  if (!isMemorizeMode || !currentSurah || currentMemorizeIndex >= currentSurah.ayahs.length) return false;
  if (Date.now() - lastRevealTime < 120) return false;

  // Special handling for Al-Fatiha: reciting Ayah 2 directly
  if (currentSurah.number === 1 && currentMemorizeIndex === 0) {
    const ayah2Text = currentSurah.ayahs[1]?.text || '';
    if (compareTexts(transcript, ayah2Text)) {
      consumedFinalWordsCount = finalCount;
      revealAyah(1);
      revealAyah(2);
      return true;
    }
  }

  const targetAyah = currentSurah.ayahs[currentMemorizeIndex];
  let targetText = targetAyah.text;
  if (currentSurah.number !== 1 && currentSurah.number !== 9 && targetAyah.numberInSurah === 1) {
    targetText = stripBismillah(targetText);
  }

  const allTargetWords = normalizeArabicWords(targetText).split(' ').filter(Boolean);
  const targetWords = allTargetWords.slice(maxMatchedCountAtSessionStart);
  const spokenWords = normalizeArabicWords(transcript).split(' ').filter(Boolean);
  const recentSpoken = spokenWords.slice(-(Math.max(targetWords.length * 2, 24) + 8));

  const { targetCount } = matchAyahPrefix(recentSpoken, targetWords);
  const totalMatched = maxMatchedCountAtSessionStart + targetCount;

  if (totalMatched > maxMatchedCountForCurrentAyah) {
    maxMatchedCountForCurrentAyah = totalMatched;
  }

  const activeWrapper = document.getElementById(`ayah-${currentMemorizeIndex + 1}`);
  if (activeWrapper) {
    const wordEls = activeWrapper.querySelectorAll('.quran-word');
    wordEls.forEach((w, idx) => {
      w.classList.toggle('quran-word--hidden', idx >= maxMatchedCountForCurrentAyah);
      w.classList.toggle('quran-word--revealed', idx < maxMatchedCountForCurrentAyah);
    });
  }

  const threshold = Math.ceil(allTargetWords.length * 0.85);
  if (maxMatchedCountForCurrentAyah >= threshold || compareTexts(transcript, targetText)) {
    consumedFinalWordsCount = finalCount;
    revealAyah(currentMemorizeIndex + 1);
    return true;
  }

  return false;
}

function revealAyah(localNum, isHint = false) {
  const wrapper = document.getElementById(`ayah-${localNum}`);
  if (!wrapper) return;
  const textEl = wrapper.querySelector('.ayah-text');
  if (!textEl) return;

  textEl.classList.remove('ayah-text--hidden');
  textEl.classList.add('ayah-text--revealed');
  wrapWordsInElement(textEl);

  textEl.querySelectorAll('.quran-word').forEach((w) => {
    w.classList.remove('quran-word--hidden');
    w.classList.add('quran-word--revealed');
    if (isHint) w.classList.add('ayah-text--hinted');
  });

  if (!isHint) {
    textEl.classList.add('ayah-success-flash');
    setTimeout(() => textEl.classList.remove('ayah-success-flash'), 900);
  }

  lastRevealTime = Date.now();
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (navigator.vibrate) {
    try { navigator.vibrate(60); } catch {}
  }

  currentMemorizeIndex++;
  maxMatchedCountForCurrentAyah = 0;
  maxMatchedCountAtSessionStart = 0;
  if (isParentalLocked) {
    updateParentalLockProgress(currentMemorizeIndex);
  }
  updateMemorizeUI();

  if (currentSurah && currentMemorizeIndex >= currentSurah.ayahs.length) {
    celebrateCompletion();
  }
}

function updateMemorizeUI() {
  const statusEl = document.getElementById('memorize-status-text');
  if (!statusEl || !currentSurah) return;

  if (lastActiveMemorizeEl) {
    lastActiveMemorizeEl.classList.remove('ayah-active-memorize');
    lastActiveMemorizeEl = null;
  }

  if (currentMemorizeIndex < currentSurah.ayahs.length) {
    const listening = speechController?.isListening();
    statusEl.textContent = `${listening ? t('mem_listening_ayah') : t('mem_ready_ayah')} ${formatNum(currentMemorizeIndex + 1)}...`;

    const activeWrapper = document.getElementById(`ayah-${currentMemorizeIndex + 1}`);
    if (activeWrapper) {
      activeWrapper.classList.add('ayah-active-memorize');
      lastActiveMemorizeEl = activeWrapper;
      activeWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const textEl = activeWrapper.querySelector('.ayah-text');
      if (textEl) {
        textEl.classList.remove('ayah-text--hidden');
        textEl.classList.add('ayah-text--revealed');
        // Lazily wrap ONLY the active ayah's words!
        wrapWordsInElement(textEl);

        textEl.querySelectorAll('.quran-word').forEach((w, idx) => {
          w.classList.toggle('quran-word--hidden', idx >= maxMatchedCountForCurrentAyah);
          w.classList.toggle('quran-word--revealed', idx < maxMatchedCountForCurrentAyah);
        });
      }
    }
  } else {
    statusEl.textContent = t('mem_completed');
    stopListening();
  }
}

function celebrateCompletion() {
  stopListening();
  if (navigator.vibrate) {
    try { navigator.vibrate([80, 40, 80, 40, 160]); } catch {}
  }
  showToast(t('mem_surah_done'), 'success', 4000);
}

async function startListening() {
  await ensureSpeechController().start();
}

function stopListening(withChime = false) {
  speechController?.stop(withChime);
  updateMicUI(false);
}

function updateMicUI(listening) {
  const btn = document.getElementById('memorize-mic-btn');
  if (!btn) return;
  btn.classList.toggle('listening', listening);
  btn.innerHTML = listening
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"></polygon></svg>`;
}

function updateLockUI() {
  const lockBtn = document.getElementById('memorize-lock-btn');
  if (lockBtn) lockBtn.textContent = isParentalLocked ? '🔒' : '🔓';
}

function showPinModal(action) {
  pendingPinAction = action;
  const overlay = document.getElementById('pin-modal-overlay');
  const title = document.getElementById('pin-modal-title');
  const inputs = document.querySelectorAll('.pin-input');

  if (title) {
    title.textContent = action === 'lock' ? t('mem_set_pin_title') : t('mem_enter_pin_title');
  }
  inputs.forEach((input) => (input.value = ''));
  overlay?.classList.add('active');
  setTimeout(() => inputs[0]?.focus(), 100);
}

function hidePinModal() {
  document.getElementById('pin-modal-overlay')?.classList.remove('active');
  pendingPinAction = null;
}

function handlePinSubmit() {
  const inputs = Array.from(document.querySelectorAll('.pin-input'));
  const pin = inputs.map((i) => i.value).join('');

  if (pin.length !== 4) {
    showToast(t('mem_pin_4digits'), 'error');
    return;
  }

  if (pendingPinAction === 'lock') {
    isParentalLocked = true;
    saveParentalLock(pin, currentSurah.number, currentMemorizeIndex);
    updateLockUI();
    hidePinModal();
    showToast(t('mem_pin_locked'), 'success');
    return;
  }

  if (!verifyParentalPin(pin)) {
    showToast(t('mem_pin_wrong'), 'error');
    inputs.forEach((input) => (input.value = ''));
    inputs[0]?.focus();
    return;
  }

  const action = pendingPinAction;
  hidePinModal();

  if (action === 'unlock') {
    isParentalLocked = false;
    clearParentalLock();
    updateLockUI();
    showToast(t('mem_pin_unlocked'), 'success');
  } else if (action === 'hint') {
    if (currentSurah && currentMemorizeIndex < currentSurah.ayahs.length) {
      consumedFinalWordsCount = latestFinalCount;
      revealAyah(currentMemorizeIndex + 1, true);
    }
  } else if (action === 'exit') {
    isParentalLocked = false;
    clearParentalLock();
    updateLockUI();
    toggleMemorizeMode(false);
  } else if (action === 'back') {
    isParentalLocked = false;
    clearParentalLock();
    window.location.hash = '#/quran';
  }
}

// ─── Context Menu ─────────────────────────────────────────────

function showAyahMenu(clientX, clientY, ayah, wrapper) {
  if (isMemorizeMode) return;
  selectedAyah = ayah;
  selectedWrapper = wrapper;

  const menu = document.getElementById('ayah-context-menu');
  const bubble = document.getElementById('ctx-bubble');
  if (!menu) return;

  menu.classList.remove('hidden');

  if (bubble) {
    const bubbleWidth = bubble.offsetWidth || 170;
    const bubbleHeight = bubble.offsetHeight || 46;
    let left = clientX - bubbleWidth / 2;
    let top = clientY - bubbleHeight - 14;

    if (left < 14) left = 14;
    else if (left + bubbleWidth > window.innerWidth - 14) {
      left = window.innerWidth - bubbleWidth - 14;
    }
    if (top < 14) top = clientY + 20;

    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  void menu.offsetWidth;
  menu.classList.add('active');
}

function hideAyahMenu() {
  const menu = document.getElementById('ayah-context-menu');
  if (!menu) return;
  menu.classList.remove('active');
  setTimeout(() => {
    if (!menu.classList.contains('active')) {
      menu.classList.add('hidden');
    }
  }, 250);
}

function playSelectedAyah() {
  if (selectedAyah) audioPlayer.playAyah(selectedAyah);
  hideAyahMenu();
}

function bookmarkSelectedAyah() {
  if (selectedAyah && selectedWrapper && currentSurah) {
    const localNum = selectedAyah.numberInSurah;
    let text = selectedAyah.text;
    if (currentSurah.number !== 1 && currentSurah.number !== 9 && localNum === 1) {
      text = stripBismillah(text);
    }
    const snippet = text.length > 35 ? `${text.substring(0, 35)}...` : text;

    document.querySelectorAll('.ayah-wrapper.ayah-bookmarked').forEach((el) => el.classList.remove('ayah-bookmarked'));
    document.getElementById(`ayah-${localNum}`)?.classList.add('ayah-bookmarked');

    saveLastRead(currentSurah.number, currentSurah.name, localNum, snippet);
    addBookmark(currentSurah.number, currentSurah.name, localNum, snippet);
    showToast(t('quran_bookmarked'), 'success', 2000);

    if (navigator.vibrate) {
      try { navigator.vibrate([35, 25, 35]); } catch {}
    }
  }
  hideAyahMenu();
}

export function cleanup() {
  isMounted = false;
  audioPlayer.stop();
  closeReciterModal();
  hideAyahMenu();

  if (speechController) {
    speechController.destroy();
    speechController = null;
  }

  isMemorizeMode = false;
  isParentalLocked = false;
  pendingPinAction = null;
  currentSurah = null;
  selectedAyah = null;
  selectedWrapper = null;
  lastActiveMemorizeEl = null;

  disableWakeLock();
}
