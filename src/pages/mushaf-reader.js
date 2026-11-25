/**
 * دين — Mushaf Page-by-Page Reader
 * - Smooth horizontal snap paging across all 604 pages
 * - O(1) DOM windowing via loadedPages Set (zero 604-iteration loops)
 * - Single delegated touch/click/long-press handler on viewport (zero listener duplication)
 * - Lazy word-span wrapping ONLY in Memorize Mode (90% fewer DOM nodes in reading mode)
 * - Exact ayah jump support for Last Read & Bookmarks
 * - Leak-proof observers, speech engine, WakeLock, and VolumeControl cleanup
 */

import { t, getLang } from '../i18n/index.js';
import { getPage, getSurahStartPage, getPageForAyah, getSurah, getSurahMeta } from '../api/quran.js';
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
  saveLastRead,
  addBookmark,
  saveParentalLock,
  updateParentalLockProgress,
  verifyParentalPin,
  getParentalLock,
  clearParentalLock,
} from '../utils/storage.js';
import {
  normalizeArabicWords,
  stripBismillah,
  matchAyahPrefix,
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
let activeSurahNum = 1;
let activePageNum = 1;
let pendingHighlightAyah = null; // { surahNum, ayahNum }

let visibilityObserver = null;
let preloadObserver = null;
const loadedPages = new Set();
const pageCache = new Map();
const MAX_LOCAL_PAGE_CACHE = 12;

let selectedAyahData = null;
let lastSelectedAyahEl = null;

// Memorization State
let isMemorizeMode = false;
let currentMemorizeIndex = 0;
let pageAyahs = [];
let speechController = null;
let sessionTargetWords = [];
let sessionTargetMapping = [];
let sessionMaxTargetReached = 0;
let revealedWordCount = 0;
let sessionSpokenOffset = 0;
let lastObservedSpokenCount = 0;
let lastActiveMemorizeEl = null;

// Parental Lock State
let isParentalLocked = false;
let pendingPinAction = null; // 'lock' | 'unlock' | 'hint' | 'exit' | 'back'
let autoSaveReadTimer = null;

function getLocalizedSurahTitle(surahNum) {
  const meta = getSurahMeta(surahNum);
  return getLang() === 'ar' ? meta.name : meta.englishName;
}

function syncActivePageContext(pageNum) {
  const pageData = pageCache.get(pageNum);
  if (!pageData || !Array.isArray(pageData.ayahs) || pageData.ayahs.length === 0) return;

  const hasCurrentSurah = pageData.ayahs.some((a) => a.surah.number === activeSurahNum);
  if (!hasCurrentSurah) {
    activeSurahNum = pageData.ayahs[0].surah.number;
  }

  const titleEl = document.getElementById('mushaf-surah-title');
  if (titleEl) {
    titleEl.textContent = getLocalizedSurahTitle(activeSurahNum);
  }

  if (!audioPlayer.isPlaying && audioPlayer.surahNumber !== activeSurahNum) {
    const targetSurah = activeSurahNum;
    getSurah(targetSurah)
      .then((surq) => {
        if (!isMounted || audioPlayer.isPlaying || activeSurahNum !== targetSurah) return;
        audioPlayer.init(surq.ayahs, surq.number, (state) => updateAudioPlayerUI(state));
      })
      .catch(() => {});
  }

  // Debounced auto-save of "Last Read" so reading progress is never lost on exit!
  if (autoSaveReadTimer) clearTimeout(autoSaveReadTimer);
  autoSaveReadTimer = setTimeout(() => {
    if (!isMounted || activePageNum !== pageNum) return;
    const targetAyah =
      pageData.ayahs.find((a) => a.surah.number === activeSurahNum) || pageData.ayahs[0];
    if (!targetAyah) return;
    let cleanText = targetAyah.text || '';
    if (
      targetAyah.numberInSurah === 1 &&
      targetAyah.surah.number !== 1 &&
      targetAyah.surah.number !== 9
    ) {
      cleanText = stripBismillah(cleanText);
    }
    const snippet = cleanText.length > 38 ? `${cleanText.substring(0, 38)}...` : cleanText;
    saveLastRead(
      targetAyah.surah.number,
      targetAyah.surah.name,
      targetAyah.numberInSurah,
      snippet,
      pageNum
    );
  }, 850);
}

function cachePageLocally(pageNum, data) {
  if (pageCache.has(pageNum)) pageCache.delete(pageNum);
  pageCache.set(pageNum, data);
  if (pageCache.size > MAX_LOCAL_PAGE_CACHE) {
    const oldest = pageCache.keys().next().value;
    pageCache.delete(oldest);
  }
}

export async function render(container, surahNumber, targetAyahNumber = null) {
  cleanup();
  isMounted = true;

  activeSurahNum = surahNumber || 1;
  activePageNum = getSurahStartPage(activeSurahNum);

  const initialLock = getParentalLock();
  if (!targetAyahNumber && initialLock && initialLock.surahNumber === activeSurahNum && initialLock.pageNum) {
    activePageNum = initialLock.pageNum;
  }

  pendingHighlightAyah = targetAyahNumber
    ? { surahNum: activeSurahNum, ayahNum: targetAyahNumber }
    : null;

  // Non-blocking screen wake lock
  enableWakeLock();

  const dir = getLang() === 'ar' ? 'rtl' : 'ltr';

  container.innerHTML = `
    <div class="page page--mushaf-reader page-enter">
      <div class="mushaf-header">
        <button id="quran-back-btn" class="icon-btn" aria-label="${t('back')}">
          <svg class="icon-back-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1 class="page-title" id="mushaf-surah-title">${getLocalizedSurahTitle(activeSurahNum)}</h1>
        <div class="mushaf-header__actions">
          <button id="btn-play-page" class="icon-btn" aria-label="${t('quran_play_surah')}" title="${t('quran_play_surah')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"></polygon></svg>
          </button>
          <button id="btn-view-continuous" class="icon-btn" aria-label="${t('quran_view_continuous')}" title="${t('quran_view_continuous')}">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="16" y2="18"/>
            </svg>
          </button>
          <button id="btn-switch-read" class="icon-btn" aria-label="${t('quran_memorize')}" title="${t('quran_memorize')}">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
            </svg>
          </button>
          <button id="btn-reciter" class="icon-btn" aria-label="${t('quran_reciter')}" title="${t('quran_reciter')}">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>
        </div>
      </div>

      <div class="mushaf-viewport" id="mushaf-viewport" dir="rtl">
        ${Array.from({ length: 604 }, (_, i) => `<div class="mushaf-page-container" id="page-wrapper-${i + 1}" data-page="${i + 1}"></div>`).join('')}
      </div>

      ${renderAudioPlayer()}
      ${renderReciterModal()}
      ${renderMemorizeDock()}
      ${renderPinModal()}
    </div>

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

  // Resolve exact page if jumping to a specific bookmarked / last-read ayah
  if (targetAyahNumber && targetAyahNumber > 1) {
    try {
      const exactPage = await getPageForAyah(activeSurahNum, targetAyahNumber);
      if (!isMounted) return;
      activePageNum = exactPage;
    } catch {
      // Keep surah start page
    }
  }

  bindHeaderAndModalEvents(container);
  initAudioPlayerEvents();
  initReciterModalEvents(() => audioPlayer.stop());
  initContextMenuEvents();

  // Preload surah audio metadata in background
  getSurah(activeSurahNum)
    .then((surq) => {
      if (!isMounted) return;
      if (!audioPlayer.isPlaying || audioPlayer.surahNumber !== activeSurahNum) {
        audioPlayer.init(surq.ayahs, surq.number, (state) => updateAudioPlayerUI(state));
        updateAudioPlayerUI({
          surahNumber: surq.number,
          currentAyah: null,
          isPlaying: false,
          isSurahMode: false,
        });
      }
    })
    .catch((e) => console.warn('Error preloading surah for audio:', e));

  const viewport = document.getElementById('mushaf-viewport');
  if (!viewport) return;

  setupDelegatedViewportEvents(viewport);
  setupObservers(viewport);

  // Immediately scroll to target page and trigger load
  const startWrapper = document.getElementById(`page-wrapper-${activePageNum}`);
  if (startWrapper) {
    requestAnimationFrame(() => {
      if (!isMounted) return;
      startWrapper.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'start' });
      loadPageContent(activePageNum, startWrapper);
    });
  }

  // Resume parental lock session automatically if active for this surah
  const savedLock = getParentalLock();
  if (savedLock && savedLock.surahNumber === activeSurahNum) {
    setTimeout(() => {
      if (isMounted && !isMemorizeMode) {
        toggleMemorizeMode(true);
      }
    }, 350);
  }
}

function bindHeaderAndModalEvents(container) {
  document.getElementById('quran-back-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (isMemorizeMode && isParentalLocked) {
      showPinModal('back');
    } else {
      window.location.hash = '#/quran';
    }
  });

  document.getElementById('btn-reciter')?.addEventListener('click', openReciterModal);
  document.getElementById('btn-switch-read')?.addEventListener('click', () => toggleMemorizeMode());

  document.getElementById('btn-view-continuous')?.addEventListener('click', () => {
    if (isMemorizeMode && isParentalLocked) {
      showPinModal('exit');
      return;
    }
    window.location.hash = `#/quran/${activeSurahNum}/read`;
  });

  document.getElementById('btn-play-page')?.addEventListener('click', async () => {
    if (isMemorizeMode) return;
    if (audioPlayer.isPlaying) {
      audioPlayer.togglePlay();
      return;
    }
    const pageData = pageCache.get(activePageNum);
    const startAyahOnPage =
      pageData?.ayahs?.find((a) => a.surah.number === activeSurahNum) || pageData?.ayahs?.[0];
    const targetSurahNum = startAyahOnPage?.surah?.number || activeSurahNum;
    try {
      const surah = await getSurah(targetSurahNum);
      if (!isMounted) return;
      activeSurahNum = surah.number;
      audioPlayer.init(surah.ayahs, surah.number, (state) => updateAudioPlayerUI(state));
      const ayahObj = startAyahOnPage
        ? surah.ayahs.find((a) => a.numberInSurah === startAyahOnPage.numberInSurah)
        : surah.ayahs[0];
      if (ayahObj) audioPlayer.playAyah(ayahObj);
      else audioPlayer.playFullSurah(surah.number);
    } catch (err) {
      console.warn('Error starting page audio:', err);
    }
  });

  document.getElementById('memorize-mic-btn')?.addEventListener('click', () => {
    if (speechController?.isListening()) {
      stopListening(true);
    } else {
      startListening();
    }
  });

  document.getElementById('memorize-lock-btn')?.addEventListener('click', () => {
    showPinModal(isParentalLocked ? 'unlock' : 'lock');
  });

  document.getElementById('memorize-hint-btn')?.addEventListener('click', () => {
    if (isParentalLocked) {
      showPinModal('hint');
    } else {
      revealAyah(currentMemorizeIndex, true);
    }
  });

  const pinInputs = container.querySelectorAll('.pin-input');
  pinInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
      if (e.target.value.length === 1 && index < pinInputs.length - 1) {
        pinInputs[index + 1].focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        pinInputs[index - 1].focus();
      } else if (e.key === 'Enter') {
        handlePinSubmit();
      }
    });
  });

  document.getElementById('pin-cancel-btn')?.addEventListener('click', hidePinModal);
  document.getElementById('pin-confirm-btn')?.addEventListener('click', handlePinSubmit);
}

/**
 * Single delegated listener on #mushaf-viewport — eliminates listener multiplication
 * when pages are unloaded and reloaded during DOM windowing.
 */
function setupDelegatedViewportEvents(viewport) {
  let pressTimer = null;
  let isLongPress = false;
  let touchStartPos = null;
  let touchStartTime = 0;
  let lastTouchHandledAt = 0;

  const clearLongPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  const startLongPress = (e) => {
    if (isMemorizeMode) return;
    if (e.type === 'mousedown' && e.button !== 0) return;
    const ayahEl = e.target.closest('.mushaf-ayah');
    if (!ayahEl) return;

    isLongPress = false;
    const pt = e.touches && e.touches[0] ? e.touches[0] : e;
    touchStartPos = { x: pt.clientX, y: pt.clientY };

    clearLongPress();
    pressTimer = setTimeout(() => {
      isLongPress = true;
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch {}
      }
      showAyahMenu(touchStartPos.x, touchStartPos.y, ayahEl);
    }, 480);
  };

  const handleMove = (e) => {
    if (!pressTimer || !touchStartPos) return;
    const pt = e.touches && e.touches[0] ? e.touches[0] : e;
    if (Math.hypot(pt.clientX - touchStartPos.x, pt.clientY - touchStartPos.y) > 18) {
      clearLongPress();
    }
  };

  const handleTapAction = (target) => {
    if (
      target.closest('.audio-player') ||
      target.closest('.mushaf-header') ||
      target.closest('.ayah-context-menu') ||
      target.closest('.reciter-page') ||
      target.closest('.audio-settings-card') ||
      target.closest('.memorize-dock') ||
      target.closest('.pin-modal-overlay')
    ) {
      return;
    }

    const menu = document.getElementById('ayah-context-menu');
    if (menu && !menu.classList.contains('hidden')) {
      hideAyahMenu();
      return;
    }

    if (isMemorizeMode) {
      const ayahEl = target.closest('.mushaf-ayah');
      if (ayahEl) {
        jumpMemorizeToAyahElement(ayahEl);
      }
      return;
    }

    document.body.classList.toggle('fullscreen-mushaf');
  };

  viewport.addEventListener('contextmenu', (e) => {
    if (isMemorizeMode) return;
    const ayahEl = e.target.closest('.mushaf-ayah');
    if (ayahEl) {
      e.preventDefault();
      const x = e.clientX || touchStartPos?.x || window.innerWidth / 2;
      const y = e.clientY || touchStartPos?.y || window.innerHeight / 2;
      showAyahMenu(x, y, ayahEl);
    }
  });

  viewport.addEventListener(
    'touchstart',
    (e) => {
      touchStartTime = Date.now();
      const pt = e.touches && e.touches[0];
      if (pt) touchStartPos = { x: pt.clientX, y: pt.clientY };
      startLongPress(e);
    },
    { passive: true }
  );

  viewport.addEventListener('touchmove', handleMove, { passive: true });
  viewport.addEventListener('touchcancel', clearLongPress, { passive: true });

  viewport.addEventListener(
    'touchend',
    (e) => {
      clearLongPress();
      if (isLongPress) {
        isLongPress = false;
        lastTouchHandledAt = Date.now();
        return;
      }

      const pt = e.changedTouches && e.changedTouches[0];
      const dist =
        pt && touchStartPos
          ? Math.hypot(pt.clientX - touchStartPos.x, pt.clientY - touchStartPos.y)
          : 0;
      const duration = Date.now() - touchStartTime;

      if (dist <= 15 && duration < 280) {
        lastTouchHandledAt = Date.now();
        handleTapAction(e.target);
      }
    },
    { passive: true }
  );

  viewport.addEventListener('mousedown', startLongPress);
  viewport.addEventListener('mousemove', handleMove);
  viewport.addEventListener('mouseup', clearLongPress);

  viewport.addEventListener('click', (e) => {
    // Prevent double-toggle from synthetic click fired right after touchend
    if (Date.now() - lastTouchHandledAt < 400) return;
    handleTapAction(e.target);
  });
}

function setupObservers(viewport) {
  visibilityObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.55) continue;
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (!pageNum) continue;

        const oldPageNum = activePageNum;
        activePageNum = pageNum;
        syncActivePageContext(activePageNum);

        if (isMemorizeMode && oldPageNum !== pageNum) {
          resetMemorizeForPage(activePageNum);
        }

        // O(1) DOM windowing: only inspect currently loaded pages (never loop 1..604!)
        for (const loadedPage of Array.from(loadedPages)) {
          if (Math.abs(loadedPage - activePageNum) > 4) {
            const pageEl = document.getElementById(`page-wrapper-${loadedPage}`);
            if (pageEl) {
              pageEl.innerHTML = '';
              delete pageEl.dataset.loaded;
            }
            loadedPages.delete(loadedPage);
          }
        }
      }
    },
    { root: viewport, threshold: 0.6 }
  );

  preloadObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (!pageNum) continue;

        if (entry.isIntersecting) {
          if (entry.target.dataset.loadTimer) {
            clearTimeout(parseInt(entry.target.dataset.loadTimer, 10));
          }
          entry.target.dataset.loadTimer = String(
            setTimeout(() => {
              delete entry.target.dataset.loadTimer;
              loadPageContent(pageNum, entry.target);
            }, 40)
          );
        } else if (entry.target.dataset.loadTimer) {
          clearTimeout(parseInt(entry.target.dataset.loadTimer, 10));
          delete entry.target.dataset.loadTimer;
        }
      }
    },
    { root: viewport, rootMargin: '0px 100% 0px 100%', threshold: 0.01 }
  );

  viewport.querySelectorAll('.mushaf-page-container').forEach((el) => {
    visibilityObserver.observe(el);
    preloadObserver.observe(el);
  });
}

async function loadPageContent(pageNum, wrapper) {
  if (!isMounted || !wrapper || wrapper.dataset.loaded) return;
  wrapper.dataset.loaded = 'loading';

  try {
    let pageData = pageCache.get(pageNum);
    if (!pageData) {
      pageData = await getPage(pageNum);
      if (!isMounted) return;
      cachePageLocally(pageNum, pageData);
    }

    const surahsOnPage = new Map();
    for (const ayah of pageData.ayahs) {
      if (!surahsOnPage.has(ayah.surah.number)) {
        surahsOnPage.set(ayah.surah.number, {
          surah: ayah.surah,
          ayahs: [],
        });
      }
      surahsOnPage.get(ayah.surah.number).ayahs.push(ayah);
    }

    let html = `<div class="mushaf-page-inner">`;

    if (pageData.ayahs && pageData.ayahs.length > 0) {
      const firstAyah = pageData.ayahs[0];
      const lastAyah = pageData.ayahs[pageData.ayahs.length - 1];
      // Detect mid-page Hizb/Quarter transitions so new quarters starting mid-page are shown
      const hizbQuarter = lastAyah.hizbQuarter || firstAyah.hizbQuarter;
      const juz = lastAyah.juz || firstAyah.juz;
      const hizbNum = Math.ceil(hizbQuarter / 4);
      const quarterIndex = (hizbQuarter - 1) % 4;

      const rubLabels = [
        t('quran_rub_0'),
        t('quran_rub_1'),
        t('quran_rub_2'),
        t('quran_rub_3'),
      ];
      const rubText = rubLabels[quarterIndex] || '';

      html += `
        <div class="mushaf-page-meta-header">
          <div class="meta-item meta-right">${t('quran_juz')} ${formatNum(juz)} • ${rubText}</div>
          <div class="meta-item meta-left">${t('quran_hizb')} ${formatNum(hizbNum)}</div>
        </div>
      `;
    }

    for (const surahGroup of surahsOnPage.values()) {
      const isStartOfSurah = surahGroup.ayahs.some((a) => a.numberInSurah === 1);
      const isFatiha = surahGroup.surah.number === 1;

      if (isStartOfSurah) {
        html += `
          <div class="mushaf-surah-header glass-card">
            <h2>${surahGroup.surah.name}</h2>
          </div>
        `;
        if (!isFatiha && surahGroup.surah.number !== 9) {
          html += `<div class="bismillah-mushaf">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
        }
      }

      html += `<div class="mushaf-text-container ${isFatiha ? 'mushaf-fatiha' : ''}">`;
      html += surahGroup.ayahs
        .map((ayah) => {
          let text = ayah.text;
          if (isStartOfSurah && !isFatiha && surahGroup.surah.number !== 9 && ayah.numberInSurah === 1) {
            text = stripBismillah(text);
          }
          const safeText = text.replace(/"/g, '&quot;');
          // Plain text in reading mode (90%+ fewer DOM nodes); wrapped lazily ONLY in Memorize Mode!
          return `<span class="mushaf-ayah" id="ayah-${ayah.surah.number}-${ayah.numberInSurah}" data-abs="${ayah.number}" data-surah="${ayah.surah.number}" data-surahname="${surahGroup.surah.name}" data-ayah="${ayah.numberInSurah}" data-text="${safeText}"><span class="mushaf-ayah-body">${text}</span> <span class="mushaf-ayah-num">﴿${formatNum(ayah.numberInSurah)}﴾</span></span>`;
        })
        .join(' ');
      html += `</div>`;
    }

    html += `<div class="mushaf-page-footer">${formatNum(pageNum)}</div></div>`;

    if (!isMounted) return;
    wrapper.innerHTML = html;
    wrapper.dataset.loaded = 'true';
    loadedPages.add(pageNum);

    if (pageNum === activePageNum) {
      syncActivePageContext(pageNum);
    }

    if (isMemorizeMode && pageNum === activePageNum) {
      prepareActivePageWordsForMemorize();
      syncMemorizeVisibility();
      updateMemorizeUI();
    }

    // Scroll & highlight target ayah from Last Read / Bookmark
    if (pendingHighlightAyah) {
      const targetEl = document.getElementById(
        `ayah-${pendingHighlightAyah.surahNum}-${pendingHighlightAyah.ayahNum}`
      );
      if (targetEl) {
        targetEl.classList.add('ayah-bookmarked');
        pendingHighlightAyah = null;
        requestAnimationFrame(() => {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }
  } catch (err) {
    if (!isMounted) return;
    console.error('Failed to load page', pageNum, err);
    wrapper.innerHTML = `<div class="mushaf-error">${t('quran_page_load_error')} ${formatNum(pageNum)}</div>`;
    delete wrapper.dataset.loaded;
  }
}

// ─── Memorization Mode ────────────────────────────────────────

function prepareActivePageWordsForMemorize() {
  const wrapper = document.getElementById(`page-wrapper-${activePageNum}`);
  if (!wrapper) return;
  wrapper.querySelectorAll('.mushaf-ayah-body').forEach((bodyEl) => {
    wrapWordsInElement(bodyEl);
  });
}

function unwrapAllMushafWords() {
  document.querySelectorAll('.mushaf-ayah-body[data-words-wrapped="true"]').forEach((bodyEl) => {
    unwrapWordsInElement(bodyEl);
  });
}

function resetMemorizeForPage(pageNum) {
  pageAyahs = pageCache.get(pageNum)?.ayahs || [];
  currentMemorizeIndex = 0;
  revealedWordCount = 0;
  sessionSpokenOffset = lastObservedSpokenCount;
  sessionMaxTargetReached = 0;

  prepareActivePageWordsForMemorize();
  buildSessionTargets();
  syncMemorizeVisibility();
  updateMemorizeUI();

  if (speechController?.isListening()) {
    stopListening();
    startListening();
  }
}

function jumpMemorizeToAyahElement(ayahEl) {
  const surahNum = parseInt(ayahEl.dataset.surah, 10);
  const ayahNum = parseInt(ayahEl.dataset.ayah, 10);

  if (pageAyahs.length === 0) {
    pageAyahs = pageCache.get(activePageNum)?.ayahs || [];
  }
  const idx = pageAyahs.findIndex(
    (a) => a.surah.number === surahNum && a.numberInSurah === ayahNum
  );
  if (idx < 0) return;

  currentMemorizeIndex = idx;
  revealedWordCount = 0;
  sessionSpokenOffset = lastObservedSpokenCount;
  sessionMaxTargetReached = 0;
  buildSessionTargets();

  if (speechController?.isListening()) {
    stopListening();
    startListening();
  }

  syncMemorizeVisibility();
  updateMemorizeUI();
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
  const viewport = document.getElementById('mushaf-viewport');

  pageAyahs = pageCache.get(activePageNum)?.ayahs || [];

  if (isMemorizeMode) {
    audioPlayer.isBlocked = true;
    audioPlayer.stop();
    if (player) player.classList.add('hidden');
    if (btn) btn.classList.add('icon-btn--recording');
    if (dock) dock.classList.remove('hidden');

    if (viewport) {
      viewport.style.overflowX = 'hidden';
      viewport.style.scrollSnapType = 'none';
    }

    const savedLock = getParentalLock();
    if (savedLock && savedLock.surahNumber === activeSurahNum) {
      isParentalLocked = true;
      currentMemorizeIndex = Math.min(savedLock.ayahIndex || 0, Math.max(0, pageAyahs.length - 1));
      updateLockUI();
    } else {
      currentMemorizeIndex = 0;
    }

    revealedWordCount = 0;
    sessionSpokenOffset = 0;
    lastObservedSpokenCount = 0;
    sessionMaxTargetReached = 0;

    prepareActivePageWordsForMemorize();
    buildSessionTargets();
    syncMemorizeVisibility();
    document.body.classList.remove('memorize-revealed');

    updateMicUI(false);
    updateMemorizeUI();
  } else {
    stopListening();
    audioPlayer.isBlocked = false;
    if (btn) btn.classList.remove('icon-btn--recording');
    if (dock) dock.classList.add('hidden');

    if (viewport) {
      viewport.style.overflowX = 'auto';
      viewport.style.scrollSnapType = 'x mandatory';
    }

    unwrapAllMushafWords();
    document.querySelectorAll('.mushaf-ayah').forEach((el) => {
      el.classList.remove('ayah-active-memorize', 'mushaf-ayah--hidden');
    });
    lastActiveMemorizeEl = null;
    document.body.classList.remove('memorize-revealed', 'memorize-listening');
  }
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
    const startIdx = i === currentMemorizeIndex ? revealedWordCount : 0;
    for (let w = startIdx; w < words.length; w++) {
      sessionTargetWords.push(words[w]);
      sessionTargetMapping.push({ ayahIndex: i, wordIndex: w, ayahTotalWords: words.length });
    }
  }
}

function revealAyah(index, isHint = false) {
  if (index < 0 || index >= pageAyahs.length) return;
  const targetAyah = pageAyahs[index];
  const wrapper = document.getElementById(`ayah-${targetAyah.surah.number}-${targetAyah.numberInSurah}`);
  if (!wrapper) return;

  wrapper.querySelectorAll('.quran-word').forEach((w) => {
    w.classList.remove('quran-word--hidden');
    w.classList.add('quran-word--revealed');
    if (isHint) {
      w.classList.add('ayah-text--hinted');
    }
  });

  if (!isHint) {
    wrapper.classList.add('ayah-success-flash');
    setTimeout(() => wrapper.classList.remove('ayah-success-flash'), 900);
  }

  wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (navigator.vibrate) {
    try { navigator.vibrate(60); } catch {}
  }

  currentMemorizeIndex++;
  revealedWordCount = 0;
  sessionSpokenOffset = lastObservedSpokenCount;
  sessionMaxTargetReached = 0;
  buildSessionTargets();

  if (isParentalLocked) {
    updateParentalLockProgress(currentMemorizeIndex, activePageNum);
  }

  syncMemorizeVisibility();
  updateMemorizeUI();

  if (currentMemorizeIndex >= pageAyahs.length) {
    celebrateCompletion();
  }
}

function updateMemorizeUI() {
  const statusEl = document.getElementById('memorize-status-text');
  if (!statusEl) return;

  if (lastActiveMemorizeEl) {
    lastActiveMemorizeEl.classList.remove('ayah-active-memorize');
    lastActiveMemorizeEl = null;
  }

  if (currentMemorizeIndex < pageAyahs.length) {
    const targetAyah = pageAyahs[currentMemorizeIndex];
    const listening = speechController?.isListening();
    statusEl.textContent = `${listening ? t('mem_listening_ayah') : t('mem_ready_ayah')} ${formatNum(targetAyah.numberInSurah)}...`;

    const activeWrapper = document.getElementById(
      `ayah-${targetAyah.surah.number}-${targetAyah.numberInSurah}`
    );
    if (activeWrapper) {
      activeWrapper.classList.add('ayah-active-memorize');
      lastActiveMemorizeEl = activeWrapper;
      activeWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else if (pageAyahs.length > 0) {
    statusEl.textContent = t('mem_completed');
    stopListening();
  }
}

async function celebrateCompletion() {
  const wasListening = Boolean(speechController?.isListening());
  stopListening(false);
  if (navigator.vibrate) {
    try { navigator.vibrate([80, 40, 80, 40, 160]); } catch {}
  }

  // Check if the current Surah continues onto the next Mushaf page (critical for Parental Lock!)
  const completedSurah = pageAyahs[pageAyahs.length - 1]?.surah?.number || activeSurahNum;
  if (activePageNum < 604) {
    try {
      const nextPageNum = activePageNum + 1;
      let nextPageData = pageCache.get(nextPageNum);
      if (!nextPageData) {
        nextPageData = await getPage(nextPageNum);
        if (!isMounted) return;
        cachePageLocally(nextPageNum, nextPageData);
      }

      const continuesNextPage = nextPageData?.ayahs?.some(
        (a) => a.surah.number === completedSurah
      );
      if (continuesNextPage && isMemorizeMode) {
        showToast(t('mem_next_page'), 'success', 2600);
        setTimeout(async () => {
          if (!isMounted || !isMemorizeMode) return;
          activePageNum = nextPageNum;
          const nextWrapper = document.getElementById(`page-wrapper-${nextPageNum}`);
          if (nextWrapper) {
            nextWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
            await loadPageContent(nextPageNum, nextWrapper);
          }
          if (!isMounted || !isMemorizeMode) return;
          resetMemorizeForPage(nextPageNum);
          if (isParentalLocked) {
            updateParentalLockProgress(0, nextPageNum);
          }
          if (wasListening) {
            startListening();
          }
        }, 700);
        return;
      }
    } catch {
      // Fallback to standard page completion toast
    }
  }

  showToast(isParentalLocked ? t('mem_surah_done') : t('mem_page_done'), 'success', 4000);
}

function ensureSpeechController() {
  if (speechController) return speechController;

  speechController = createSpeechController({
    onStart: () => {
      sessionSpokenOffset = 0;
      lastObservedSpokenCount = 0;
      sessionMaxTargetReached = 0;
      buildSessionTargets();
      updateMemorizeUI();
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
      if (!isMemorizeMode || sessionTargetWords.length === 0) return;

      // Combine ALL finalized + LIVE interim results for instant zero-pause reveal!
      const primaryWords = [];
      let altLastWords = null;
      let prevFinalText = '';
      let prevWasFinal = false;

      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const raw = res[0]?.transcript || '';
        const norm = normalizeArabicWords(raw);
        if (!norm) continue;

        // Guard against Android WebView emitting duplicate consecutive final entries
        if (res.isFinal && prevWasFinal && norm === prevFinalText) {
          continue;
        }
        if (res.isFinal) {
          prevFinalText = norm;
          prevWasFinal = true;
        } else {
          prevWasFinal = false;
        }

        const words = norm.split(' ').filter(Boolean);
        // Capture alternative transcript for the latest (active) speech segment
        if (i === e.results.length - 1 && res.length > 1 && res[1]?.transcript) {
          const altNorm = normalizeArabicWords(res[1].transcript);
          if (altNorm && altNorm !== norm) {
            altLastWords = primaryWords.concat(altNorm.split(' ').filter(Boolean));
          }
        }
        primaryWords.push(...words);
      }

      lastObservedSpokenCount = primaryWords.length;
      const activeSpoken = primaryWords.slice(sessionSpokenOffset);
      if (activeSpoken.length === 0) return;

      // Special case: Al-Fatiha Ayah 1 (Bismillah) skipped — user starts directly with "الحمد لله..."
      if (
        sessionMaxTargetReached === 0 &&
        currentMemorizeIndex < pageAyahs.length &&
        pageAyahs[currentMemorizeIndex]?.surah?.number === 1 &&
        pageAyahs[currentMemorizeIndex]?.numberInSurah === 1 &&
        pageAyahs[currentMemorizeIndex + 1]
      ) {
        const ayah2Words = normalizeArabicWords(pageAyahs[currentMemorizeIndex + 1].text)
          .split(' ')
          .filter(Boolean);
        const ayah2Match = matchAyahPrefix(activeSpoken, ayah2Words);
        if (ayah2Match.targetCount >= 2) {
          // Reveal Ayah 1 automatically without resetting spoken offset
          const a1 = pageAyahs[currentMemorizeIndex];
          const a1El = document.getElementById(`ayah-${a1.surah.number}-${a1.numberInSurah}`);
          a1El?.querySelectorAll('.quran-word').forEach((w) => {
            w.classList.remove('quran-word--hidden');
            w.classList.add('quran-word--revealed');
          });
          currentMemorizeIndex++;
          revealedWordCount = 0;
          sessionMaxTargetReached = 0;
          buildSessionTargets();
          syncMemorizeVisibility();
          updateMemorizeUI();
        }
      }

      let result = matchAyahPrefix(activeSpoken, sessionTargetWords);
      if (result.targetCount <= sessionMaxTargetReached && altLastWords) {
        const altActive = altLastWords.slice(sessionSpokenOffset);
        const altResult = matchAyahPrefix(altActive, sessionTargetWords);
        if (altResult.targetCount > result.targetCount) {
          result = altResult;
        }
      }

      const matchedCount = result.targetCount;
      if (matchedCount <= sessionMaxTargetReached) return;

      sessionMaxTargetReached = matchedCount;
      const reachedDest = sessionTargetMapping[sessionMaxTargetReached - 1];
      if (!reachedDest) return;

      let advancedAyah = false;

      // Complete any ayahs we moved past seamlessly in one breath
      while (currentMemorizeIndex < reachedDest.ayahIndex) {
        const prevAyah = pageAyahs[currentMemorizeIndex];
        const oldWrapper = document.getElementById(
          `ayah-${prevAyah.surah.number}-${prevAyah.numberInSurah}`
        );
        if (oldWrapper) {
          oldWrapper.querySelectorAll('.quran-word').forEach((w) => {
            w.classList.remove('quran-word--hidden');
            w.classList.add('quran-word--revealed');
          });
          oldWrapper.classList.add('ayah-success-flash');
          setTimeout(() => oldWrapper.classList.remove('ayah-success-flash'), 800);
        }
        currentMemorizeIndex++;
        advancedAyah = true;
      }

      // Reveal spoken words in current ayah IMMEDIATELY
      revealedWordCount = reachedDest.wordIndex + 1;
      const currentAyah = pageAyahs[currentMemorizeIndex];
      const activeWrapper = currentAyah
        ? document.getElementById(`ayah-${currentAyah.surah.number}-${currentAyah.numberInSurah}`)
        : null;

      if (activeWrapper) {
        const wordEls = activeWrapper.querySelectorAll('.quran-word');
        for (let idx = 0; idx < wordEls.length; idx++) {
          wordEls[idx].classList.toggle('quran-word--hidden', idx >= revealedWordCount);
          wordEls[idx].classList.toggle('quran-word--revealed', idx < revealedWordCount);
        }
      }

      // Check if current ayah is now 100% completed
      let currentAyahEndTarget = 0;
      for (let i = 0; i < sessionTargetMapping.length; i++) {
        if (sessionTargetMapping[i].ayahIndex === currentMemorizeIndex) {
          currentAyahEndTarget = i + 1;
        } else if (sessionTargetMapping[i].ayahIndex > currentMemorizeIndex) {
          break;
        }
      }

      if (matchedCount >= currentAyahEndTarget && currentAyahEndTarget > 0) {
        if (activeWrapper) {
          activeWrapper.querySelectorAll('.quran-word').forEach((w) => {
            w.classList.remove('quran-word--hidden');
            w.classList.add('quran-word--revealed');
          });
          activeWrapper.classList.add('ayah-success-flash');
          setTimeout(() => activeWrapper.classList.remove('ayah-success-flash'), 800);
        }
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch {}
        }

        // Advance to next ayah WITHOUT resetting sessionTargetWords so continuous breath works!
        currentMemorizeIndex++;
        revealedWordCount = 0;
        advancedAyah = true;
      }

      syncMemorizeVisibility();
      if (advancedAyah) {
        if (isParentalLocked) {
          updateParentalLockProgress(currentMemorizeIndex, activePageNum);
        }
        updateMemorizeUI();
        if (currentMemorizeIndex >= pageAyahs.length) {
          celebrateCompletion();
        }
      }
    },
  });

  return speechController;
}

async function startListening() {
  document.body.classList.remove('memorize-revealed');
  await ensureSpeechController().start();
}

function stopListening(withChime = false) {
  speechController?.stop(withChime);
  document.body.classList.add('memorize-revealed');
  updateMicUI(false);
}

function updateMicUI(listening) {
  const btn = document.getElementById('memorize-mic-btn');
  if (!btn) return;
  document.body.classList.toggle('memorize-listening', listening);
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
  const pinInputs = document.querySelectorAll('.pin-input');
  const pin = Array.from(pinInputs)
    .map((i) => i.value)
    .join('');

  if (pin.length !== 4) {
    showToast(t('mem_pin_4digits'), 'error');
    return;
  }

  if (pendingPinAction === 'lock') {
    isParentalLocked = true;
    updateLockUI();
    const currentSurahForLock = pageAyahs[currentMemorizeIndex]?.surah?.number || activeSurahNum;
    activeSurahNum = currentSurahForLock;
    saveParentalLock(pin, currentSurahForLock, currentMemorizeIndex, activePageNum);
    hidePinModal();
    showToast(t('mem_pin_locked'), 'success');
    return;
  }

  if (!verifyParentalPin(pin)) {
    showToast(t('mem_pin_wrong'), 'error');
    pinInputs.forEach((i) => (i.value = ''));
    pinInputs[0]?.focus();
    return;
  }

  const action = pendingPinAction;
  hidePinModal();

  if (action === 'unlock') {
    isParentalLocked = false;
    updateLockUI();
    clearParentalLock();
    showToast(t('mem_pin_unlocked'), 'success');
  } else if (action === 'hint') {
    revealAyah(currentMemorizeIndex, true);
  } else if (action === 'exit') {
    isParentalLocked = false;
    updateLockUI();
    clearParentalLock();
    toggleMemorizeMode(false);
  } else if (action === 'back') {
    isParentalLocked = false;
    clearParentalLock();
    window.location.hash = '#/quran';
  }
}

function syncMemorizeVisibility() {
  if (!isMemorizeMode) return;
  if (!pageAyahs || pageAyahs.length === 0) {
    pageAyahs = pageCache.get(activePageNum)?.ayahs || [];
  }
  if (!pageAyahs || pageAyahs.length === 0) return;

  pageAyahs.forEach((a, i) => {
    const wrapper = document.getElementById(`ayah-${a.surah.number}-${a.numberInSurah}`);
    if (!wrapper) return;

    if (i < currentMemorizeIndex) {
      wrapper.classList.remove('mushaf-ayah--hidden');
      wrapper.querySelectorAll('.quran-word').forEach((el) => {
        el.classList.remove('quran-word--hidden');
        el.classList.add('quran-word--revealed');
      });
    } else if (i === currentMemorizeIndex) {
      wrapper.classList.remove('mushaf-ayah--hidden');
      const wordEls = wrapper.querySelectorAll('.quran-word');
      for (let wIdx = 0; wIdx < wordEls.length; wIdx++) {
        wordEls[wIdx].classList.toggle('quran-word--hidden', wIdx >= revealedWordCount);
        wordEls[wIdx].classList.toggle('quran-word--revealed', wIdx < revealedWordCount);
      }
    } else {
      wrapper.classList.add('mushaf-ayah--hidden');
      wrapper.querySelectorAll('.quran-word').forEach((el) => {
        el.classList.add('quran-word--hidden');
        el.classList.remove('quran-word--revealed');
      });
    }
  });
}

// ─── Context Menu ─────────────────────────────────────────────

function showAyahMenu(clientX, clientY, ayahEl) {
  if (lastSelectedAyahEl) lastSelectedAyahEl.classList.remove('ayah-selected');
  ayahEl.classList.add('ayah-selected');
  lastSelectedAyahEl = ayahEl;

  selectedAyahData = {
    surahNum: parseInt(ayahEl.dataset.surah, 10),
    surahName: ayahEl.dataset.surahname,
    ayahNum: parseInt(ayahEl.dataset.ayah, 10),
    text: ayahEl.dataset.text || '',
    el: ayahEl,
  };

  const menu = document.getElementById('ayah-context-menu');
  const bubble = document.getElementById('ctx-bubble');
  if (!menu) return;

  menu.classList.remove('hidden');

  if (bubble) {
    const bubbleWidth = bubble.offsetWidth || 180;
    const bubbleHeight = bubble.offsetHeight || 48;
    let left = clientX - bubbleWidth / 2;
    let top = clientY - bubbleHeight - 14;

    if (left < 14) left = 14;
    else if (left + bubbleWidth > window.innerWidth - 14) {
      left = window.innerWidth - bubbleWidth - 14;
    }

    if (top < 16) top = clientY + 24;

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
  if (lastSelectedAyahEl) {
    lastSelectedAyahEl.classList.remove('ayah-selected');
    lastSelectedAyahEl = null;
  }
  setTimeout(() => {
    if (!menu.classList.contains('active')) {
      menu.classList.add('hidden');
    }
  }, 250);
}

function initContextMenuEvents() {
  document.getElementById('ctx-backdrop')?.addEventListener('click', hideAyahMenu);

  document.getElementById('bubble-play-btn')?.addEventListener('click', async () => {
    const data = selectedAyahData;
    hideAyahMenu();
    if (!data) return;
    try {
      const surah = await getSurah(data.surahNum);
      if (!isMounted) return;
      audioPlayer.init(surah.ayahs, surah.number, (state) => updateAudioPlayerUI(state));
      const ayahObj = surah.ayahs.find((a) => a.numberInSurah === data.ayahNum);
      if (ayahObj) audioPlayer.playAyah(ayahObj);
      else audioPlayer.playFullSurah(surah.number);
    } catch (e) {
      console.error('Error playing ayah', e);
    }
  });

  document.getElementById('bubble-bookmark-btn')?.addEventListener('click', () => {
    const data = selectedAyahData;
    hideAyahMenu();
    if (!data) return;

    const snippet = data.text.length > 35 ? `${data.text.substring(0, 35)}...` : data.text;
    document.querySelectorAll('.mushaf-ayah.ayah-bookmarked').forEach((el) => el.classList.remove('ayah-bookmarked'));
    data.el?.classList.add('ayah-bookmarked');

    saveLastRead(data.surahNum, data.surahName, data.ayahNum, snippet, activePageNum);
    addBookmark(data.surahNum, data.surahName, data.ayahNum, snippet);
    showToast(t('quran_bookmarked'), 'success', 2000);

    if (navigator.vibrate) {
      try { navigator.vibrate([35, 25, 35]); } catch {}
    }
  });
}

export function cleanup() {
  isMounted = false;
  audioPlayer.stop();
  closeReciterModal();

  if (visibilityObserver) {
    visibilityObserver.disconnect();
    visibilityObserver = null;
  }
  if (preloadObserver) {
    preloadObserver.disconnect();
    preloadObserver = null;
  }

  loadedPages.clear();
  pageCache.clear();

  if (speechController) {
    speechController.destroy();
    speechController = null;
  }

  if (autoSaveReadTimer) {
    clearTimeout(autoSaveReadTimer);
    autoSaveReadTimer = null;
  }

  isMemorizeMode = false;
  isParentalLocked = false;
  pendingPinAction = null;
  pageAyahs = [];
  selectedAyahData = null;
  lastSelectedAyahEl = null;
  lastActiveMemorizeEl = null;
  pendingHighlightAyah = null;

  disableWakeLock();
  document.body.classList.remove('memorize-revealed', 'memorize-listening', 'fullscreen-mushaf');
}
