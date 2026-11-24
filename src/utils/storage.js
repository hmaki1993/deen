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

export function saveLastRead(surahNumber, surahName, ayahNumber = null, ayahText = null) {
  save('last-read', { surahNumber, surahName, ayahNumber, ayahText, timestamp: Date.now() });
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

export function saveParentalLock(pin, surahNumber, ayahIndex = 0) {
  const validSurah = parseInt(surahNumber, 10);
  if (!pin || String(pin).length !== 4 || !Number.isFinite(validSurah) || validSurah < 1 || validSurah > 114) {
    console.warn('Invalid parental lock data ignored');
    return;
  }
  save('parental-lock', {
    pin: String(pin),
    surahNumber: validSurah,
    ayahIndex: Math.max(0, parseInt(ayahIndex, 10) || 0),
  });
}

export function getParentalLock() {
  const data = load('parental-lock', null);
  if (!data) return null;
  const surahNum = parseInt(data.surahNumber, 10);
  // Auto-heal corrupted lock objects from earlier bug where arguments were swapped
  if (
    typeof data.pin !== 'string' ||
    data.pin.length !== 4 ||
    !Number.isFinite(surahNum) ||
    surahNum < 1 ||
    surahNum > 114
  ) {
    clearParentalLock();
    return null;
  }
  return {
    pin: data.pin,
    surahNumber: surahNum,
    ayahIndex: Math.max(0, parseInt(data.ayahIndex, 10) || 0),
  };
}

export function clearParentalLock() {
  remove('parental-lock');
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
