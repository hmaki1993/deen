/**
 * ═══════════════════════════════════════════════
 *  دين — Quran Reader Page
 *  Verse-by-verse surah display with metadata
 *  header and automatic last-read bookmarking
 * ═══════════════════════════════════════════════
 */

import { t } from '../i18n/index.js';
import { getSurah } from '../api/quran.js';
import { saveLastRead, getLastRead, addBookmark, saveParentalLock, getParentalLock, clearParentalLock } from '../utils/storage.js';
import { formatNum } from '../utils/helpers.js';
import { audioPlayer } from '../api/audio.js';
import { renderAudioPlayer, initAudioPlayerEvents, updateAudioPlayerUI } from '../components/audio-player.js';
import { renderReciterModal, initReciterModalEvents, openReciterModal } from '../components/reciter-modal.js';

let currentSurah = null;
let selectedAyah = null;
let selectedWrapper = null;

let isMemorizeMode = false;
let currentMemorizeIndex = 0;
let recognition = null;
let isListening = false;
let isRecognitionActive = false;
let maxMatchedCountForCurrentAyah = 0;
let maxMatchedCountAtSessionStart = 0;
let consumedFinalWordsCount = 0;
let latestFinalCount = 0;
let lastRevealTime = 0;
let isParentalLocked = false;
let parentalPin = null;
let pendingPinAction = null; // 'lock', 'unlock', 'hint', 'exit', 'back'

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

function wrapWords(text) {
  return text.split(' ').map((word, idx) => {
    const colorClass = `word-color-${idx % 5}`;
    return `<span class="quran-word ${colorClass}" data-word-idx="${idx}">${word}</span>`;
  }).join(' ');
}

function normalizeArabicForMatching(text) {
  return text
    .replace(/\u0648\u0670/g, 'ا') // Replace Waw+DaggerAlef with normal Alef (e.g. صلوة -> صلاة)
    .replace(/[\u064B-\u065F\u0670\u0671\u0656-\u065E\u06D6-\u06ED]/g, '') // Remove diacritics and stop signs
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[أإآٱاء]/g, '') // Remove all forms of alef and hamza
    .replace(/ة/g, 'ه') // Normalize teh marbuta
    .replace(/ى/g, 'ي') // Normalize alef maksura
    .replace(/[\s\.\,\-\?\!]/g, '') // Remove spaces and punctuation
    .trim();
}

function normalizeArabicWords(text) {
  return text
    .replace(/\u0648\u0670/g, 'ا') // Replace Waw+DaggerAlef with normal Alef
    .replace(/[\u064B-\u065F\u0670\u0671\u0656-\u065E\u06D6-\u06ED]/g, '') // Remove diacritics and stop signs
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[أإآٱاء]/g, '') // Remove all forms of alef and hamza
    .replace(/ة/g, 'ه') // Normalize teh marbuta
    .replace(/ى/g, 'ي') // Normalize alef maksura
    .replace(/[\.\,\-\?\!\(\)\[\]﴿﴾]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Collapse multiple spaces
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


// Disjointed letters mapping (الحروف المقطعة) — module-level constant
const DISJOINTED_LETTERS_MAP = {
  "الم": ["الف لام ميم", "الف لا ميم"],
  "المر": ["الف لام ميم را", "الف لا ميم را", "الف لام ميم ر"],
  "الر": ["الف لام را", "الف لا را", "الف لام ر"],
  "حم": ["حا ميم", "ح ميم"],
  "كهيعص": ["كاف ها يا عين صاد", "كاف ه ي ع صاد"],
  "طه": ["طا ها", "ط ه"],
  "طسم": ["طا سين ميم", "ط س م"],
  "طس": ["طا سين", "ط س"],
  "يس": ["ياسين", "يا سين", "ي س"],
  "ص": ["صاد", "ص"],
  "ق": ["قاف", "ق"],
  "ن": ["نون", "ن"],
  "عسق": ["عين سين قاف", "ع س ق"]
};

/**
 * Calculate character-level similarity between two Arabic words.
 * Uses longest common subsequence ratio.
 */
function calcSimilarity(a, b) {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (longer.length === 0) return 1.0;

  let matches = 0;
  let lastMatchIdx = -1;
  for (const ch of shorter) {
    const idx = longer.indexOf(ch, lastMatchIdx + 1);
    if (idx !== -1) {
      matches++;
      lastMatchIdx = idx;
    }
  }
  return matches / longer.length;
}

/**
 * Compare spoken text against a target ayah.
 * Uses a sliding window approach to only match recent words,
 * preventing stale speech from matching future ayahs.
 * Three-layer matching: exact substring → disjointed letters → fuzzy word ratio
 */
function compareTexts(spoken, target) {
  const spokenWords = normalizeArabicWords(spoken).split(' ').filter(Boolean);
  const targetWords = normalizeArabicWords(target).split(' ').filter(Boolean);
  
  if (targetWords.length === 0) return false;

  // Sliding window: only consider the most recent spoken words
  // Margin of 3 allows for noise/extra words from background speech
  const windowSize = targetWords.length + 3;
  const recentSpokenWords = spokenWords.slice(-windowSize);

  // --- Layer 1: Exact substring match (joined characters) ---
  const normalizedRecentSpoken = normalizeArabicForMatching(recentSpokenWords.join(' '));
  const normalizedTarget = normalizeArabicForMatching(target);
  
  if (normalizedRecentSpoken.includes(normalizedTarget)) {
    return true;
  }

  // --- Layer 2: Disjointed letters (الحروف المقطعة) ---
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

  // --- Layer 3: Fuzzy word-level matching with used-index tracking ---
  let matchCount = 0;
  const usedSpokenIndices = new Set();

  for (const targetWord of targetWords) {
    let bestMatch = false;

    for (let i = 0; i < recentSpokenWords.length; i++) {
      if (usedSpokenIndices.has(i)) continue;
      const spokenWord = recentSpokenWords[i];

      if (targetWord.length >= 3) {
        // Substring match for longer words
        if (spokenWord.includes(targetWord) || targetWord.includes(spokenWord)) {
          bestMatch = true;
          usedSpokenIndices.add(i);
          break;
        }
        // Character similarity fallback for long words (≥ 4 chars)
        if (targetWord.length >= 4 && spokenWord.length >= 3) {
          const similarity = calcSimilarity(spokenWord, targetWord);
          if (similarity >= 0.7) {
            bestMatch = true;
            usedSpokenIndices.add(i);
            break;
          }
        }
      } else {
        // Exact match for short words
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
  // Short ayahs need higher accuracy, longer ones allow more tolerance
  const requiredRatio = targetWords.length <= 2 ? 0.7 : 0.55;

  return matchRatio >= requiredRatio;
}

function initSpeechRecognition() {
  if (recognition) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("التعرف على الصوت غير مدعوم في هذا المتصفح. يرجى استخدام متصفح جوجل كروم.");
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'ar-EG';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  
  recognition.onstart = () => {
    isListening = true;
    isRecognitionActive = true;
    consumedFinalWordsCount = 0;
    latestFinalCount = 0;
    maxMatchedCountAtSessionStart = maxMatchedCountForCurrentAyah;
    updateMicUI();
  };

  recognition.onend = () => {
    isRecognitionActive = false;
    if (isListening && isMemorizeMode) {
      // Auto-restart with a small delay to avoid engine conflict
      setTimeout(() => {
        if (isListening && isMemorizeMode && !isRecognitionActive && recognition) {
          try {
            recognition.start();
          } catch (e) {}
        }
      }, 100);
    } else {
      isListening = false;
      updateMicUI();
    }
  };

  recognition.onerror = (e) => {
    console.error('Speech recognition error:', e.error);
    isRecognitionActive = false;
    const statusEl = document.getElementById('memorize-status-text');
    if (e.error === 'not-allowed') {
      alert('الرجاء السماح بالوصول إلى الميكروفون للتسميع.');
      stopListening();
    } else if (e.error === 'no-speech') {
      if (statusEl) statusEl.textContent = 'لم يتم اكتشاف صوت. جاري الاستماع...';
    } else if (e.error === 'network') {
      if (statusEl) {
        statusEl.textContent = 'مشكلة في الاتصال بالشبكة. جاري محاولة إعادة الاتصال...';
      }
    }
  };

  recognition.onresult = (e) => {
    // Collect words from all alternatives for better matching
    let allFinalWords = [];
    let interimWords = [];
    let bestAlternativeWords = [];

    for (let i = 0; i < e.results.length; ++i) {
      // Primary result (best confidence)
      const primaryWords = normalizeArabicWords(e.results[i][0].transcript).split(' ').filter(Boolean);
      
      if (e.results[i].isFinal) {
        allFinalWords.push(...primaryWords);
        
        // Collect alternative transcripts for final results
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
      // Try primary transcript first — only pass final words count (NOT interim)
      const matched = checkRecitation(transcript, allFinalWords.length);
      
      // If no match and we have alternatives, try them too
      if (!matched && bestAlternativeWords.length > 0) {
        const altActiveWords = bestAlternativeWords.concat(interimWords);
        const altTranscript = altActiveWords.join(' ').trim();
        if (altTranscript) {
          checkRecitation(altTranscript, allFinalWords.length);
        }
      }
    }
  };
}

/**
 * Check if spoken transcript matches the current target ayah.
 * Returns true if a match was found and revealed.
 */
function matchAyahPrefix(recentSpokenWords, targetWords) {
  recentSpokenWords = stripSpokenBismillah(recentSpokenWords, targetWords);
  let targetIdx = 0;
  let spokenIdx = 0;

  while (targetIdx < targetWords.length && spokenIdx < recentSpokenWords.length) {
    const targetWord = targetWords[targetIdx];
    let found = false;
    
    // Lookahead up to 3 words in spoken transcript to tolerate noise/skipped words
    for (let lookahead = 0; lookahead < 3 && (spokenIdx + lookahead) < recentSpokenWords.length; lookahead++) {
      const spokenWord = recentSpokenWords[spokenIdx + lookahead];
      let wordMatched = false;
      
      if (targetWord.length >= 3) {
        if (spokenWord.includes(targetWord) || targetWord.includes(spokenWord)) {
          wordMatched = true;
        } else if (targetWord.length >= 4 && spokenWord.length >= 3) {
          const similarity = calcSimilarity(spokenWord, targetWord);
          if (similarity >= 0.7) {
            wordMatched = true;
          }
        }
      } else {
        if (spokenWord === targetWord) {
          wordMatched = true;
        }
      }
      
      if (wordMatched) {
        targetIdx++;
        spokenIdx = spokenIdx + lookahead + 1;
        found = true;
        break;
      }
    }
    
    if (!found) {
      break;
    }
  }
  return targetIdx;
}

function checkRecitation(transcript, finalCount) {
  if (!isMemorizeMode || !currentSurah) return false;
  if (currentMemorizeIndex >= currentSurah.ayahs.length) return false;

  // Cooldown: ignore matches for 800ms after a successful reveal
  if (Date.now() - lastRevealTime < 800) return false;

  // Special handling for Al-Fatiha: if expecting Ayah 1 (Bismillah) but they say Ayah 2 directly
  if (currentSurah.number === 1 && currentMemorizeIndex === 0) {
    const ayah2Text = currentSurah.ayahs[1].text;
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

  // Word-by-word matching
  const allTargetWords = normalizeArabicWords(targetText).split(' ').filter(Boolean);
  const targetWords = allTargetWords.slice(maxMatchedCountAtSessionStart);
  const spokenWords = normalizeArabicWords(transcript).split(' ').filter(Boolean);
  
  // Get window of spoken words
  const windowSize = targetWords.length + 3;
  const recentSpoken = spokenWords.slice(-windowSize);
  
  const matchedCount = matchAyahPrefix(recentSpoken, targetWords);
  
  const totalMatchedCount = maxMatchedCountAtSessionStart + matchedCount;
  
  if (totalMatchedCount > maxMatchedCountForCurrentAyah) {
    maxMatchedCountForCurrentAyah = totalMatchedCount;
  }
  
  // Update word-by-word visual reveal in the DOM for the active ayah
  const activeWrapper = document.getElementById(`ayah-${currentMemorizeIndex + 1}`);
  if (activeWrapper) {
    const wordEls = activeWrapper.querySelectorAll('.quran-word');
    wordEls.forEach((w, idx) => {
      if (idx < maxMatchedCountForCurrentAyah) {
        w.classList.remove('quran-word--hidden');
        w.classList.add('quran-word--revealed');
      } else {
        w.classList.add('quran-word--hidden');
        w.classList.remove('quran-word--revealed');
      }
    });
  }

  // If we matched all (or at least 85% of) the words, advance to next ayah
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
  if (textEl) {
    wrapper.querySelectorAll('.quran-word').forEach(w => {
      w.classList.remove('quran-word--hidden');
      w.classList.add('quran-word--revealed');
      if (isHint) {
        w.classList.add('ayah-text--hinted');
        w.style.setProperty('color', '#ff3b30', 'important');
      }
    });
    if (!isHint) {
      textEl.classList.add('ayah-success-flash');
      setTimeout(() => textEl.classList.remove('ayah-success-flash'), 1000);
    }
    lastRevealTime = Date.now();
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (navigator.vibrate) navigator.vibrate(80);
    currentMemorizeIndex++;
    maxMatchedCountForCurrentAyah = 0; // Reset match count for the next ayah
    updateMemorizeUI();
    if (currentMemorizeIndex >= currentSurah.ayahs.length) {
      celebrateCompletion();
    }
  }
}

function updateMemorizeUI() {
  const statusEl = document.getElementById('memorize-status-text');
  if (!statusEl) return;

  // Remove active highlight class from all ayah wrappers
  document.querySelectorAll('.ayah-wrapper').forEach(el => {
    el.classList.remove('ayah-active-memorize');
  });

  if (currentMemorizeIndex < currentSurah.ayahs.length) {
    statusEl.textContent = `جاري الاستماع للآية ${formatNum(currentMemorizeIndex + 1)}...`;
    
    // Add active highlight class to the current active ayah wrapper
    const activeWrapper = document.getElementById(`ayah-${currentMemorizeIndex + 1}`);
    if (activeWrapper) {
      activeWrapper.classList.add('ayah-active-memorize');
      // Scroll the active ayah smoothly to the center of the screen
      activeWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Remove blur from the active ayah text container so we can show words individually
      const textEl = activeWrapper.querySelector('.ayah-text');
      if (textEl) {
        textEl.classList.remove('ayah-text--hidden');
        textEl.classList.add('ayah-text--revealed');
      }
      
      // Hide all words initially for the active ayah (they will be revealed via checkRecitation)
      const wordEls = activeWrapper.querySelectorAll('.quran-word');
      wordEls.forEach((w, idx) => {
        if (idx < maxMatchedCountForCurrentAyah) {
          w.classList.remove('quran-word--hidden');
          w.classList.add('quran-word--revealed');
        } else {
          w.classList.add('quran-word--hidden');
          w.classList.remove('quran-word--revealed');
        }
      });
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
    alert(`الحمد لله! تم تسميع سورة ${currentSurah.name} بنجاح! 🎉`);
  }, 500);
}

async function startListening() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.warn('Microphone permission denied:', err);
      alert('يرجى السماح بالوصول إلى الميكروفون في إعدادات التطبيق لتتمكن من التسميع.');
      stopListening();
      if (isMemorizeMode) {
        toggleMemorizeMode();
      }
      return;
    }
  }

  initSpeechRecognition();
  if (recognition && !isListening) {
    isListening = true;
    try { recognition.start(); } catch(e) {}
  }
  
  // Watchdog timer: checks every 2 seconds to make sure speech recognition is active.
  if (window.quranSpeechWatchdogInterval) {
    clearInterval(window.quranSpeechWatchdogInterval);
  }
  window.quranSpeechWatchdogInterval = setInterval(() => {
    if (isListening && isMemorizeMode && !isRecognitionActive && recognition) {
      console.warn('Watchdog: Speech Recognition is inactive but isListening is true. Force restarting...');
      try {
        recognition.start();
      } catch (e) {
        console.error('Watchdog failed to restart recognition:', e);
      }
    }
  }, 2000);
  
  updateMicUI();
}

function stopListening() {
  isListening = false;
  isRecognitionActive = false;
  if (window.quranSpeechWatchdogInterval) {
    clearInterval(window.quranSpeechWatchdogInterval);
    window.quranSpeechWatchdogInterval = null;
  }
  if (recognition) {
    try { recognition.stop(); } catch(e) {}
  }
  updateMicUI();
}

function updateMicUI() {
  const btn = document.getElementById('memorize-mic-btn');
  if (!btn) return;
  if (isListening) {
    btn.classList.add('listening');
    // Show premium STOP icon
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`;
  } else {
    btn.classList.remove('listening');
    // Show premium PLAY icon
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
  const inputs = Array.from(document.querySelectorAll('.pin-input'));
  const pin = inputs.map(i => i.value).join('');
  if (pin.length !== 4) {
    alert('الرجاء إدخال 4 أرقام');
    return;
  }
  
  if (pendingPinAction === 'lock') {
    parentalPin = pin;
    isParentalLocked = true;
    saveParentalLock(pin, currentSurah.number, currentMemorizeIndex);
    updateLockUI();
    hidePinModal();
    alert('تم تفعيل وضع القفل الأبوي بنجاح');
  } else {
    // Verifying PIN
    if (pin === parentalPin) {
      const action = pendingPinAction;
      hidePinModal();
      
      if (action === 'unlock') {
        isParentalLocked = false;
        parentalPin = null;
        clearParentalLock();
        updateLockUI();
        alert('تم فك القفل بنجاح');
      } else if (action === 'hint') {
        // execute hint
        if (currentSurah && currentMemorizeIndex < currentSurah.ayahs.length) {
          consumedFinalWordsCount = latestFinalCount;
          revealAyah(currentMemorizeIndex + 1);
        }
      } else if (action === 'exit') {
        isParentalLocked = false;
        parentalPin = null;
        clearParentalLock();
        updateLockUI();
        toggleMemorizeMode(false); // force exit
      } else if (action === 'back') {
        isParentalLocked = false;
        parentalPin = null;
        clearParentalLock();
        location.hash = '#/quran';
      }
    } else {
      alert('الرمز خاطئ!');
      inputs.forEach(input => input.value = '');
      inputs[0].focus();
    }
  }
}

function toggleMemorizeMode(forceOpen = false) {
  if (isMemorizeMode && !forceOpen && isParentalLocked) {
    showPinModal('exit');
    return;
  }
  
  isMemorizeMode = forceOpen ? true : !isMemorizeMode;
  const btn = document.getElementById('btn-memorize');
  const container = document.querySelector('.ayah-container');
  const dock = document.getElementById('quran-memorize-dock');
  const player = document.getElementById('quran-audio-player');
  const btnPlay = document.getElementById('btn-play-surah');
  const btnReciter = document.getElementById('btn-reciter');
  
  if (isMemorizeMode) {
    audioPlayer.isBlocked = true;
    audioPlayer.stop();
    if (player) player.classList.add('hidden');
    if (btnPlay) btnPlay.classList.add('hidden');
    if (btnReciter) btnReciter.classList.add('hidden');
    if (btn) {
      btn.classList.add('btn--success');
      btn.classList.remove('btn--secondary');
    }
    container.classList.add('memorize-active');
    dock.classList.remove('hidden');
    
    // Check if resuming a saved session
    const savedLock = getParentalLock();
    if (savedLock && savedLock.surahNumber === currentSurah.number) {
      isParentalLocked = true;
      parentalPin = savedLock.pin;
      currentMemorizeIndex = savedLock.ayahIndex || 0;
      updateLockUI();
    } else {
      currentMemorizeIndex = 0;
    }
    
    consumedFinalWordsCount = 0;
    latestFinalCount = 0;
    maxMatchedCountForCurrentAyah = 0;
    document.querySelectorAll('.ayah-text').forEach(el => {
      el.classList.add('ayah-text--hidden');
      el.classList.remove('ayah-text--revealed');
    });
    
    // Reveal ayahs before current index if resuming
    for (let i = 0; i < currentMemorizeIndex; i++) {
      const wrapper = document.getElementById(`ayah-${i + 1}`);
      if (wrapper) {
        const textEl = wrapper.querySelector('.ayah-text');
        if (textEl) {
          textEl.classList.remove('ayah-text--hidden');
          textEl.classList.add('ayah-text--revealed');
        }
      }
    }
    
    startListening();
    updateMemorizeUI();
  } else {
    stopListening();
    audioPlayer.isBlocked = false;
    if (btnPlay) btnPlay.classList.remove('hidden');
    if (btnReciter) btnReciter.classList.remove('hidden');
    btn.classList.remove('btn--success');
    btn.classList.add('btn--secondary');
    container.classList.remove('memorize-active');
    dock.classList.add('hidden');
    document.querySelectorAll('.ayah-text').forEach(el => {
      el.classList.remove('ayah-text--hidden');
      el.classList.remove('ayah-text--revealed');
    });
    document.querySelectorAll('.ayah-wrapper').forEach(el => {
      el.classList.remove('ayah-active-memorize');
    });
  }
}

function stripBismillah(text) {
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
    return text.substring(originalIndex).trim();
  }
  return text;
}

function colorTashkeel(text) {
  return text;
}

function showAyahMenu(clientX, clientY, ayah, wrapper) {
  if (isMemorizeMode) return; // Disable context menu completely during memorization
  selectedAyah = ayah;
  selectedWrapper = wrapper;
  
  const menu = document.getElementById('ayah-context-menu');
  if (!menu) return;
  
  const bubble = document.getElementById('ctx-bubble');
  if (bubble) {
    const bubbleWidth = 160;
    const bubbleHeight = 44;
    
    let left = clientX - (bubbleWidth / 2);
    let top = clientY - bubbleHeight - 12;
    
    // Bounds check
    if (left < 10) {
      left = 10;
    } else if (left + bubbleWidth > window.innerWidth) {
      left = window.innerWidth - bubbleWidth - 10;
    }
    
    if (top < 10) {
      // Place below if there's no room above
      top = clientY + 15;
    }
    
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }
  
  menu.classList.remove('hidden');
  void menu.offsetWidth; // Trigger reflow
  menu.classList.add('active');
  
  if (window.innerWidth < 768) {
    document.body.style.overflow = 'hidden';
  }
}

function hideAyahMenu() {
  const menu = document.getElementById('ayah-context-menu');
  if (!menu) return;
  
  menu.classList.remove('active');
  document.body.style.overflow = '';
  
  setTimeout(() => {
    if (menu && !menu.classList.contains('active')) {
      menu.classList.add('hidden');
    }
  }, 300);
}

function playSelectedAyah() {
  if (selectedAyah) {
    audioPlayer.playAyah(selectedAyah);
  }
  hideAyahMenu();
}

function bookmarkSelectedAyah() {
  if (selectedAyah && selectedWrapper) {
    const localNum = selectedAyah.numberInSurah;
    let text = selectedAyah.text;
    if (currentSurah.number !== 1 && currentSurah.number !== 9 && localNum === 1) {
      text = stripBismillah(text);
    }
    const snippet = text.substring(0, 30) + '...';
    
    // Remove old bookmark styles
    document.querySelectorAll('.ayah-wrapper').forEach(el => el.classList.remove('ayah-bookmarked'));
    
    // Add new bookmark style
    const targetAyah = document.getElementById(`ayah-${localNum}`);
    if (targetAyah) {
      targetAyah.classList.add('ayah-bookmarked');
    }
    
    // Save to storage
    saveLastRead(currentSurah.number, currentSurah.name, localNum, snippet);
    addBookmark(currentSurah.number, currentSurah.name, localNum, snippet);
    
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
  }
  hideAyahMenu();
}

export async function render(container, surahNumber, targetAyahNumber = null, autoStartMemorize = false) {
  // Acquire Screen Wake Lock to keep screen on while reading/memorizing
  await requestWakeLock();
  document.addEventListener('visibilitychange', handleVisibilityChange);

  container.innerHTML = `
    <div class="page page--quran-reader fade-in">
      <div class="mushaf-header">
        <button id="quran-back-btn" class="icon-btn" aria-label="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1 class="page-title">${t('quran_title')}</h1>
        <div style="display: flex; gap: 8px;">
          <button id="btn-switch-mushaf" class="icon-btn" aria-label="Switch to Mushaf" title="${t('nav_quran')} (صفحات)">
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
    
    <!-- Ayah Context Menu Overlay -->
    <div id="ayah-context-menu" class="ayah-context-menu hidden">
      <div class="context-menu-backdrop" id="ctx-backdrop"></div>
      
      <!-- Floating Bubble Menu -->
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

  // Initialize context menu events
  const backdrop = document.getElementById('ctx-backdrop');
  backdrop?.addEventListener('click', hideAyahMenu);
  
  document.getElementById('bubble-play-btn')?.addEventListener('click', playSelectedAyah);
  document.getElementById('bubble-bookmark-btn')?.addEventListener('click', bookmarkSelectedAyah);
  
  document.getElementById('quran-back-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (isMemorizeMode && isParentalLocked) {
      showPinModal('back');
    } else {
      location.hash = '#/quran';
    }
  });

  try {
    currentSurah = await getSurah(surahNumber);
    
    // Check if there is a saved bookmark for this surah
    const lastRead = getLastRead();
    const bookmarkedAyah = targetAyahNumber || ((lastRead && lastRead.surahNumber === surahNumber) ? lastRead.ayahNumber : null);
    
    const content = document.getElementById('reader-content');
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
 
      ${currentSurah.number !== 1 && currentSurah.number !== 9 ? `<div class="bismillah">${colorTashkeel("بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ")}</div>` : ''}
      <div class="ayah-container">
        ${currentSurah.ayahs.map(ayah => {
          let text = ayah.text;
          if (currentSurah.number !== 1 && currentSurah.number !== 9 && ayah.numberInSurah === 1) {
            text = stripBismillah(text);
          }
          const wrappedText = wrapWords(text);
          return `
            <span class="ayah-wrapper ${ayah.numberInSurah === bookmarkedAyah ? 'ayah-bookmarked' : ''}" id="ayah-${ayah.numberInSurah}">
              <span class="ayah-text">${wrappedText}</span>
              <span class="ayah-number">﴿${formatNum(ayah.numberInSurah)}﴾</span>
            </span>
          `;
        }).join(' ')}
      </div>
    `;

    // Prevent default contextmenu on page element and context menu overlay
    const pageEl = container.querySelector('.page--quran-reader');
    pageEl?.addEventListener('contextmenu', (e) => e.preventDefault());
    
    const menuEl = container.querySelector('#ayah-context-menu');
    menuEl?.addEventListener('contextmenu', (e) => e.preventDefault());

    // Initialize audio player for this surah
    audioPlayer.init(currentSurah.ayahs, currentSurah.number, (state) => {
      updateAudioPlayerUI(state);
    });
    initAudioPlayerEvents();

    // Initialize modal
    initReciterModalEvents(() => {
      audioPlayer.stop();
    });
    
    // Top action buttons
    document.getElementById('btn-reciter')?.addEventListener('click', openReciterModal);
    
    document.getElementById('btn-switch-mushaf')?.addEventListener('click', () => {
      if (currentSurah) {
        location.hash = `#/quran/${currentSurah.number}`;
      }
    });

    document.getElementById('btn-play-surah')?.addEventListener('click', () => {
      audioPlayer.playFullSurah(currentSurah.number);
    });

    // PIN Modal events
    document.getElementById('pin-cancel-btn')?.addEventListener('click', hidePinModal);
    document.getElementById('pin-confirm-btn')?.addEventListener('click', handlePinSubmit);
    
    const pinInputs = document.querySelectorAll('.pin-input');
    pinInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
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

    document.getElementById('btn-memorize')?.addEventListener('click', () => toggleMemorizeMode());
    
    // Memorize dock controls
    document.getElementById('memorize-lock-btn')?.addEventListener('click', () => {
      if (isParentalLocked) {
        showPinModal('unlock');
      } else {
        showPinModal('lock');
      }
    });

    document.getElementById('memorize-mic-btn')?.addEventListener('click', () => {
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    });

    document.getElementById('memorize-hint-btn')?.addEventListener('click', () => {
      if (!isMemorizeMode || !currentSurah) return;
      if (currentMemorizeIndex < currentSurah.ayahs.length) {
        consumedFinalWordsCount = latestFinalCount;
        // Pass true to indicate it was revealed via hint
        revealAyah(currentMemorizeIndex + 1, true);
      }
    });


    // Setup long-press & right-click context menu event listeners on each Ayah wrapper
    document.querySelectorAll('.ayah-wrapper').forEach(wrapper => {
      const localNum = parseInt(wrapper.id.replace('ayah-', ''));
      const ayah = currentSurah.ayahs.find(a => a.numberInSurah === localNum);
      if (!ayah) return;
      
      let pressTimer = null;
      let touchStartX = 0;
      let touchStartY = 0;
      let isMoved = false;
      
      // Right-click event listener
      wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showAyahMenu(e.clientX || touchStartX, e.clientY || touchStartY, ayah, wrapper);
      });
      
      const handleStart = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return; // Left click only for mouse
        
        isMoved = false;
        const pointer = e.touches ? e.touches[0] : e;
        touchStartX = pointer.clientX;
        touchStartY = pointer.clientY;
        
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          if (!isMoved) {
            showAyahMenu(touchStartX, touchStartY, ayah, wrapper);
            if (navigator.vibrate) navigator.vibrate(50);
          }
        }, 500);
      };
      
      const handleMove = (e) => {
        if (!pressTimer) return;
        const pointer = e.touches ? e.touches[0] : e;
        const dx = pointer.clientX - touchStartX;
        const dy = pointer.clientY - touchStartY;
        if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
          isMoved = true;
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };
      
      const handleEnd = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };
      
      // Touch events
      wrapper.addEventListener('touchstart', handleStart, { passive: true });
      wrapper.addEventListener('touchmove', handleMove, { passive: true });
      wrapper.addEventListener('touchend', handleEnd, { passive: true });
      wrapper.addEventListener('touchcancel', handleEnd, { passive: true });
      
      // Mouse events
      wrapper.addEventListener('mousedown', handleStart);
      wrapper.addEventListener('mousemove', handleMove);
      wrapper.addEventListener('mouseup', handleEnd);
      wrapper.addEventListener('mouseleave', handleEnd);
    });

    // Scroll to bookmarked ayah if exists
    if (bookmarkedAyah) {
      setTimeout(() => {
        const target = document.getElementById(`ayah-${bookmarkedAyah}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }

    // Auto-start memorize mode if parental lock exists for this surah or autoStartMemorize is true
    const savedLock = getParentalLock();
    if ((savedLock && savedLock.surahNumber === currentSurah.number) || autoStartMemorize) {
      setTimeout(() => toggleMemorizeMode(true), 300);
    }

  } catch (err) {
    const content = document.getElementById('reader-content');
    if (content) {
      content.innerHTML = `
        <div class="error-state">
          <p>${t('error')}</p>
          <button class="btn btn--primary" onclick="location.hash='#/quran'">${t('back')}</button>
        </div>
      `;
    }
  }
}

export function cleanup() {
  audioPlayer.stop();
  hideAyahMenu();
  
  // Stop listening and reset memorize state
  isListening = false;
  isRecognitionActive = false;
  isMemorizeMode = false;
  if (window.quranSpeechWatchdogInterval) {
    clearInterval(window.quranSpeechWatchdogInterval);
    window.quranSpeechWatchdogInterval = null;
  }
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {}
    recognition = null;
  }
  
  // Release Screen Wake Lock and visibility listener
  releaseWakeLock();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}
