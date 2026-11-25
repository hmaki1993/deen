/**
 * Deen App — Quran Audio Engine
 * Clean HTMLAudioElement manager with preloading, pitch-preserving speed control,
 * ayah repetition, range playback, proper fading-audio cleanup, and bounded offline error handling.
 */

import { Capacitor } from '@capacitor/core';
import { getReciter } from '../utils/storage.js';
import { getSurahMeta } from './quran.js';
import { showToast } from '../utils/toast.js';
import { t, getLang } from '../i18n/index.js';

export const RECITERS = [
  { id: 'ar.alafasy', nameAr: 'مشاري العفاسي', nameEn: 'Mishary Alafasy' },
  { id: 'ar.abdulbasitmurattal', nameAr: 'عبد الباسط عبد الصمد (مرتل)', nameEn: 'Abdul Basit (Murattal)' },
  { id: 'ar.abdurrahmaansudais', nameAr: 'عبد الرحمن السديس', nameEn: 'Abdur-Rahmaan As-Sudais' },
  { id: 'ar.mahermuaiqly', nameAr: 'ماهر المعيقلي', nameEn: 'Maher Al Muaiqly' },
  { id: 'ar.husary', nameAr: 'محمود خليل الحصري', nameEn: 'Mahmoud Al-Husary' },
  { id: 'ar.minshawi', nameAr: 'محمد صديق المنشاوي', nameEn: 'Mohamed El-Minshawi' },
  { id: 'ar.ahmedajamy', nameAr: 'أحمد بن علي العجمي', nameEn: 'Ahmed Al-Ajamy' },
  { id: 'ar.shaatree', nameAr: 'أبو بكر الشاطري', nameEn: 'Abu Bakr Ash-Shaatree' },
  { id: 'ar.saoodshuraym', nameAr: 'سعود الشريم', nameEn: 'Saood Ash-Shuraym' },
  { id: 'ar.hudhaify', nameAr: 'علي الحذيفي', nameEn: 'Ali Al Huthaify' },
  { id: 'ar.hanirifai', nameAr: 'هاني الرفاعي', nameEn: 'Hani Ar-Rifai' },
  { id: 'ar.muhammadjibreel', nameAr: 'محمد جبريل', nameEn: 'Muhammad Jibreel' },
  { id: 'ar.abdullahbasfar', nameAr: 'عبد الله بصفر', nameEn: 'Abdullah Basfar' },
  { id: 'ar.abdulsamad', nameAr: 'عبد الباسط عبد الصمد (مجود)', nameEn: 'Abdul Basit (Mujawwad)' },
  { id: 'ar.husarymujawwad', nameAr: 'محمود خليل الحصري (المجود)', nameEn: 'Mahmoud Al-Husary (Mujawwad)' },
  { id: 'ar.husarymuallim', nameAr: 'محمود خليل الحصري (المعلم)', nameEn: 'Mahmoud Al-Husary (Teacher)' },
  { id: 'ar.ibrahimakhbar', nameAr: 'إبراهيم الأخضر', nameEn: 'Ibrahim Al-Akhdar' },
  { id: 'ar.minshawimujawwad', nameAr: 'محمد صديق المنشاوي (المجود)', nameEn: 'Mohamed El-Minshawi (Mujawwad)' },
  { id: 'ar.muhammadayyoub', nameAr: 'محمد أيوب', nameEn: 'Muhammad Ayyoub' },
  { id: 'ar.parhizgar', nameAr: 'شهريار برهيزكار', nameEn: 'Shahriar Parhizgar' },
  { id: 'ar.aymanswoaid', nameAr: 'أيمن سويد', nameEn: 'Ayman Sowaid' },
];

const EVERYAYAH_RECITERS = {
  'ar.alafasy': 'Alafasy_128kbps',
  'ar.abdulbasitmurattal': 'Abdul_Basit_Murattal_64kbps',
  'ar.abdurrahmaansudais': 'Abdurrahmaan_As-Sudais_192kbps',
  'ar.mahermuaiqly': 'MaherAlMuaiqly128kbps',
  'ar.husary': 'Husary_128kbps',
  'ar.minshawi': 'Minshawy_Murattal_128kbps',
  'ar.ahmedajamy': 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net',
  'ar.shaatree': 'Abu_Bakr_Ash-Shaatree_128kbps',
  'ar.saoodshuraym': 'Saood_ash-Shuraym_128kbps',
  'ar.hudhaify': 'Hudhaify_128kbps',
  'ar.hanirifai': 'Hani_Rifai_192kbps',
  'ar.muhammadjibreel': 'Muhammad_Jibreel_128kbps',
  'ar.abdullahbasfar': 'Abdullah_Basfar_192kbps',
  'ar.abdulsamad': 'Abdul_Basit_Mujawwad_128kbps',
  'ar.husarymujawwad': 'Husary_Mujawwad_64kbps',
  'ar.husarymuallim': 'Husary_Muallim_128kbps',
  'ar.ibrahimakhbar': 'Ibrahim_Akhdar_32kbps',
  'ar.minshawimujawwad': 'Minshawy_Mujawwad_64kbps',
  'ar.muhammadayyoub': 'Muhammad_Ayyoub_128kbps',
  'ar.parhizgar': 'Parhizgar_48kbps',
  'ar.aymanswoaid': 'Ayman_Sowaid_64kbps',
};

export function getAudioUrl(surahNumber, ayahNumberInSurah) {
  const reciterId = getReciter();
  const folder = EVERYAYAH_RECITERS[reciterId] || 'Alafasy_128kbps';
  const pad3 = (num) => String(num).padStart(3, '0');
  return `https://everyayah.com/data/${folder}/${pad3(surahNumber)}${pad3(ayahNumberInSurah)}.mp3`;
}

function disposeAudio(audio) {
  if (!audio) return;
  audio._cleaned = true;
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch {
    // Ignore cleanup errors
  }
}

export const audioPlayer = {
  activeAudio: null,
  fadingAudio: null,
  preloadedAudio: null,
  preloadedAyah: null,

  currentAyah: null,
  surahAyahs: [],
  surahNumber: null,
  isPlaying: false,
  isSurahMode: false,
  listeners: [],
  isBlocked: false,

  playbackRate: 1.0,
  startAyahNum: null,
  endAyahNum: null,
  ayahRepeatCount: 1,
  currentAyahPlayCount: 0,

  scheduleOpId: 0,
  consecutiveErrors: 0,

  init(ayahs, surahNumber, onStateChange) {
    const surahChanged = this.surahNumber !== surahNumber;
    this.surahAyahs = Array.isArray(ayahs) ? ayahs : [];
    this.surahNumber = surahNumber;

    if (surahChanged) {
      this.startAyahNum = null;
      this.endAyahNum = null;
      this.currentAyahPlayCount = 0;
    }

    this.listeners = [];
    if (onStateChange) {
      this.listeners.push(onStateChange);
    }
    this.isSurahMode = false;
  },

  _createAudio(url) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.preservesPitch = true;
    audio.mozPreservesPitch = true;
    audio.webkitPreservesPitch = true;
    audio.playbackRate = this.playbackRate;
    return audio;
  },

  _preloadNext(currentAyah) {
    disposeAudio(this.preloadedAudio);
    this.preloadedAudio = null;
    this.preloadedAyah = null;

    const nextInfo = this._getNextAyahInfo(currentAyah);
    if (!nextInfo) return;

    const url = getAudioUrl(this.surahNumber, nextInfo.ayah.numberInSurah);
    this.preloadedAudio = this._createAudio(url);
    this.preloadedAyah = nextInfo.ayah;
    this.preloadedAudio.load();
  },

  _getNextAyahInfo(currentAyah) {
    const currentIndex = this.surahAyahs.findIndex((a) => a.number === currentAyah.number);
    if (currentIndex < 0) return null;

    if (this.currentAyahPlayCount < this.ayahRepeatCount - 1) {
      return { ayah: currentAyah, isRepeat: true };
    }

    if (this.endAyahNum && currentAyah.numberInSurah >= this.endAyahNum) {
      return null;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex < this.surahAyahs.length) {
      return { ayah: this.surahAyahs[nextIndex], isRepeat: false };
    }

    return null;
  },

  playFullSurah(surahNumber) {
    if (this.isBlocked) return;
    if (surahNumber) this.surahNumber = surahNumber;
    if (this.surahAyahs.length === 0) return;

    let startIndex = 0;
    if (this.startAyahNum) {
      const idx = this.surahAyahs.findIndex((a) => a.numberInSurah === this.startAyahNum);
      startIndex = idx >= 0 ? idx : 0;
    }
    this.playAyah(this.surahAyahs[startIndex]);
  },

  _attachPlaybackListeners(audio, currentOp) {
    let settled = false;

    audio.addEventListener('playing', () => {
      this.consecutiveErrors = 0;
    });

    // Advance strictly on 'ended' (using preloadedAudio buffer) so the final
    // Tajweed madd / qalqalah syllable of each ayah is never clipped or overlapped!
    audio.addEventListener('ended', () => {
      if (settled) return;
      if (this.scheduleOpId !== currentOp || !this.isPlaying) return;
      settled = true;
      this._advanceToNext();
    });

    audio.addEventListener('error', () => {
      if (audio._cleaned || settled) return;
      if (this.scheduleOpId !== currentOp || !this.isPlaying) return;

      settled = true;
      this.consecutiveErrors++;

      // Stop runaway offline loop after 2 consecutive failures
      if (this.consecutiveErrors >= 2) {
        showToast(t('audio_error'), 'error');
        this.stop();
        return;
      }

      setTimeout(() => {
        if (this.scheduleOpId === currentOp && this.isPlaying) {
          this._advanceToNext();
        }
      }, 300);
    });
  },

  playAyah(ayah) {
    if (this.isBlocked || !ayah) return;
    this.isSurahMode = false;
    this._stopAudio();

    this.currentAyah = ayah;
    this.isPlaying = true;
    this.currentAyahPlayCount = 0;
    this.consecutiveErrors = 0;
    this.scheduleOpId++;

    const currentOp = this.scheduleOpId;
    const url = getAudioUrl(this.surahNumber, ayah.numberInSurah);
    const audio = this._createAudio(url);
    this.activeAudio = audio;

    this._attachPlaybackListeners(audio, currentOp);

    audio.play().catch((err) => {
      if (this.scheduleOpId === currentOp && !audio._cleaned) {
        console.warn('Audio play failed:', err);
        this.isPlaying = false;
        showToast(t('audio_error'), 'error');
        this.notify();
      }
    });

    this.notify();
    this._preloadNext(ayah);
  },

  _advanceToNext() {
    if (!this.isPlaying || !this.currentAyah) return;

    const nextInfo = this._getNextAyahInfo(this.currentAyah);
    const currentOp = this.scheduleOpId;

    if (!nextInfo) {
      if (this.activeAudio) {
        this.activeAudio.addEventListener(
          'ended',
          () => {
            if (this.scheduleOpId === currentOp) this.stop();
          },
          { once: true }
        );
      } else {
        this.stop();
      }
      return;
    }

    if (nextInfo.isRepeat) {
      this.currentAyahPlayCount++;
    } else {
      this.currentAyahPlayCount = 0;
    }

    this.currentAyah = nextInfo.ayah;
    this.notify();

    let audio;
    if (this.preloadedAudio && this.preloadedAyah && this.preloadedAyah.number === nextInfo.ayah.number) {
      audio = this.preloadedAudio;
      audio.playbackRate = this.playbackRate;
      this.preloadedAudio = null;
      this.preloadedAyah = null;
    } else {
      const url = getAudioUrl(this.surahNumber, nextInfo.ayah.numberInSurah);
      audio = this._createAudio(url);
    }

    // Dispose completed audio immediately before starting preloaded next ayah (zero voice overlap)
    disposeAudio(this.fadingAudio);
    this.fadingAudio = null;
    disposeAudio(this.activeAudio);
    this.activeAudio = audio;

    this._attachPlaybackListeners(audio, currentOp);

    audio.play().catch((err) => {
      if (this.scheduleOpId === currentOp && !audio._cleaned) {
        console.warn('Audio play failed:', err);
        this.isPlaying = false;
        this.notify();
      }
    });

    this._preloadNext(nextInfo.ayah);
  },

  playNext() {
    if (this.isSurahMode || !this.currentAyah) return;
    const currentIndex = this.surahAyahs.findIndex((a) => a.number === this.currentAyah.number);
    if (currentIndex >= 0 && currentIndex < this.surahAyahs.length - 1) {
      this.currentAyahPlayCount = 0;
      this.playAyah(this.surahAyahs[currentIndex + 1]);
    } else {
      this.stop();
    }
  },

  playPrevious() {
    if (this.isSurahMode || !this.currentAyah) return;
    const currentIndex = this.surahAyahs.findIndex((a) => a.number === this.currentAyah.number);
    if (currentIndex > 0) {
      this.currentAyahPlayCount = 0;
      this.playAyah(this.surahAyahs[currentIndex - 1]);
    }
  },

  togglePlay() {
    if (this.isPlaying) {
      this.isPlaying = false;
      disposeAudio(this.fadingAudio);
      this.fadingAudio = null;
      if (this.activeAudio) {
        this.activeAudio.pause();
      }
      this.notify();
    } else if (this.activeAudio && this.currentAyah) {
      this.isPlaying = true;
      this.activeAudio.playbackRate = this.playbackRate;
      this.activeAudio.play().catch(() => {
        this.isPlaying = false;
        this.notify();
      });
      this.notify();
    } else if (this.surahAyahs.length > 0) {
      this.playFullSurah(this.surahNumber);
    }
  },

  _stopAudio() {
    disposeAudio(this.fadingAudio);
    this.fadingAudio = null;
    disposeAudio(this.activeAudio);
    this.activeAudio = null;
    disposeAudio(this.preloadedAudio);
    this.preloadedAudio = null;
    this.preloadedAyah = null;
  },

  stop() {
    this.isPlaying = false;
    this.currentAyah = null;
    this.isSurahMode = false;
    this.consecutiveErrors = 0;
    this.scheduleOpId++;

    this._stopAudio();
    this.notify();
  },

  _syncMediaSessionAndBackground() {
    const lang = getLang();
    const reciterId = getReciter();
    const reciterObj = RECITERS.find((r) => r.id === reciterId) || RECITERS[0];
    const reciterName = lang === 'ar' ? reciterObj.nameAr : reciterObj.nameEn;
    const surahMeta = this.surahNumber ? getSurahMeta(this.surahNumber) : null;
    const surahTitle = surahMeta
      ? lang === 'ar'
        ? surahMeta.name
        : surahMeta.englishName
      : t('quran_title');
    const ayahLabel = this.currentAyah
      ? `${surahTitle} — ${t('quran_ayah_single')} ${this.currentAyah.numberInSurah}`
      : surahTitle;

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        if (this.currentAyah && typeof MediaMetadata !== 'undefined') {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: ayahLabel,
            artist: reciterName,
            album: t('app_name'),
          });
        }
        navigator.mediaSession.playbackState = this.isPlaying
          ? 'playing'
          : this.currentAyah
            ? 'paused'
            : 'none';

        if (!this._mediaHandlersBound) {
          this._mediaHandlersBound = true;
          navigator.mediaSession.setActionHandler('play', () => {
            if (!this.isPlaying) this.togglePlay();
          });
          navigator.mediaSession.setActionHandler('pause', () => {
            if (this.isPlaying) this.togglePlay();
          });
          navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
          navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
          navigator.mediaSession.setActionHandler('stop', () => this.stop());
        }
      } catch {
        // Ignore unsupported mediaSession handlers on older WebViews
      }
    }

    if (Capacitor.isNativePlatform() && Capacitor?.Plugins?.DeenSystem) {
      const shouldKeepAlive = Boolean(this.isPlaying && this.currentAyah);
      if (this._lastBgState !== shouldKeepAlive || this._lastBgTitle !== ayahLabel) {
        this._lastBgState = shouldKeepAlive;
        this._lastBgTitle = ayahLabel;
        Capacitor.Plugins.DeenSystem.setBackgroundAudio({
          active: shouldKeepAlive,
          title: ayahLabel,
          subtitle: reciterName,
        }).catch(() => {});
      }
    }
  },

  notify() {
    document.body.classList.toggle('audio-active', Boolean(this.currentAyah || this.isSurahMode));
    this._syncMediaSessionAndBackground();
    if (this.listeners && this.listeners.length > 0) {
      const snapshot = {
        isPlaying: this.isPlaying,
        currentAyah: this.currentAyah,
        isSurahMode: this.isSurahMode,
        surahNumber: this.surahNumber,
      };
      this.listeners.forEach((listener) => listener(snapshot));
    }
  },

  updateSettings({ speed, repeat, rangeStart, rangeEnd }) {
    this.playbackRate = parseFloat(speed || 1.0) || 1.0;
    this.ayahRepeatCount = parseInt(repeat || 1, 10) || 1;
    this.startAyahNum = rangeStart ? parseInt(rangeStart, 10) : null;
    this.endAyahNum = rangeEnd ? parseInt(rangeEnd, 10) : null;
    this.currentAyahPlayCount = 0;

    if (this.activeAudio) {
      this.activeAudio.playbackRate = this.playbackRate;
    }
    if (this.preloadedAudio) {
      this.preloadedAudio.playbackRate = this.playbackRate;
    }
    this.notify();
  },

  resetRange() {
    this.startAyahNum = null;
    this.endAyahNum = null;
    this.playbackRate = 1.0;
    this.ayahRepeatCount = 1;
    this.currentAyahPlayCount = 0;
    if (this.activeAudio) {
      this.activeAudio.playbackRate = 1.0;
    }
    this.notify();
  },
};
