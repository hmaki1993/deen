/**
 * ═══════════════════════════════════════════════════════════════
 * Deen App — Quran API Service
 * ═══════════════════════════════════════════════════════════════
 * Fetches Quran data from the AlQuran Cloud API (alquran.cloud)
 * with a localStorage caching layer (24-hour TTL) to minimize
 * network requests and enable offline-first behaviour.
 * ═══════════════════════════════════════════════════════════════
 */

const BASE_URL = 'https://api.alquran.cloud/v1';

import { SURAH_START_PAGES } from '../utils/quran-metadata.js';

/** Cache key prefix in localStorage */
const CACHE_KEY = 'deen-quran-cache';

/** Cache time-to-live: 24 hours in milliseconds */
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ─── Cache Helpers ────────────────────────────────────────────

/**
 * Retrieve data from the local cache if it exists and hasn't expired.
 * @param {string} key - Sub-key within the cache namespace
 * @returns {*|null} Cached data or null if miss / expired
 */
function getCache(key) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const item = cache[key];
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
      return item.data;
    }
  } catch (e) {
    /* Silently ignore corrupt cache */
  }
  return null;
}

/**
 * Persist data into the local cache with a timestamp.
 * @param {string} key  - Sub-key within the cache namespace
 * @param {*}      data - Serialisable data to store
 */
function setCache(key, data) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    cache[key] = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    /* Storage full or unavailable — continue without caching */
  }
}

// ─── API Functions ────────────────────────────────────────────

/**
 * Fetch the complete list of all 114 surahs.
 * Each surah object contains: number, name, englishName,
 * englishNameTranslation, numberOfAyahs, revelationType.
 *
 * @returns {Promise<Array>} Array of surah metadata objects
 * @throws {Error} If the API returns a non-200 status
 */
export async function getSurahList() {
  const cached = getCache('surah-list');
  if (cached) return cached;

  const res = await fetch(`${BASE_URL}/surah`);
  const json = await res.json();

  if (json.code === 200) {
    setCache('surah-list', json.data);
    return json.data;
  }

  throw new Error('Failed to fetch surah list');
}

/**
 * Fetch a single surah with Uthmani script text.
 * Returns the surah metadata plus an `ayahs` array where each
 * ayah has: number, text (Uthmani), numberInSurah, juz, page, etc.
 *
 * @param {number} number - Surah number (1–114)
 * @returns {Promise<Object>} Surah data with ayahs in Uthmani script
 * @throws {Error} If the API returns a non-200 status
 */
export async function getSurah(number) {
  const cached = getCache(`surah-${number}`);
  if (cached) return cached;

  const res = await fetch(`${BASE_URL}/surah/${number}/quran-uthmani`);
  const json = await res.json();

  if (json.code === 200) {
    setCache(`surah-${number}`, json.data);
    return json.data;
  }

  throw new Error(`Failed to fetch surah ${number}`);
}

/**
 * Fetch a single page with Uthmani script text.
 * Returns an object with the page's ayahs.
 *
 * @param {number} number - Page number (1–604)
 * @returns {Promise<Object>} Page data with ayahs
 * @throws {Error} If the API returns a non-200 status
 */
export async function getPage(number) {
  const cached = getCache(`page-${number}`);
  if (cached) return cached;

  const res = await fetch(`${BASE_URL}/page/${number}/quran-uthmani`);
  const json = await res.json();

  if (json.code === 200) {
    setCache(`page-${number}`, json.data);
    return json.data;
  }

  throw new Error(`Failed to fetch page ${number}`);
}

/**
 * Get the starting page number for a given surah.
 * 
 * @param {number} number - Surah number (1-114)
 * @returns {number} The starting page number
 */
export function getSurahStartPage(number) {
  return SURAH_START_PAGES[String(number)] || 1;
}

/**
 * Client-side search/filter across the surah list.
 * Matches against Arabic name, English name, English translation,
 * or surah number.
 *
 * @param {Array}  surahs - Full surah list from getSurahList()
 * @param {string} query  - User search input
 * @returns {Array} Filtered surah array
 */
export function searchSurahs(surahs, query) {
  if (!query) return surahs;

  const q = query.toLowerCase();

  return surahs.filter(s =>
    s.name.includes(query) ||
    s.englishName.toLowerCase().includes(q) ||
    s.englishNameTranslation.toLowerCase().includes(q) ||
    String(s.number) === query
  );
}
