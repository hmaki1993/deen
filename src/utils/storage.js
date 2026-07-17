/**
 * Storage Utility
 * Namespaced localStorage wrapper with JSON serialization.
 * All keys are prefixed with 'deen-' to avoid collisions.
 */

const PREFIX = 'deen-';

/**
 * Save a value to localStorage (JSON-serialized).
 * @param {string} key - Storage key (auto-prefixed)
 * @param {*} value - Value to store
 */
export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage save failed:', e);
  }
}

/**
 * Load a value from localStorage (JSON-parsed).
 * @param {string} key - Storage key (auto-prefixed)
 * @param {*} defaultValue - Fallback if key doesn't exist or parsing fails
 * @returns {*} Parsed value or defaultValue
 */
export function load(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(PREFIX + key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Remove a value from localStorage.
 * @param {string} key - Storage key (auto-prefixed)
 */
export function remove(key) {
  localStorage.removeItem(PREFIX + key);
}

/**
 * Save the user's last-read Quran position.
 * @param {number} surahNumber - Surah number (1-114)
 * @param {string} surahName - Surah name for display
 * @param {number|null} ayahNumber - Ayah number
 * @param {string|null} ayahText - Ayah text snippet
 */
export function saveLastRead(surahNumber, surahName, ayahNumber = null, ayahText = null) {
  save('last-read', { surahNumber, surahName, ayahNumber, ayahText, timestamp: Date.now() });
}

export function getLastRead() {
  return load('last-read', null);
}

export function addBookmark(surahNumber, surahName, ayahNumber, ayahText) {
  const bookmarks = load('bookmarks', []);
  const exists = bookmarks.some(b => b.surahNumber === surahNumber && b.ayahNumber === ayahNumber);
  if (!exists) {
    bookmarks.push({ surahNumber, surahName, ayahNumber, ayahText, timestamp: Date.now() });
    save('bookmarks', bookmarks);
  }
}

export function getBookmarks() {
  return load('bookmarks', []);
}

export function removeBookmark(surahNumber, ayahNumber) {
  let bookmarks = load('bookmarks', []);
  bookmarks = bookmarks.filter(b => !(b.surahNumber === surahNumber && b.ayahNumber === ayahNumber));
  save('bookmarks', bookmarks);
}

export function setReciter(reciterId) {
  save('reciter', reciterId);
}

export function getReciter() {
  return load('reciter', 'ar.alafasy');
}

export function saveParentalLock(pin, surahNumber, ayahIndex) {
  save('parental-lock', { pin, surahNumber, ayahIndex });
}

export function getParentalLock() {
  return load('parental-lock', null);
}

export function clearParentalLock() {
  remove('parental-lock');
}
