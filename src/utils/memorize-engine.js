/**
 * Shared Voice Memorization Engine & UI Helpers
 * - Single reused AudioContext for start/stop chimes (zero AudioContext leak)
 * - Race-free SpeechRecognition lifecycle (prevents Capacitor BridgeWebChromeClient double-grant crash)
 * - Guaranteed VolumeControl.unmute() on stop, hide, and destroy
 * - Fully localized Memorize Dock & PIN Modal markup
 */

import { Capacitor } from '@capacitor/core';
import { t, getLang } from '../i18n/index.js';
import { showToast } from './toast.js';

let sharedAudioCtx = null;

function getSharedAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playRecordChime() {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 523.25, now, 0.11); // C5
    playTone(ctx, 659.25, now + 0.06, 0.11); // E5
  } catch {
    // Ignore audio errors
  }
}

export function playStopChime() {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 659.25, now, 0.11); // E5
    playTone(ctx, 523.25, now + 0.06, 0.11); // C5
  } catch {
    // Ignore audio errors
  }
}

function playTone(ctx, freq, startTime, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.04, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

export async function safeMuteMedia() {
  try {
    if (Capacitor?.Plugins?.VolumeControl) {
      await Capacitor.Plugins.VolumeControl.mute();
    }
  } catch {
    // Ignore
  }
}

export async function safeUnmuteMedia() {
  try {
    if (Capacitor?.Plugins?.VolumeControl) {
      await Capacitor.Plugins.VolumeControl.unmute();
    }
  } catch {
    // Ignore
  }
}

export function renderMemorizeDock() {
  const dir = getLang() === 'ar' ? 'rtl' : 'ltr';
  return `
    <div id="quran-memorize-dock" class="memorize-dock hidden" dir="${dir}">
      <div class="memorize-dock__info">
        <span id="memorize-status-text" class="memorize-status"></span>
      </div>
      <div class="memorize-dock__controls">
        <button id="memorize-mic-btn" class="memorize-mic-btn" aria-label="Play/Stop">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"></polygon></svg>
        </button>
      </div>
      <div class="memorize-dock__hint">
        <button id="memorize-lock-btn" class="memorize-lock-btn" aria-label="Parental Lock">🔓</button>
        <button id="memorize-hint-btn" class="memorize-hint-btn">${t('mem_hint')} 👁️</button>
      </div>
    </div>
  `;
}

export function renderPinModal() {
  const dir = getLang() === 'ar' ? 'rtl' : 'ltr';
  return `
    <div id="pin-modal-overlay" class="pin-modal-overlay" dir="${dir}">
      <div class="pin-modal">
        <h3 id="pin-modal-title">${t('mem_set_pin_title')}</h3>
        <p id="pin-modal-desc">${t('mem_pin_desc')}</p>
        <div class="pin-inputs">
          <input type="password" class="pin-input" maxlength="1" inputmode="numeric" autocomplete="off" />
          <input type="password" class="pin-input" maxlength="1" inputmode="numeric" autocomplete="off" />
          <input type="password" class="pin-input" maxlength="1" inputmode="numeric" autocomplete="off" />
          <input type="password" class="pin-input" maxlength="1" inputmode="numeric" autocomplete="off" />
        </div>
        <div class="pin-modal-actions">
          <button id="pin-cancel-btn" class="btn btn--secondary">${t('cancel')}</button>
          <button id="pin-confirm-btn" class="btn btn--primary">${t('confirm')}</button>
        </div>
      </div>
    </div>
  `;
}

export function wrapWordsInElement(el) {
  if (!el || el.dataset.wordsWrapped === 'true') return;
  const rawText = el.dataset.rawText ?? el.textContent ?? '';
  el.dataset.rawText = rawText;
  const words = rawText.trim().split(/\s+/).filter(Boolean);
  el.innerHTML = words
    .map((word, idx) => `<span class="quran-word" data-word-idx="${idx}">${word}</span>`)
    .join(' ');
  el.dataset.wordsWrapped = 'true';
}

export function unwrapWordsInElement(el) {
  if (!el || el.dataset.wordsWrapped !== 'true') return;
  if (typeof el.dataset.rawText === 'string') {
    el.textContent = el.dataset.rawText;
  }
  delete el.dataset.wordsWrapped;
}

/**
 * Create an isolated, race-free SpeechRecognition controller.
 */
export function createSpeechController({ onStart, onResult, onStatus, onStateChange }) {
  let recognition = null;
  let wanted = false;
  let active = false;
  let starting = false;
  let destroyed = false;
  let restartTimer = null;
  let watchdogTimer = null;
  let consecutiveErrors = 0;

  function clearTimers() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function safeStartRecognition() {
    if (destroyed || !wanted || active || starting || !recognition) return;
    starting = true;
    try {
      recognition.start();
    } catch {
      starting = false;
    }
  }

  function handlePageHide() {
    if (document.visibilityState === 'hidden' && wanted) {
      stop();
    }
  }

  function ensureRecognition() {
    if (recognition) return true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast(t('mem_speech_unsupported'), 'error');
      return false;
    }

    recognition = new SpeechRecognition();
    // Use Standard Classical/Modern Arabic ('ar-SA') instead of colloquial 'ar-EG'
    // for dramatically higher accuracy on Quranic vocabulary (ث / ذ / ظ / ق / الصراط)
    recognition.lang = 'ar-SA';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 4;

    recognition.onstart = () => {
      starting = false;
      active = true;
      consecutiveErrors = 0;
      if (onStart) onStart();
      if (onStateChange) onStateChange(true);
    };

    recognition.onend = () => {
      starting = false;
      active = false;
      if (!destroyed && wanted) {
        if (restartTimer) clearTimeout(restartTimer);
        const delay = Math.min(2000, 180 + consecutiveErrors * 250);
        restartTimer = setTimeout(() => {
          restartTimer = null;
          safeStartRecognition();
        }, delay);
      } else {
        if (onStateChange) onStateChange(false);
      }
    };

    recognition.onerror = (e) => {
      starting = false;
      active = false;
      consecutiveErrors++;

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        showToast(t('mem_mic_denied'), 'error', 3500);
        stop();
      } else if (e.error === 'network') {
        if (onStatus) onStatus(t('mem_net_error'));
      } else if (e.error === 'audio-capture') {
        if (onStatus) onStatus(t('mem_audio_error'));
      } else if (e.error === 'no-speech') {
        if (onStatus) onStatus(t('mem_no_speech'));
      }
    };

    recognition.onresult = (e) => {
      consecutiveErrors = 0;
      if (!destroyed && wanted && onResult) {
        onResult(e);
      }
    };

    return true;
  }

  async function start() {
    if (destroyed || wanted) return;
    if (!ensureRecognition()) return;

    wanted = true;
    document.addEventListener('visibilitychange', handlePageHide);

    // Play start chime BEFORE muting STREAM_MUSIC so its tail is never clipped!
    playRecordChime();
    await new Promise((r) => setTimeout(r, 185));
    if (destroyed || !wanted) return;

    await safeMuteMedia();
    if (destroyed || !wanted) {
      await safeUnmuteMedia();
      return;
    }

    safeStartRecognition();

    // Gentle watchdog: only nudges if neither active nor starting and no restart scheduled
    watchdogTimer = setInterval(() => {
      if (!destroyed && wanted && !active && !starting && !restartTimer) {
        safeStartRecognition();
      }
    }, 3500);

    if (onStateChange) onStateChange(true);
  }

  async function stop(withChime = false) {
    const wasWanted = wanted;
    wanted = false;
    starting = false;
    active = false;
    clearTimers();
    document.removeEventListener('visibilitychange', handlePageHide);

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Ignore
      }
    }
    if (onStateChange) onStateChange(false);

    // Unmute STREAM_MUSIC FIRST, then play stop chime so it is clearly audible on Android!
    await safeUnmuteMedia();
    if (withChime && wasWanted && !destroyed) {
      setTimeout(() => playStopChime(), 45);
    }
  }

  function destroy() {
    destroyed = true;
    stop();
    if (recognition) {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.abort();
      } catch {
        // Ignore
      }
      recognition = null;
    }
  }

  return {
    start,
    stop,
    destroy,
    isListening: () => wanted,
  };
}
