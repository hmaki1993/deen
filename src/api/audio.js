import { getReciter } from '../utils/storage.js';

// Helper to remove leading and trailing silence from an AudioBuffer
function trimSilence(audioBuffer, audioCtx) {
  const channelData = audioBuffer.getChannelData(0);
  const threshold = 0.01; // 1% amplitude threshold for silence
  
  let firstNonZero = 0;
  while (firstNonZero < channelData.length && Math.abs(channelData[firstNonZero]) < threshold) {
    firstNonZero++;
  }
  
  let lastNonZero = channelData.length - 1;
  while (lastNonZero > 0 && Math.abs(channelData[lastNonZero]) < threshold) {
    lastNonZero--;
  }
  
  // Keep 15ms padding to avoid abrupt cuts (tighter for less gap between ayahs)
  const padding = Math.floor(audioBuffer.sampleRate * 0.015);
  firstNonZero = Math.max(0, firstNonZero - padding);
  lastNonZero = Math.min(channelData.length - 1, lastNonZero + padding);
  
  const newLength = lastNonZero - firstNonZero + 1;
  if (newLength >= channelData.length || newLength <= 0) {
    return audioBuffer;
  }
  
  const newBuffer = audioCtx.createBuffer(audioBuffer.numberOfChannels, newLength, audioBuffer.sampleRate);
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    newBuffer.getChannelData(c).set(audioBuffer.getChannelData(c).subarray(firstNonZero, lastNonZero + 1));
  }
  
  return newBuffer;
}

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
  { id: 'ar.alafasy-2', nameAr: 'مشاري العفاسي (نسخة 2)', nameEn: 'Mishary Alafasy (alt)' },
  { id: 'ar.husary-2', nameAr: 'محمود خليل الحصري (نسخة 2)', nameEn: 'Mahmoud Al-Husary (alt)' },
  { id: 'ar.mahermuaiqly-2', nameAr: 'ماهر المعيقلي (نسخة 2)', nameEn: 'Maher Al Muaiqly (alt)' },
  { id: 'ar.hudhaify-2', nameAr: 'علي الحذيفي (نسخة 2)', nameEn: 'Ali Al Huthaify (alt)' },
  { id: 'ar.husarymujawwad-2', nameAr: 'محمود خليل الحصري (المجود نسخة 2)', nameEn: 'Mahmoud Al-Husary (Mujawwad alt)' },
  { id: 'ar.minshawi-2', nameAr: 'محمد صديق المنشاوي (نسخة 2)', nameEn: 'Mohamed El-Minshawi (alt)' },
  { id: 'ar.muhammadayyoub-2', nameAr: 'محمد أيوب (نسخة 2)', nameEn: 'Muhammad Ayyoub (alt)' },
  { id: 'ar.muhammadjibreel-2', nameAr: 'محمد جبريل (نسخة 2)', nameEn: 'Muhammad Jibreel (alt)' }
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
  'ar.alafasy-2': 'Alafasy_128kbps',
  'ar.husary-2': 'Husary_128kbps',
  'ar.mahermuaiqly-2': 'MaherAlMuaiqly128kbps',
  'ar.hudhaify-2': 'Hudhaify_128kbps',
  'ar.husarymujawwad-2': 'Husary_Mujawwad_64kbps',
  'ar.minshawi-2': 'Minshawy_Murattal_128kbps',
  'ar.muhammadayyoub-2': 'Muhammad_Ayyoub_128kbps',
  'ar.muhammadjibreel-2': 'Muhammad_Jibreel_128kbps'
};

export function getAudioUrl(surahNumber, ayahNumberInSurah) {
  const reciterId = getReciter();
  const folder = EVERYAYAH_RECITERS[reciterId] || 'Alafasy_128kbps';
  const pad3 = (num) => String(num).padStart(3, '0');
  return `https://everyayah.com/data/${folder}/${pad3(surahNumber)}${pad3(ayahNumberInSurah)}.mp3`;
}

// Memory cache for ArrayBuffers (compressed MP3 data is small enough to keep in RAM)
const arrayBufferCache = new Map();
const activeFetches = new Map();

async function getOrFetchArrayBuffer(url) {
  if (arrayBufferCache.has(url)) {
    return arrayBufferCache.get(url).slice(0); // Return copy for decodeAudioData
  }
  if (activeFetches.has(url)) {
    const buffer = await activeFetches.get(url);
    return buffer.slice(0);
  }
  
  const promise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const buffer = await response.arrayBuffer();
      arrayBufferCache.set(url, buffer);
      
      // Limit cache size to 15 items to prevent Out of Memory crash on Mobile
      if (arrayBufferCache.size > 15) {
        const firstKey = arrayBufferCache.keys().next().value;
        arrayBufferCache.delete(firstKey);
      }
      
      return buffer.slice(0);
    } catch (e) {
      console.warn('Failed to fetch audio buffer for URL:', url, e);
      throw e;
    } finally {
      activeFetches.delete(url);
    }
  })();
  
  activeFetches.set(url, promise);
  const result = await promise;
  return result.slice(0);
}

function clearBufferCache() {
  arrayBufferCache.clear();
}

// Global audio state manager using HTMLAudioElement for pitch-preserving speed control
export const audioPlayer = {
  activeAudio: null,      // Currently playing HTMLAudioElement
  preloadedAudio: null,   // Preloaded next HTMLAudioElement
  preloadedAyah: null,    // Ayah data for the preloaded element
  
  currentAyah: null,
  surahAyahs: [],
  surahNumber: null,
  isPlaying: false,
  isSurahMode: false,
  onStateChange: null,
  isBlocked: false,
  
  // Playback speed, repeating, and range controls
  playbackRate: 1.0,
  startAyahNum: null,
  endAyahNum: null,
  ayahRepeatCount: 1,
  currentAyahPlayCount: 0,
  
  scheduleOpId: 0,
  
  init(ayahs, surahNumber, onStateChange) {
    this.surahAyahs = ayahs;
    this.surahNumber = surahNumber;
    
    // Clear old listeners to prevent memory leaks and ghost navigation
    this.listeners = [];
    
    if (onStateChange) {
      this.listeners.push(onStateChange);
    }
    this.isSurahMode = false;
  },
  
  _createAudio(url) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.preservesPitch = true;          // Standard
    audio.mozPreservesPitch = true;       // Firefox
    audio.webkitPreservesPitch = true;    // Safari / older Chrome
    audio.playbackRate = this.playbackRate;
    return audio;
  },
  
  _preloadNext(currentAyah) {
    const nextInfo = this._getNextAyahInfo(currentAyah);
    if (!nextInfo) {
      this.preloadedAudio = null;
      this.preloadedAyah = null;
      return;
    }
    
    const url = getAudioUrl(this.surahNumber, nextInfo.ayah.numberInSurah);
    this.preloadedAudio = this._createAudio(url);
    this.preloadedAyah = nextInfo.ayah;
    this.preloadedAudio.load(); // Start downloading
  },
  
  _getNextAyahInfo(currentAyah) {
    const currentIndex = this.surahAyahs.findIndex(a => a.number === currentAyah.number);
    if (currentIndex < 0) return null;
    
    // Check if we need to repeat the current ayah
    if (this.currentAyahPlayCount < this.ayahRepeatCount - 1) {
      return { ayah: currentAyah, isRepeat: true };
    }
    
    // Check if we have reached the end of our range
    if (this.endAyahNum && currentAyah.numberInSurah >= this.endAyahNum) {
      return null; // Range complete!
    }
    
    // Advance to next ayah
    const nextIndex = currentIndex + 1;
    if (nextIndex < this.surahAyahs.length) {
      return { ayah: this.surahAyahs[nextIndex], isRepeat: false };
    }
    
    return null; // End of surah
  },
  
  playFullSurah(surahNumber) {
    if (this.isBlocked) return;
    this.surahNumber = surahNumber;
    if (this.surahAyahs.length > 0) {
      const startIndex = this.startAyahNum ? Math.max(0, this.startAyahNum - 1) : 0;
      this.playAyah(this.surahAyahs[startIndex]);
    }
  },
  
  _attachPlaybackListeners(audio, currentOp) {
    let crossfadeFired = false;
    
    // Crossfade: start next ayah ~400ms before current ends
    // timeupdate fires ~4x/sec (every 250ms), so 400ms guarantees we catch it
    audio.addEventListener('timeupdate', () => {
      if (crossfadeFired) return;
      if (this.scheduleOpId !== currentOp || !this.isPlaying) return;
      if (!audio.duration || !isFinite(audio.duration)) return;
      
      const remaining = (audio.duration - audio.currentTime) / this.playbackRate;
      if (remaining <= 0.4) {
        crossfadeFired = true;
        this._advanceToNext();
      }
    });
    
    // Fallback: if timeupdate didn't fire (e.g. very short ayah), use ended
    audio.addEventListener('ended', () => {
      if (crossfadeFired) return;
      if (this.scheduleOpId !== currentOp || !this.isPlaying) return;
      crossfadeFired = true;
      this._advanceToNext();
    });
    
    // Handle real errors only (ignore cleanup-triggered errors)
    audio.addEventListener('error', () => {
      if (audio._cleaned) return; // Ignore errors from intentional cleanup
      if (crossfadeFired) return;
      if (this.scheduleOpId === currentOp && this.isPlaying) {
        crossfadeFired = true;
        setTimeout(() => {
          if (this.scheduleOpId === currentOp && this.isPlaying) {
            this._advanceToNext();
          }
        }, 300);
      }
    });
  },
  
  playAyah(ayah) {
    if (this.isBlocked) return;
    this.isSurahMode = false;
    
    // Stop any current playback
    this._stopAudio();
    
    this.currentAyah = ayah;
    this.isPlaying = true;
    this.currentAyahPlayCount = 0;
    this.scheduleOpId++;
    
    const currentOp = this.scheduleOpId;
    const url = getAudioUrl(this.surahNumber, ayah.numberInSurah);
    const audio = this._createAudio(url);
    this.activeAudio = audio;
    
    this._attachPlaybackListeners(audio, currentOp);
    
    audio.play().catch(err => {
      console.warn('Audio play failed:', err);
    });
    
    this.notify();
    
    // Preload the next ayah
    this._preloadNext(ayah);
  },
  
  _advanceToNext() {
    if (!this.isPlaying || !this.currentAyah) return;
    
    const nextInfo = this._getNextAyahInfo(this.currentAyah);
    
    if (!nextInfo) {
      // Let current audio finish naturally, then stop
      if (this.activeAudio) {
        this.activeAudio.addEventListener('ended', () => this.stop(), { once: true });
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
    
    const currentOp = this.scheduleOpId;
    this.currentAyah = nextInfo.ayah;
    this.notify();
    
    // Use preloaded audio if it matches
    let audio;
    if (this.preloadedAudio && this.preloadedAyah && this.preloadedAyah.number === nextInfo.ayah.number) {
      audio = this.preloadedAudio;
      audio.playbackRate = this.playbackRate; // Ensure latest speed
      this.preloadedAudio = null;
      this.preloadedAyah = null;
    } else {
      const url = getAudioUrl(this.surahNumber, nextInfo.ayah.numberInSurah);
      audio = this._createAudio(url);
    }
    
    // Keep reference to old audio so it finishes its last ~150ms
    const oldAudio = this.activeAudio;
    this.activeAudio = audio;
    
    this._attachPlaybackListeners(audio, currentOp);
    
    audio.play().catch(err => {
      console.warn('Audio play failed:', err);
    });
    
    // Clean up old audio after it ends
    if (oldAudio) {
      oldAudio.addEventListener('ended', () => {
        oldAudio._cleaned = true;
        oldAudio.removeAttribute('src');
        oldAudio.load();
      }, { once: true });
    }
    
    // Preload next
    this._preloadNext(nextInfo.ayah);
  },
  
  playNext() {
    if (this.isSurahMode) return;
    if (!this.currentAyah) return;
    const currentIndex = this.surahAyahs.findIndex(a => a.number === this.currentAyah.number);
    if (currentIndex >= 0 && currentIndex < this.surahAyahs.length - 1) {
      this.currentAyahPlayCount = 0;
      this.playAyah(this.surahAyahs[currentIndex + 1]);
    } else {
      this.stop();
    }
  },
  
  playPrevious() {
    if (this.isSurahMode) return;
    if (!this.currentAyah) return;
    const currentIndex = this.surahAyahs.findIndex(a => a.number === this.currentAyah.number);
    if (currentIndex > 0) {
      this.currentAyahPlayCount = 0;
      this.playAyah(this.surahAyahs[currentIndex - 1]);
    }
  },
  
  togglePlay() {
    if (this.isPlaying) {
      this.isPlaying = false;
      if (this.activeAudio) {
        this.activeAudio.pause();
      }
      this.notify();
    } else {
      if (this.activeAudio && this.currentAyah) {
        this.isPlaying = true;
        this.activeAudio.playbackRate = this.playbackRate;
        this.activeAudio.play().catch(() => {});
        this.notify();
      } else if (this.surahAyahs.length > 0) {
        this.playFullSurah(this.surahNumber);
      }
    }
  },
  
  _stopAudio() {
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio._cleaned = true;
      this.activeAudio.removeAttribute('src');
      this.activeAudio.load();
      this.activeAudio = null;
    }
    if (this.preloadedAudio) {
      this.preloadedAudio._cleaned = true;
      this.preloadedAudio.removeAttribute('src');
      this.preloadedAudio.load();
      this.preloadedAudio = null;
      this.preloadedAyah = null;
    }
  },
  
  stop() {
    this.isPlaying = false;
    this.currentAyah = null;
    this.isSurahMode = false;
    this.scheduleOpId++;
    
    this._stopAudio();
    this.notify();
  },
  
  notify() {
    if (this.listeners && this.listeners.length > 0) {
      this.listeners.forEach(listener => listener({
        isPlaying: this.isPlaying,
        currentAyah: this.currentAyah,
        isSurahMode: this.isSurahMode,
        surahNumber: this.surahNumber
      }));
    }
  },

  updateSettings({ speed, repeat, rangeStart, rangeEnd }) {
    this.playbackRate = parseFloat(speed || 1.0);
    this.ayahRepeatCount = parseInt(repeat || 1);
    this.startAyahNum = rangeStart ? parseInt(rangeStart) : null;
    this.endAyahNum = rangeEnd ? parseInt(rangeEnd) : null;
    
    // Reset repetition loop count
    this.currentAyahPlayCount = 0;
    
    // Apply speed to currently playing audio immediately
    if (this.activeAudio) {
      this.activeAudio.playbackRate = this.playbackRate;
    }
    
    // Notify UI of range changes
    this.notify();
  },
  
  resetRange() {
    this.startAyahNum = null;
    this.endAyahNum = null;
    this.currentAyahPlayCount = 0;
    
    // Notify UI
    this.notify();
  }
};
