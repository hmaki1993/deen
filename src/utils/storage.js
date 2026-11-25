/**
 * Storage Utility
 * Namespaced localStorage wrapper with JSON serialization.
 * All keys are prefixed with 'deen-' to avoid collisions.
 */

const PREFIX = 'deen-';

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage save failed:', e);
  }
}

export function load(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(PREFIX + key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore
  }
}

export function saveLastRead(surahNumber, surahName, ayahNumber = null, ayahText = null, pageNumber = null) {
  save('last-read', {
    surahNumber,
    surahName,
    ayahNumber,
    ayahText,
    pageNumber,
    timestamp: Date.now(),
  });
}

export function getLastRead() {
  return load('last-read', null);
}

export function addBookmark(surahNumber, surahName, ayahNumber, ayahText) {
  const bookmarks = load('bookmarks', []);
  const exists = bookmarks.some((b) => b.surahNumber === surahNumber && b.ayahNumber === ayahNumber);
  if (!exists) {
    bookmarks.push({ surahNumber, surahName, ayahNumber, ayahText, timestamp: Date.now() });
    save('bookmarks', bookmarks);
  }
}

export function getBookmarks() {
  return load('bookmarks', []);
}

export function removeBookmark(surahNumber, ayahNumber) {
  const bookmarks = load('bookmarks', []).filter(
    (b) => !(b.surahNumber === surahNumber && b.ayahNumber === ayahNumber)
  );
  save('bookmarks', bookmarks);
}

export function setReciter(reciterId) {
  save('reciter', reciterId);
}

export function getReciter() {
  const saved = load('reciter', 'ar.alafasy');
  // Migrate removed duplicate '-2' reciter IDs cleanly
  if (typeof saved === 'string' && saved.endsWith('-2')) {
    const cleaned = saved.slice(0, -2);
    save('reciter', cleaned);
    return cleaned;
  }
  return saved || 'ar.alafasy';
}

function hashPinSync(pin) {
  const salted = `deen-lock-v2:${String(pin)}:786`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function saveParentalLock(pin, surahNumber, ayahIndex = 0, pageNum = null) {
  const validSurah = parseInt(surahNumber, 10);
  if (!pin || String(pin).length !== 4 || !Number.isFinite(validSurah) || validSurah < 1 || validSurah > 114) {
    console.warn('Invalid parental lock data ignored');
    return;
  }
  const validPage = pageNum ? Math.min(604, Math.max(1, parseInt(pageNum, 10) || 1)) : null;
  save('parental-lock', {
    pinHash: hashPinSync(pin),
    surahNumber: validSurah,
    ayahIndex: Math.max(0, parseInt(ayahIndex, 10) || 0),
    pageNum: validPage,
  });
}

export function updateParentalLockProgress(ayahIndex, pageNum = null) {
  const current = load('parental-lock', null);
  if (!current) return;
  current.ayahIndex = Math.max(0, parseInt(ayahIndex, 10) || 0);
  if (pageNum) {
    current.pageNum = Math.min(604, Math.max(1, parseInt(pageNum, 10) || 1));
  }
  save('parental-lock', current);
}

export function verifyParentalPin(inputPin) {
  if (!inputPin || String(inputPin).length !== 4) return false;
  const data = load('parental-lock', null);
  if (!data) return false;
  if (typeof data.pinHash === 'string') {
    return data.pinHash === hashPinSync(inputPin);
  }
  if (typeof data.pin === 'string') {
    return data.pin === String(inputPin);
  }
  return false;
}

export function getParentalLock() {
  const data = load('parental-lock', null);
  if (!data) return null;
  const surahNum = parseInt(data.surahNumber, 10);
  // Migrate legacy plaintext pin to hashed format automatically
  if (typeof data.pin === 'string' && data.pin.length === 4 && !data.pinHash) {
    data.pinHash = hashPinSync(data.pin);
    delete data.pin;
    save('parental-lock', data);
  }
  if (
    typeof data.pinHash !== 'string' ||
    !Number.isFinite(surahNum) ||
    surahNum < 1 ||
    surahNum > 114
  ) {
    clearParentalLock();
    return null;
  }
  return {
    pinHash: data.pinHash,
    surahNumber: surahNum,
    ayahIndex: Math.max(0, parseInt(data.ayahIndex, 10) || 0),
    pageNum: data.pageNum ? Math.min(604, Math.max(1, parseInt(data.pageNum, 10) || 1)) : null,
  };
}

export function clearParentalLock() {
  remove('parental-lock');
}

export function isFullQuranDownloaded() {
  return Boolean(load('quran-offline-complete', false));
}

export function setFullQuranDownloaded(done) {
  save('quran-offline-complete', Boolean(done));
}

export function getPrayerNotificationsEnabled() {
  return Boolean(load('prayer-notifications-enabled', false));
}

export function setPrayerNotificationsEnabled(enabled) {
  save('prayer-notifications-enabled', Boolean(enabled));
}

// ─── Azkar Daily Progress Persistence ─────────────────────────

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getAzkarProgress(categoryId) {
  const stored = load(`azkar-progress-${categoryId}`, null);
  if (!stored || stored.date !== getTodayKey()) {
    return {};
  }
  return stored.counts || {};
}

export function saveAzkarProgress(categoryId, counts) {
  save(`azkar-progress-${categoryId}`, {
    date: getTodayKey(),
    counts,
  });
}

export function resetAzkarProgress(categoryId) {
  remove(`azkar-progress-${categoryId}`);
}
