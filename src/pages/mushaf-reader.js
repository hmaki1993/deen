import { t } from '../i18n/index.js';
import { getPage, getSurahStartPage, getSurah } from '../api/quran.js';
import { Capacitor } from '@capacitor/core';
import { formatNum } from '../utils/helpers.js';
import { audioPlayer } from '../api/audio.js';
import { renderAudioPlayer, initAudioPlayerEvents, updateAudioPlayerUI } from '../components/audio-player.js';
import { renderReciterModal, initReciterModalEvents, openReciterModal } from '../components/reciter-modal.js';
import { saveLastRead, addBookmark, saveParentalLock, getParentalLock, clearParentalLock } from '../utils/storage.js';

let activePageNum = 1;
let intersectionObserver = null;
let pageCache = {};
let selectedAyahData = null;

let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock acquired successfully');
    }
  } catch (err) {
    console.warn('Failed to acquire Screen Wake Lock:', err);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
      console.log('Screen Wake Lock released');
    });
  }
}

const handleVisibilityChange = async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
};

// Memorization Mode State
let isMemorizeMode = false;
let currentMemorizeIndex = 0; // Index of active ayah in pageAyahs
let pageAyahs = [];           // Ayahs on the current active page
let recognition = null;
let isListening = false;
let isRecognitionActive = false;
let sessionTargetWords = [];
let sessionTargetMapping = [];
let sessionMaxTargetReached = 0;
let newAyahLockoutUntil = 0;
let lockedOutTargetIndex = 0;
let lastRevealTime = 0;
let lastAyahCompletionTime = 0;
let revealedWordCount = 0;
let lastSpeechError = null;
let speechRestartAttempts = 0;
let lastSpeechRestartTime = 0;
let isParentalLocked = false;
let parentalPin = null;
let pendingPinAction = null; // 'lock', 'unlock', 'hint', 'exit', 'back'

function wrapWords(text) {
  return text.split(' ').map((word, idx) => {
    const colorClass = `word-color-${idx % 5}`;
    return `<span class="quran-word ${colorClass}" data-word-idx="${idx}">${word}</span>`;
  }).join(' ');
}

function normalizeArabicForMatching(text) {
  return text
    .replace(/[\u064B-\u065F\u0656-\u065E\u06D6-\u06ED\u0670\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A')
    .replace(/[\s\.\,\-\?\!]/g, '')
    .trim();
}

function normalizeArabicWords(text) {
  return text
    .replace(/[\u064B-\u065F\u0656-\u065E\u06D6-\u06ED\u0670\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A')
    .replace(/[\.\,\-\?\!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSpokenBismillah(spokenWords, targetWords) {
  if (targetWords.length > 0) {
    const firstTargetNorm = normalizeArabicForMatching(targetWords[0]);
    if (firstTargetNorm === 'بسم') {
      return spokenWords;
    }
  }
  
  const normalizedSpoken = spokenWords.map(w => normalizeArabicForMatching(w));
  
  if (normalizedSpoken.length >= 4 &&
      normalizedSpoken[0] === 'بسم' &&
      normalizedSpoken[1] === 'الله' &&
      (normalizedSpoken[2] === 'رحمن' || normalizedSpoken[2] === 'الرحمن') &&
      (normalizedSpoken[3] === 'رحيم' || normalizedSpoken[3] === 'الرحيم')) {
    return spokenWords.slice(4);
  }
  
  if (normalizedSpoken.length >= 2 &&
      normalizedSpoken[0] === 'بسم' &&
      normalizedSpoken[1] === 'الله') {
    return spokenWords.slice(2);
  }
  
  if (normalizedSpoken.length >= 1 &&
      normalizedSpoken[0] === 'بسم') {
    return spokenWords.slice(1);
  }
  
  return spokenWords;
}


function calcSimilarity(a, b) {
  if (a.length === 0) return b.length === 0 ? 1.0 : 0.0;
  if (b.length === 0) return 0.0;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return 1.0 - (distance / maxLen);
}

const DISJOINTED_LETTERS_MAP = {
  'الم': ['الف lam ميم', 'الف لام ميم'],
  'المص': ['الف لام ميم صاد'],
  'الر': ['الف لام را'],
  'المر': ['الف لام ميم را'],
  'كهيعص': ['كاف ها يا عين صاد'],
  'طه': ['طه', 'طا ها'],
  'طسم': ['طسم', 'طا سين ميم'],
  'طس': ['طس', 'طا سين'],
  'يس': ['يس', 'يا سين'],
  'ص': ['صاد'],
  'حم': ['حم', 'حا ميم'],
  'حم عسق': ['حم عسق', 'حا ميم عين سين قاف'],
  'ق': ['قاف'],
  'ن': ['نون']
};

function compareTexts(spoken, target) {
  const spokenWords = normalizeArabicWords(spoken).split(' ').filter(Boolean);
  const targetWords = normalizeArabicWords(target).split(' ').filter(Boolean);
  
  if (targetWords.length === 0) return false;

  const windowSize = targetWords.length + 3;
  const recentSpokenWords = spokenWords.slice(-windowSize);

  const normalizedRecentSpoken = normalizeArabicForMatching(recentSpokenWords.join(' '));
  const normalizedTarget = normalizeArabicForMatching(target);
  
  if (normalizedRecentSpoken.includes(normalizedTarget)) {
    return true;
  }

  for (const [key, variations] of Object.entries(DISJOINTED_LETTERS_MAP)) {
    const normKey = normalizeArabicForMatching(key);
    if (normalizedTarget === normKey) {
      for (const variation of variations) {
        const normVar = normalizeArabicForMatching(variation);
        if (normalizedRecentSpoken.includes(normVar)) {
          return true;
        }
      }
    }
  }

  let matchCount = 0;
  const usedSpokenIndices = new Set();

  for (const targetWord of targetWords) {
    let bestMatch = false;

    for (let i = 0; i < recentSpokenWords.length; i++) {
      if (usedSpokenIndices.has(i)) continue;
      const spokenWord = recentSpokenWords[i];

      if (targetWord.length >= 3) {
        if (spokenWord.includes(targetWord) || targetWord.includes(spokenWord)) {
          bestMatch = true;
          usedSpokenIndices.add(i);
          break;
        }
        if (targetWord.length >= 4 && spokenWord.length >= 3) {
          const similarity = calcSimilarity(spokenWord, targetWord);
          if (similarity >= 0.7) {
            bestMatch = true;
            usedSpokenIndices.add(i);
            break;
          }
        }
      } else {
        if (spokenWord === targetWord) {
          bestMatch = true;
          usedSpokenIndices.add(i);
          break;
        }
      }
    }

    if (bestMatch) matchCount++;
  }

  const matchRatio = matchCount / targetWords.length;
  const requiredRatio = targetWords.length <= 2 ? 0.7 : 0.55;

  return matchRatio >= requiredRatio;
}

export async function render(container, surahNumber, targetAyahNumber = null) {
  // Acquire Screen Wake Lock to keep screen on while reading
  await requestWakeLock();
  document.addEventListener('visibilitychange', handleVisibilityChange);

  activePageNum = getSurahStartPage(surahNumber);

  container.innerHTML = `
    <div class="page page--mushaf-reader page-enter">
      <div class="mushaf-header">
        <button id="quran-back-btn" class="icon-btn" aria-label="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1 class="page-title">${t('quran_title')}</h1>
        <div style="display: flex; gap: 8px;">
          <button id="btn-switch-read" class="icon-btn" aria-label="Memorize" title="${t('quran_memorize')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
            </svg>
          </button>
          <button id="btn-reciter" class="icon-btn" aria-label="Reciter" title="${t('quran_reciter')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>
        </div>
      </div>

      <div class="mushaf-viewport" id="mushaf-viewport" dir="rtl">
        ${Array.from({length: 604}, (_, i) => `
          <div class="mushaf-page-container" id="page-wrapper-${i+1}"></div>
        `).join('')}
      </div>

      ${renderAudioPlayer()}
      ${renderReciterModal()}
      
      <!-- Memorization Dock -->
      <div id="quran-memorize-dock" class="memorize-dock hidden">
        <div class="memorize-dock__info">
          <span id="memorize-status-text" class="memorize-status">جاري الاستماع للآية ١...</span>
        </div>
        <div class="memorize-dock__controls">
          <button id="memorize-mic-btn" class="memorize-mic-btn" aria-label="Play/Stop">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"></polygon></svg>
          </button>
        </div>
        <div class="memorize-dock__hint">
          <button id="memorize-lock-btn" class="memorize-lock-btn">🔓</button>
          <button id="memorize-hint-btn" class="memorize-hint-btn">كشف الآية 👁️</button>
        </div>
      </div>
      
      <!-- PIN Modal -->
      <div id="pin-modal-overlay" class="pin-modal-overlay">
        <div class="pin-modal">
          <h3 id="pin-modal-title">تعيين الرمز السري</h3>
          <p id="pin-modal-desc">أدخل 4 أرقام لقفل وضع التسميع</p>
          <div class="pin-inputs">
            <input type="password" class="pin-input" maxlength="1" inputmode="numeric" />
            <input type="password" class="pin-input" maxlength="1" inputmode="numeric" />
            <input type="password" class="pin-input" maxlength="1" inputmode="numeric" />
            <input type="password" class="pin-input" maxlength="1" inputmode="numeric" />
          </div>
          <div class="pin-modal-actions">
            <button id="pin-cancel-btn" class="btn btn--secondary">إلغاء</button>
            <button id="pin-confirm-btn" class="btn btn--primary">تأكيد</button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Ayah Context Menu Overlay -->
    <div id="ayah-context-menu" class="ayah-context-menu hidden">
      <div class="context-menu-backdrop" id="ctx-backdrop"></div>
      <div class="context-menu-bubble" id="ctx-bubble">
        <button id="bubble-play-btn" class="bubble-btn">
          <span class="btn-icon">▶️</span>
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

  document.getElementById('quran-back-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (isMemorizeMode && isParentalLocked) {
      showPinModal('back');
    } else {
      location.hash = '#/quran';
    }
  });
  
  document.getElementById('btn-reciter')?.addEventListener('click', () => {
    openReciterModal();
  });
  
  document.getElementById('btn-switch-read')?.addEventListener('click', () => {
    toggleMemorizeMode();
  });

  // Memorization dock actions
  document.getElementById('memorize-mic-btn')?.addEventListener('click', () => {
    if (isListening) {
      playStopChime();
      stopListening();
    } else {
      playRecordChime();
      startListening();
    }
  });

  document.getElementById('memorize-lock-btn')?.addEventListener('click', () => {
    if (isParentalLocked) {
      showPinModal('unlock');
    } else {
      showPinModal('lock');
    }
  });

  document.getElementById('memorize-hint-btn')?.addEventListener('click', () => {
    if (isParentalLocked) {
      showPinModal('hint');
    } else {
      revealAyah(currentMemorizeIndex, true);
    }
  });

  // PIN inputs auto-focus logic
  const pinInputs = container.querySelectorAll('.pin-input');
  pinInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      if (e.target.value.length === 1 && index < pinInputs.length - 1) {
        pinInputs[index + 1].focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        pinInputs[index - 1].focus();
      }
    });
  });

  document.getElementById('pin-cancel-btn')?.addEventListener('click', hidePinModal);
  document.getElementById('pin-confirm-btn')?.addEventListener('click', handlePinSubmit);
  
  // Prep audio player for the opened surah
  getSurah(surahNumber).then(surq => {
    if (!audioPlayer.isPlaying || audioPlayer.surahNumber !== surahNumber) {
      audioPlayer.init(surq.ayahs, surq.number, (state) => {
        updateAudioPlayerUI(state);
      });
      updateAudioPlayerUI({
        surah: surq.number,
        ayah: null,
        isPlaying: false
      });
    }
  }).catch(e => console.error("Error preloading surah for audio", e));
  initAudioPlayerEvents();
  initReciterModalEvents(() => {
    audioPlayer.stop();
  });
  
  initContextMenuEvents();

  const viewport = document.getElementById('mushaf-viewport');
  // 1. Visibility Observer (no margin) to track the active page
  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const pageNum = parseInt(entry.target.id.replace('page-wrapper-', ''));
      if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
        const oldPageNum = activePageNum;
        activePageNum = pageNum;
        if (isMemorizeMode && oldPageNum !== pageNum) {
          // Switch memorization page!
          setTimeout(() => {
            pageAyahs = pageCache[activePageNum] ? pageCache[activePageNum].ayahs : [];
            currentMemorizeIndex = 0;
            globalConsumedSpokenWords = 0;
            revealedWordCount = 0;
            
            if (isListening) {
              stopListening();
              startListening();
            }
            
            const wrapper = document.getElementById(`page-wrapper-${activePageNum}`);
            if (wrapper) {
              syncMemorizeVisibility();
            }
            updateMemorizeUI();
          }, 100);
        }

        // Dynamic DOM Windowing: clear pages that are more than 5 pages away to free memory
        for (let i = 1; i <= 604; i++) {
          if (Math.abs(i - activePageNum) > 5) {
            const pageEl = document.getElementById(`page-wrapper-${i}`);
            if (pageEl && pageEl.dataset.loaded === 'true') {
              pageEl.innerHTML = '';
              pageEl.removeAttribute('data-loaded');
            }
          }
        }
      }
    });
  }, {
    root: viewport,
    threshold: 0.6
  });

  // 2. Preload Observer (with margin) to load content ahead of time
  const preloadObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const pageNum = parseInt(entry.target.id.replace('page-wrapper-', ''));
      
      if (entry.isIntersecting) {
        // Debounce loading to prevent 429 errors when scrolling fast
        if (entry.target.dataset.loadTimer) {
          clearTimeout(parseInt(entry.target.dataset.loadTimer));
        }
        
        entry.target.dataset.loadTimer = setTimeout(() => {
          loadPageContent(pageNum, entry.target);
        }, 50).toString();
        
      } else {
        // Cancel pending load if scrolled past quickly
        if (entry.target.dataset.loadTimer) {
          clearTimeout(parseInt(entry.target.dataset.loadTimer));
          entry.target.dataset.loadTimer = '';
        }
      }
    });
  }, {
    root: viewport,
    rootMargin: '0px 100% 0px 100%', // Preload 1 screen to the left and 1 screen to the right
    threshold: 0.01
  });

  document.querySelectorAll('.mushaf-page-container').forEach(el => {
    visibilityObserver.observe(el);
    preloadObserver.observe(el);
  });

  // Scroll to starting page
  const startWrapper = document.getElementById(`page-wrapper-${activePageNum}`);
  if (startWrapper) {
    // We use setTimeout to ensure the DOM is painted and scroll works
    setTimeout(() => {
      startWrapper.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'start' });
    }, 50);
  }
}

async function loadPageContent(pageNum, wrapper) {
  if (wrapper.dataset.loaded) return;
  wrapper.dataset.loaded = 'loading';
  
  try {
    let pageData = pageCache[pageNum];
    if (!pageData) {
      pageData = await getPage(pageNum);
      pageCache[pageNum] = pageData;
    }
    
    // Group ayahs by Surah
    const surahsOnPage = {};
    pageData.ayahs.forEach(ayah => {
      if (!surahsOnPage[ayah.surah.number]) {
        surahsOnPage[ayah.surah.number] = {
          surah: ayah.surah,
          ayahs: []
        };
      }
      surahsOnPage[ayah.surah.number].ayahs.push(ayah);
    });

    let html = `<div class="mushaf-page-inner">`;
    
    if (pageData.ayahs && pageData.ayahs.length > 0) {
      const firstAyah = pageData.ayahs[0];
      const hizbQuarter = firstAyah.hizbQuarter;
      const juz = firstAyah.juz;
      
      const hizbNum = Math.ceil(hizbQuarter / 4);
      const quarterIndex = (hizbQuarter - 1) % 4;
      
      let rubText = '';
      switch (quarterIndex) {
        case 0: rubText = 'بداية الحزب'; break;
        case 1: rubText = 'الربع الأول'; break;
        case 2: rubText = 'نصف الحزب'; break;
        case 3: rubText = 'الربع الثالث'; break;
      }
      
      html += `
        <div class="mushaf-page-meta-header">
          <div class="meta-item meta-right">الجزء ${formatNum(juz)} • ${rubText}</div>
          <div class="meta-item meta-left">الحزب ${formatNum(hizbNum)}</div>
        </div>
      `;
    }
    
    Object.values(surahsOnPage).forEach(surahGroup => {
      const isStartOfSurah = surahGroup.ayahs.some(a => a.numberInSurah === 1);
      
      if (isStartOfSurah) {
        html += `
          <div class="mushaf-surah-header glass-card">
            <h2>${surahGroup.surah.name}</h2>
          </div>
        `;
        if (surahGroup.surah.number !== 1 && surahGroup.surah.number !== 9) {
          html += `<div class="bismillah-mushaf">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
        }
      }
      
      html += `<div class="mushaf-text-container">`;
      html += surahGroup.ayahs.map(ayah => {
        let text = ayah.text;
        if (isStartOfSurah && surahGroup.surah.number !== 1 && surahGroup.surah.number !== 9 && ayah.numberInSurah === 1) {
          text = stripBismillah(text);
        }
        const safeText = text.replace(/"/g, '&quot;');
        const wrappedText = wrapWords(text);
        return `<span class="mushaf-ayah" id="ayah-${ayah.surah.number}-${ayah.numberInSurah}" data-abs="${ayah.number}" data-surah="${ayah.surah.number}" data-surahname="${surahGroup.surah.name}" data-ayah="${ayah.numberInSurah}" data-text="${safeText}">
          ${wrappedText} <span class="mushaf-ayah-num">﴿${formatNum(ayah.numberInSurah)}﴾</span>
        </span>`;
      }).join(' ');
      html += `</div>`;
    });
    
    html += `
      <div class="mushaf-page-footer">
        ${formatNum(pageNum)}
      </div>
    </div>`;

    wrapper.innerHTML = html;
    wrapper.dataset.loaded = 'true';

    // If in memorize mode when page is loaded, make sure we blur its words!
    if (isMemorizeMode && pageNum === activePageNum) {
      syncMemorizeVisibility();
    }

    // Add click listeners to individual ayahs to jump recitation index during memorization
    wrapper.querySelectorAll('.mushaf-ayah').forEach(ayahEl => {
      ayahEl.addEventListener('click', (e) => {
        if (!isMemorizeMode) return;
        e.stopPropagation(); // prevent toggling fullscreen
        
        const surahNum = parseInt(ayahEl.dataset.surah);
        const ayahNum = parseInt(ayahEl.dataset.ayah);
        
        // Update active page ayahs if they are not yet populated
        if (pageAyahs.length === 0) {
          pageAyahs = pageCache[activePageNum] ? pageCache[activePageNum].ayahs : [];
        }
        
        const idx = pageAyahs.findIndex(a => a.surah.number === surahNum && a.numberInSurah === ayahNum);
        if (idx >= 0) {
          currentMemorizeIndex = idx;
          globalConsumedSpokenWords = 0;
          revealedWordCount = 0;
          
          if (isListening) {
            stopListening();
            startListening();
          }
          
          // Re-blur all words after this index, and reveal words before it!
          syncMemorizeVisibility();
          
          updateMemorizeUI();
        }
      });
    });
    
    // Add fullscreen toggle and long press logic
    let pressTimer;
    let isLongPress = false;
    
    let touchStartPos = null;
    let touchStartTime = 0;
    
    const startPress = (e) => {
      const ayahEl = e.target.closest('.mushaf-ayah');
      if (ayahEl) {
        isLongPress = false;
        
        // Capture touch coordinates immediately
        const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
        
        touchStartPos = { x: clientX, y: clientY };
        
        pressTimer = setTimeout(() => {
          isLongPress = true;
          try {
            if (navigator.vibrate) navigator.vibrate(50);
          } catch(err) {}
          
          // Show the menu using the pre-captured coordinates
          showAyahMenu(clientX, clientY, ayahEl);
        }, 500); // 500ms for long press
      }
    };
    
    const cancelPress = (e) => {
      if (e && e.type === 'touchmove' && touchStartPos && e.touches && e.touches[0]) {
        const dist = Math.hypot(e.touches[0].clientX - touchStartPos.x, e.touches[0].clientY - touchStartPos.y);
        if (dist < 20) return; // Ignore microscopic movements
      }
      clearTimeout(pressTimer);
    };
    
    wrapper.addEventListener('contextmenu', (e) => {
      const ayahEl = e.target.closest('.mushaf-ayah');
      if (ayahEl) {
        e.preventDefault();
        const clientX = e.clientX || (touchStartPos ? touchStartPos.x : 0);
        const clientY = e.clientY || (touchStartPos ? touchStartPos.y : 0);
        if (clientX && clientY) {
          showAyahMenu(clientX, clientY, ayahEl);
        }
      }
    });
    
    wrapper.addEventListener('touchstart', (e) => {
      startPress(e);
      touchStartTime = Date.now();
    }, {passive: true});
    
    wrapper.addEventListener('touchmove', cancelPress, {passive: true});
    
    wrapper.addEventListener('touchend', (e) => {
      clearTimeout(pressTimer);
      if (isLongPress) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      
      let dist = 0;
      if (e.changedTouches && e.changedTouches[0] && touchStartPos) {
        dist = Math.hypot(e.changedTouches[0].clientX - touchStartPos.x, e.changedTouches[0].clientY - touchStartPos.y);
      }
      
      if (dist > 15) return;
      
      const duration = Date.now() - touchStartTime;
      if (duration < 250) {
        if (e.target.closest('.audio-player') || 
            e.target.closest('.mushaf-header') ||
            e.target.closest('.ayah-context-menu') ||
            e.target.closest('.reciter-page') ||
            e.target.closest('.audio-settings-card')) {
          return;
        }
        
        const menu = document.getElementById('ayah-context-menu');
        if (menu && !menu.classList.contains('hidden')) {
          hideAyahMenu();
          if (e.cancelable) e.preventDefault();
          return;
        }
        
        if (e.cancelable) e.preventDefault();
        document.body.classList.toggle('fullscreen-mushaf');
      }
    }, {passive: false});
    
    wrapper.addEventListener('touchcancel', cancelPress, {passive: true});
    
    wrapper.addEventListener('mousedown', startPress);
    wrapper.addEventListener('mousemove', cancelPress);
    wrapper.addEventListener('mouseup', cancelPress);
    
    wrapper.addEventListener('click', (e) => {
      if (e.target.closest('.audio-player') || 
          e.target.closest('.mushaf-header') ||
          e.target.closest('.ayah-context-menu') ||
          e.target.closest('.reciter-page') ||
          e.target.closest('.audio-settings-card')) {
        return;
      }
      
      const menu = document.getElementById('ayah-context-menu');
      if (menu && !menu.classList.contains('hidden')) {
        hideAyahMenu();
        return;
      }
      
      document.body.classList.toggle('fullscreen-mushaf');
    });

  } catch (err) {
    console.error('Failed to load page', pageNum, err);
    wrapper.innerHTML = `<div class="mushaf-error">فشل تحميل الصفحة ${pageNum}</div>`;
    wrapper.dataset.loaded = 'error';
  }
}

function playRecordChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    gain1.gain.setValueAtTime(0.04, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.12);
    
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain2.gain.setValueAtTime(0.04, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.12);
    }, 60);
  } catch (e) {
    console.warn('Failed to play record chime:', e);
  }
}

function playStopChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    gain1.gain.setValueAtTime(0.04, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.12);
    
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain2.gain.setValueAtTime(0.04, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.12);
    }, 60);
  } catch (e) {
    console.warn('Failed to play stop chime:', e);
  }
}

function toggleMemorizeMode(forceOpen = false) {
  if (isMemorizeMode && !forceOpen && isParentalLocked) {
    showPinModal('exit');
    return;
  }
  
  isMemorizeMode = forceOpen ? true : !isMemorizeMode;
  const btn = document.getElementById('btn-switch-read');
  const dock = document.getElementById('quran-memorize-dock');
  const player = document.getElementById('quran-audio-player');
  
  // Populate pageAyahs for the active page
  pageAyahs = pageCache[activePageNum] ? pageCache[activePageNum].ayahs : [];
  
  if (isMemorizeMode) {
    audioPlayer.isBlocked = true;
    audioPlayer.stop();
    if (player) player.classList.add('hidden');
    if (btn) {
      btn.style.color = '#ff3b30'; // Highlight mic icon in header
    }
    dock.classList.remove('hidden');

    // Lock horizontal swiping/page flipping
    const viewport = document.getElementById('mushaf-viewport');
    if (viewport) {
      viewport.style.overflowX = 'hidden';
      viewport.style.scrollSnapType = 'none';
    }
    
    // Check if resuming a saved session
    const savedLock = getParentalLock();
    if (savedLock && savedLock.surahNumber === audioPlayer.surahNumber) {
      isParentalLocked = true;
      parentalPin = savedLock.pin;
      currentMemorizeIndex = savedLock.ayahIndex || 0;
      updateLockUI();
    } else {
      currentMemorizeIndex = 0;
    }
    
    sessionTargetWords = [];
    sessionTargetMapping = [];
    sessionMaxTargetReached = 0;
    newAyahLockoutUntil = 0;
    lockedOutTargetIndex = 0;
    
    revealedWordCount = 0;
    syncMemorizeVisibility();
    document.body.classList.remove('memorize-revealed');
    
    // Start idle/stopped (not listening)
    isListening = false;
    updateMicUI();
    updateMemorizeUI();
  } else {
    stopListening();
    audioPlayer.isBlocked = false;
    if (btn) {
      btn.style.color = '';
    }
    dock.classList.add('hidden');

    // Unlock horizontal swiping/page flipping
    const viewport = document.getElementById('mushaf-viewport');
    if (viewport) {
      viewport.style.overflowX = 'auto';
      viewport.style.scrollSnapType = 'x mandatory';
    }
    
    // Reveal all words of all page wrappers
    document.querySelectorAll('.quran-word').forEach(el => {
      el.classList.remove('quran-word--hidden');
      el.classList.remove('quran-word--revealed');
    });
    document.querySelectorAll('.mushaf-ayah').forEach(el => {
      el.classList.remove('ayah-active-memorize');
      el.classList.remove('mushaf-ayah--hidden');
    });
    document.body.classList.remove('memorize-revealed', 'memorize-listening');
  }
}


function revealAyah(index, isHint = false) {
  if (index < 0 || index >= pageAyahs.length) return;
  const targetAyah = pageAyahs[index];
  const wrapper = document.getElementById(`ayah-${targetAyah.surah.number}-${targetAyah.numberInSurah}`);
  if (wrapper) {
    wrapper.querySelectorAll('.quran-word').forEach(w => {
      w.classList.remove('quran-word--hidden');
      w.classList.add('quran-word--revealed');
      if (isHint) {
        w.classList.add('ayah-text--hinted');
        w.style.setProperty('color', '#ff3b30', 'important');
      }
    });
    if (!isHint) {
      wrapper.classList.add('ayah-success-flash');
      setTimeout(() => wrapper.classList.remove('ayah-success-flash'), 1000);
    }
    lastRevealTime = Date.now();
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (navigator.vibrate) navigator.vibrate(80);
    currentMemorizeIndex++;
    revealedWordCount = 0;
    
    syncMemorizeVisibility();
    
    // No longer stopping recognition here to prevent stuttering/disconnects!

    updateMemorizeUI();
    if (currentMemorizeIndex >= pageAyahs.length) {
      celebrateCompletion();
    }
  }
}

function updateMemorizeUI() {
  const statusEl = document.getElementById('memorize-status-text');
  if (!statusEl) return;

  document.querySelectorAll('.mushaf-ayah').forEach(el => {
    el.classList.remove('ayah-active-memorize');
  });

  if (currentMemorizeIndex < pageAyahs.length) {
    const targetAyah = pageAyahs[currentMemorizeIndex];
    statusEl.textContent = `جاري الاستماع للآية ${formatNum(targetAyah.numberInSurah)}...`;
    
    const activeWrapper = document.getElementById(`ayah-${targetAyah.surah.number}-${targetAyah.numberInSurah}`);
    if (activeWrapper) {
      activeWrapper.classList.add('ayah-active-memorize');
      activeWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    statusEl.innerHTML = `تم التسميع بنجاح! 🎉`;
    stopListening();
  }
}

function celebrateCompletion() {
  stopListening();
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
  setTimeout(() => {
    alert(`الحمد لله! تم تسميع الصفحة ${formatNum(activePageNum)} بنجاح! 🎉`);
  }, 500);
}

async function startListening() {
  // Directly initialize and start Speech Recognition to remove any mic button delay
  // The browser will handle permissions natively through the SpeechRecognition API

  if (Capacitor && Capacitor.Plugins && Capacitor.Plugins.VolumeControl) {
    try {
      await Capacitor.Plugins.VolumeControl.mute();
    } catch (e) {
      console.warn('Failed to mute system volume:', e);
    }
  }

  initSpeechRecognition();
  if (recognition && !isListening) {
    isListening = true;
    try { recognition.start(); } catch(e) {}
  }
  
  // Watchdog timer: checks every 2 seconds to make sure speech recognition is active.
  if (window.speechWatchdogInterval) {
    clearInterval(window.speechWatchdogInterval);
  }
  window.speechWatchdogInterval = setInterval(() => {
    if (isListening && isMemorizeMode && !isRecognitionActive && recognition) {
      console.warn('Watchdog: Speech Recognition is inactive but isListening is true. Force restarting...');
      try {
        recognition.start();
      } catch (e) {
        console.error('Watchdog failed to restart recognition:', e);
      }
    }
  }, 2000);

  document.body.classList.remove('memorize-revealed');
  updateMicUI();
}

function stopListening() {
  if (window.speechWatchdogInterval) {
    clearInterval(window.speechWatchdogInterval);
    window.speechWatchdogInterval = null;
  }

  isListening = false;
  isRecognitionActive = false;
  if (recognition) {
    try { recognition.stop(); } catch(e) {}
  }
  lastSpeechError = null;
  speechRestartAttempts = 0;
  document.body.classList.add('memorize-revealed');
  updateMicUI();

  if (Capacitor && Capacitor.Plugins && Capacitor.Plugins.VolumeControl) {
    try {
      Capacitor.Plugins.VolumeControl.unmute();
    } catch (e) {
      console.warn('Failed to unmute system volume:', e);
    }
  }
}

function updateMicUI() {
  const btn = document.getElementById('memorize-mic-btn');
  if (!btn) return;
  
  document.body.classList.toggle('memorize-listening', isListening);
  
  if (isListening) {
    btn.classList.add('listening');
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`;
  } else {
    btn.classList.remove('listening');
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"></polygon></svg>`;
  }
}

function updateLockUI() {
  const lockBtn = document.getElementById('memorize-lock-btn');
  if (lockBtn) {
    lockBtn.textContent = isParentalLocked ? '🔒' : '🔓';
  }
}

function showPinModal(action) {
  pendingPinAction = action;
  const overlay = document.getElementById('pin-modal-overlay');
  const title = document.getElementById('pin-modal-title');
  const inputs = document.querySelectorAll('.pin-input');
  
  if (action === 'lock') {
    title.textContent = 'تعيين رمز القفل (4 أرقام)';
  } else {
    title.textContent = 'أدخل الرمز السري لفك القفل';
  }
  
  inputs.forEach(input => input.value = '');
  overlay.classList.add('active');
  setTimeout(() => inputs[0].focus(), 100);
}

function hidePinModal() {
  const overlay = document.getElementById('pin-modal-overlay');
  overlay.classList.remove('active');
  pendingPinAction = null;
}

function handlePinSubmit() {
  const pinInputs = document.querySelectorAll('.pin-input');
  const pin = Array.from(pinInputs).map(i => i.value).join('');
  if (pin.length !== 4) {
    alert('الرجاء إدخال 4 أرقام');
    return;
  }
  
  if (pendingPinAction === 'lock') {
    parentalPin = pin;
    isParentalLocked = true;
    updateLockUI();
    saveParentalLock(audioPlayer.surahNumber, currentMemorizeIndex, pin);
    hidePinModal();
  } else if (pendingPinAction === 'unlock') {
    if (pin === parentalPin) {
      isParentalLocked = false;
      updateLockUI();
      clearParentalLock();
      hidePinModal();
    } else {
      alert('الرمز السري غير صحيح');
      pinInputs.forEach(i => i.value = '');
      pinInputs[0].focus();
    }
  } else if (pendingPinAction === 'hint') {
    if (pin === parentalPin) {
      hidePinModal();
      revealAyah(currentMemorizeIndex, true);
    } else {
      alert('الرمز السري غير صحيح');
      pinInputs.forEach(i => i.value = '');
      pinInputs[0].focus();
    }
  } else if (pendingPinAction === 'exit') {
    if (pin === parentalPin) {
      hidePinModal();
      isParentalLocked = false;
      clearParentalLock();
      toggleMemorizeMode(false); // force close
    } else {
      alert('الرمز السري غير صحيح');
      pinInputs.forEach(i => i.value = '');
      pinInputs[0].focus();
    }
  } else if (pendingPinAction === 'back') {
    if (pin === parentalPin) {
      hidePinModal();
      isParentalLocked = false;
      clearParentalLock();
      location.hash = '#/quran';
    } else {
      alert('الرمز السري غير صحيح');
      pinInputs.forEach(i => i.value = '');
      pinInputs[0].focus();
    }
  }
}

function matchAyahPrefix(recentSpokenWords, targetWords) {
  recentSpokenWords = stripSpokenBismillah(recentSpokenWords, targetWords);

  let maxTargetIndexReached = 0;
  let lastSpokenIdx = -1;
  let lastSpokenMatchedSubstring = false;
  let actualWordsMatched = 0;
  
  for (let targetIdx = 0; targetIdx < targetWords.length; targetIdx++) {
    const normTarget = normalizeArabicForMatching(targetWords[targetIdx]);
    
    // Ignore empty targets
    if (normTarget.length === 0) {
      continue;
    }
    
    let found = false;
    const startIndex = Math.max(0, lastSpokenMatchedSubstring ? lastSpokenIdx : lastSpokenIdx + 1);
    const searchLimit = recentSpokenWords.length;
    
    for (let j = startIndex; j < searchLimit; j++) {
      const normSpoken = normalizeArabicForMatching(recentSpokenWords[j]);
      if (normSpoken.length === 0) continue;
      
      let wordMatched = false;
      let isSubstringMatch = false;
      
      if (normSpoken === normTarget) {
        wordMatched = true;
      } else {
        // Enforce strict exact matching for short words (< 3 chars) to prevent false positives.
        // Substring and similarity matching are only allowed for words of 3+ characters.
        if (normTarget.length >= 3) {
          if (normSpoken.includes(normTarget)) {
            wordMatched = true; 
            isSubstringMatch = true;
          } else if (normTarget.includes(normSpoken) && (normTarget.length - normSpoken.length <= 2)) {
            wordMatched = true;
          } else if (normSpoken.length >= 3 && calcSimilarity(normSpoken, normTarget) >= 0.70) {
            wordMatched = true;
          }
          
          // Concatenation check for split words (only for 3+ char targets)
          if (!wordMatched && j + 1 < searchLimit) {
            const nextNormSpoken = normalizeArabicForMatching(recentSpokenWords[j + 1] || '');
            const combined = normSpoken + nextNormSpoken;
            if (combined.includes(normTarget) || calcSimilarity(combined, normTarget) >= 0.70) {
              wordMatched = true;
              j++; 
            }
          }
        }
      }
      
      if (wordMatched) {
        maxTargetIndexReached = Math.max(maxTargetIndexReached, targetIdx + 1);
        lastSpokenIdx = j;
        lastSpokenMatchedSubstring = isSubstringMatch;
        found = true;
        actualWordsMatched++;
        break;
      }
    }
    
    if (!found) {
      break;
    }
  }
  
  return { 
    targetCount: maxTargetIndexReached, 
    spokenCount: lastSpokenIdx + 1,
    actualWordsMatched: actualWordsMatched 
  };
}

function buildSessionTargets() {
  sessionTargetWords = [];
  sessionTargetMapping = [];
  for (let i = currentMemorizeIndex; i < pageAyahs.length; i++) {
    const ayah = pageAyahs[i];
    let text = ayah.text;
    if (ayah.numberInSurah === 1 && ayah.surah.number !== 1 && ayah.surah.number !== 9) {
      text = stripBismillah(text);
    }
    const words = normalizeArabicWords(text).split(' ').filter(Boolean);
    const startIdx = (i === currentMemorizeIndex) ? revealedWordCount : 0;
    for (let w = startIdx; w < words.length; w++) {
      sessionTargetWords.push(words[w]);
      sessionTargetMapping.push({ ayahIndex: i, wordIndex: w, ayahTotalWords: words.length });
    }
  }
}

function initSpeechRecognition() {
  if (recognition) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported in this browser.');
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.lang = 'ar-EG';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  
  // Words confirmed by Google as final. Persists across mic restarts.
  // Reset ONLY on Stop or ayah completion.
  let accumulatedFinalWords = [];
  
  // Track how many e.results entries we have already finalized.
  // On each recognition restart, e.results starts fresh from index 0,
  // so we must reset this too in onstart.
  let lastFinalizedResultCount = 0;
  
  recognition.onstart = () => {
    isListening = true;
    isRecognitionActive = true;
    lastFinalizedResultCount = 0; // e.results resets each session
    buildSessionTargets();
    accumulatedFinalWords = [];
    sessionMaxTargetReached = 0;
    updateMicUI();
  };
  
  recognition.onend = () => {
    isRecognitionActive = false;
    if (isListening && isMemorizeMode) {
      setTimeout(() => {
        if (isListening && isMemorizeMode && !isRecognitionActive && recognition) {
          try {
            lastSpeechRestartTime = Date.now();
            recognition.start();
            lastSpeechError = null;
          } catch (e) {
            console.error('Failed to restart recognition:', e);
          }
        }
      }, 50);
    } else {
      isListening = false;
      updateMicUI();
    }
  };
  
  recognition.onerror = (e) => {
    console.error('Speech recognition error:', e.error);
    lastSpeechError = e.error;
    isRecognitionActive = false;
    
    const statusEl = document.getElementById('memorize-status-text');
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      alert('الرجاء السماح بالوصول إلى الميكروفون وتفعيل خدمات الكلام للتسميع.');
      stopListening();
    } else if (e.error === 'network') {
      if (statusEl) statusEl.textContent = 'خطأ في الاتصال بالشبكة. جاري محاولة إعادة الاتصال...';
      // Do not stopListening() to allow auto-restart
    } else if (e.error === 'audio-capture') {
      if (statusEl) statusEl.textContent = 'فشل الوصول إلى الميكروفون. جاري محاولة إعادة التشغيل...';
      // Do not stopListening() to allow auto-restart
    } else if (e.error === 'no-speech') {
      if (statusEl) statusEl.textContent = 'لم يتم اكتشاف صوت. جاري الاستماع...';
    }
  };
  
  recognition.onresult = (e) => {
    speechRestartAttempts = 0;
    
    // FINALS-ONLY APPROACH: We ONLY use finalized results for word reveal and ayah completion.
    // Interim results are completely ignored because Google's language model hallucinates
    // large portions of Quran text in interim transcripts, which we cannot distinguish from real speech.
    // Finalized results are much more accurate and reliable.
    
    // Collect only NEW finalized results
    let newFinalWords = [];
    let currentFinalizedCount = 0;
    
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        currentFinalizedCount++;
        if (i >= lastFinalizedResultCount) {
          const words = normalizeArabicWords(e.results[i][0].transcript).split(' ').filter(Boolean);
          newFinalWords.push(...words);
        }
      }
    }
    
    // No new finalized words — nothing to do
    if (newFinalWords.length === 0) return;
    
    lastFinalizedResultCount = currentFinalizedCount;
    accumulatedFinalWords = accumulatedFinalWords.concat(newFinalWords);
    
    if (accumulatedFinalWords.length === 0 || sessionTargetWords.length === 0) return;
    
    // Match finalized words against session targets
    const result = matchAyahPrefix(accumulatedFinalWords, sessionTargetWords);
    const matchedCount = result.targetCount;
    
    if (matchedCount <= sessionMaxTargetReached) return;
    
    sessionMaxTargetReached = matchedCount;
    const reachedDest = sessionTargetMapping[sessionMaxTargetReached - 1];
    
    // Fast-forward through any skipped ayahs (if finals jumped multiple ayahs)
    while (currentMemorizeIndex < reachedDest.ayahIndex) {
      const oldWrapper = document.getElementById(`ayah-${pageAyahs[currentMemorizeIndex].surah.number}-${pageAyahs[currentMemorizeIndex].numberInSurah}`);
      if (oldWrapper) {
        oldWrapper.querySelectorAll('.quran-word').forEach(w => {
          w.classList.remove('quran-word--hidden');
          w.classList.add('quran-word--revealed');
        });
        oldWrapper.classList.add('ayah-success-flash');
        setTimeout(() => oldWrapper.classList.remove('ayah-success-flash'), 1000);
      }
      currentMemorizeIndex++;
    }
    
    // Reveal words in the current active ayah
    revealedWordCount = reachedDest.wordIndex + 1;
    const activeWrapper = document.getElementById(`ayah-${pageAyahs[currentMemorizeIndex].surah.number}-${pageAyahs[currentMemorizeIndex].numberInSurah}`);
    if (activeWrapper) {
      const wordEls = activeWrapper.querySelectorAll('.quran-word');
      for (let idx = 0; idx < wordEls.length; idx++) {
        if (idx < revealedWordCount) {
          wordEls[idx].classList.remove('quran-word--hidden');
          wordEls[idx].classList.add('quran-word--revealed');
        } else {
          wordEls[idx].classList.add('quran-word--hidden');
          wordEls[idx].classList.remove('quran-word--revealed');
        }
      }
    }
    
    // Compute current ayah boundary
    let currentAyahMaxAllowed = 0;
    for (let i = 0; i < sessionTargetMapping.length; i++) {
      if (sessionTargetMapping[i].ayahIndex === currentMemorizeIndex) {
        currentAyahMaxAllowed = i + 1;
      } else if (sessionTargetMapping[i].ayahIndex > currentMemorizeIndex) {
        break;
      }
    }
    
    // AYAH COMPLETION: Current ayah fully matched by finalized words?
    if (matchedCount >= currentAyahMaxAllowed && currentAyahMaxAllowed > 0) {
      if (activeWrapper) {
        activeWrapper.querySelectorAll('.quran-word').forEach(w => {
          w.classList.remove('quran-word--hidden');
          w.classList.add('quran-word--revealed');
        });
        activeWrapper.classList.add('ayah-success-flash');
        setTimeout(() => activeWrapper.classList.remove('ayah-success-flash'), 1000);
        activeWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (navigator.vibrate) navigator.vibrate(80);
      }
      
      // Advance to next ayah and reset all speech state
      currentMemorizeIndex++;
      revealedWordCount = 0;
      accumulatedFinalWords = [];
      lastFinalizedResultCount = currentFinalizedCount;
      sessionMaxTargetReached = 0;
      buildSessionTargets();
    }
    
    syncMemorizeVisibility();
  };
}




function stripBismillah(text) {
  // Exact matches for Alquran.cloud API
  const exactStrings = [
    "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ",
    "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ",
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
  ];
  
  for (const str of exactStrings) {
    if (text.startsWith(str)) {
      // Return the ayah text without the basmalah, plus a space to separate from the ayah number later
      return text.substring(str.length).trim() + " "; 
    }
  }

  // Fallback if there are minor diacritic differences
  const diacritics = /[\u064B-\u065F\u0670]/;
  const clean = text.replace(/[\u064B-\u065F\u0670]/g, '');
  const normalized = clean.replace(/[\u0671\u0622\u0623\u0625]/g, 'ا').replace(/ى/g, 'ي');
  
  if (normalized.startsWith("بسم الله الرحمن الرحيم")) {
    let nonDiacriticCount = 0;
    let originalIndex = 0;
    while (nonDiacriticCount < 22 && originalIndex < text.length) {
      if (!diacritics.test(text[originalIndex])) {
        nonDiacriticCount++;
      }
      originalIndex++;
    }
    return text.substring(originalIndex).trim() + " ";
  }
  return text;
}

function showAyahMenu(clientX, clientY, ayahEl) {
  document.querySelectorAll('.mushaf-ayah').forEach(el => el.classList.remove('ayah-selected'));
  if (ayahEl) ayahEl.classList.add('ayah-selected');

  selectedAyahData = {
    surahNum: parseInt(ayahEl.dataset.surah),
    surahName: ayahEl.dataset.surahname,
    ayahNum: parseInt(ayahEl.dataset.ayah),
    text: ayahEl.dataset.text,
    el: ayahEl
  };
  
  const menu = document.getElementById('ayah-context-menu');
  if (!menu) return;
  
  const bubble = document.getElementById('ctx-bubble');
  
  // Show it first (hidden but block) to measure true width
  menu.classList.remove('hidden');
  
  if (bubble) {
    const bubbleWidth = bubble.offsetWidth || 200;
    const bubbleHeight = bubble.offsetHeight || 50;
    let left = clientX - (bubbleWidth / 2);
    let top = clientY - bubbleHeight - 12;
    
    // Bounds checking
    if (left < 15) {
      left = 15;
    } else if (left + bubbleWidth > window.innerWidth - 15) {
      left = window.innerWidth - bubbleWidth - 15;
    }
    
    if (top < 15) top = clientY + 25;
    
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }
  
  void menu.offsetWidth; // force reflow
  menu.classList.add('active');
}

function hideAyahMenu() {
  const menu = document.getElementById('ayah-context-menu');
  if (!menu) return;
  menu.classList.remove('active');
  
  document.querySelectorAll('.mushaf-ayah').forEach(el => el.classList.remove('ayah-selected'));
  
  setTimeout(() => {
    if (menu && !menu.classList.contains('active')) {
      menu.classList.add('hidden');
    }
  }, 300);
}

function initContextMenuEvents() {
  const backdrop = document.getElementById('ctx-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', hideAyahMenu);
  }
  
  const playBtn = document.getElementById('bubble-play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', async () => {
      if (selectedAyahData) {
        try {
          const surah = await getSurah(selectedAyahData.surahNum);
          // Re-init audio player with the correct surah data so URLs are correct
          audioPlayer.init(surah.ayahs, surah.number, (state) => {
            updateAudioPlayerUI(state);
          });
          
          const ayahObj = surah.ayahs.find(a => a.numberInSurah === selectedAyahData.ayahNum);
          if (ayahObj) {
            audioPlayer.playAyah(ayahObj);
          } else {
            audioPlayer.playFullSurah(surah.number);
          }
        } catch (e) {
          console.error("Error playing ayah", e);
        }
      }
      hideAyahMenu();
    });
  }
  
  const bookmarkBtn = document.getElementById('bubble-bookmark-btn');
  if (bookmarkBtn) {
    bookmarkBtn.addEventListener('click', () => {
      if (selectedAyahData) {
        const snippet = selectedAyahData.text.substring(0, 30) + '...';
        
        document.querySelectorAll('.mushaf-ayah').forEach(el => el.classList.remove('ayah-bookmarked'));
        selectedAyahData.el.classList.add('ayah-bookmarked');
        
        saveLastRead(selectedAyahData.surahNum, selectedAyahData.surahName, selectedAyahData.ayahNum, snippet);
        addBookmark(selectedAyahData.surahNum, selectedAyahData.surahName, selectedAyahData.ayahNum, snippet);
        
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      }
      hideAyahMenu();
    });
  }
}

export function cleanup() {
  audioPlayer.stop();
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  
  // Stop listening and reset memorize state
  isListening = false;
  isMemorizeMode = false;
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {}
    recognition = null;
  }

  // Restore viewport swiping styles
  const viewport = document.getElementById('mushaf-viewport');
  if (viewport) {
    viewport.style.overflowX = 'auto';
    viewport.style.scrollSnapType = 'x mandatory';
  }
  
  // Release Screen Wake Lock and cleanup visibility listener
  releaseWakeLock();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.body.classList.remove('memorize-revealed', 'memorize-listening');
}

function syncMemorizeVisibility() {
  if (!isMemorizeMode) return;
  if (!pageAyahs || pageAyahs.length === 0) {
    pageAyahs = pageCache[activePageNum] ? pageCache[activePageNum].ayahs : [];
  }
  if (!pageAyahs || pageAyahs.length === 0) return;
  
  pageAyahs.forEach((a, i) => {
    const wrapper = document.getElementById(`ayah-${a.surah.number}-${a.numberInSurah}`);
    if (!wrapper) return;
    
    if (i < currentMemorizeIndex) {
      // Past ayahs: fully visible and revealed
      wrapper.classList.remove('mushaf-ayah--hidden');
      wrapper.querySelectorAll('.quran-word').forEach(el => {
        el.classList.remove('quran-word--hidden');
        el.classList.add('quran-word--revealed');
      });
    } else if (i === currentMemorizeIndex) {
      // Current ayah: container visible, words partially hidden based on revealedWordCount
      wrapper.classList.remove('mushaf-ayah--hidden');
      const wordEls = wrapper.querySelectorAll('.quran-word');
      for (let wIdx = 0; wIdx < wordEls.length; wIdx++) {
        if (wIdx < revealedWordCount) {
          wordEls[wIdx].classList.remove('quran-word--hidden');
          wordEls[wIdx].classList.add('quran-word--revealed');
        } else {
          wordEls[wIdx].classList.add('quran-word--hidden');
          wordEls[wIdx].classList.remove('quran-word--revealed');
        }
      }
    } else {
      // Future ayahs: completely hidden container
      wrapper.classList.add('mushaf-ayah--hidden');
      wrapper.querySelectorAll('.quran-word').forEach(el => {
        el.classList.add('quran-word--hidden');
        el.classList.remove('quran-word--revealed');
      });
    }
  });
}
