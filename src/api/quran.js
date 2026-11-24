/**
 * Deen App — Quran API Service
 * Fetches Quran data from AlQuran Cloud API with non-blocking IndexedDB +
 * In-Memory LRU caching and in-flight request deduplication.
 */

import { SURAH_START_PAGES } from '../utils/quran-metadata.js';
import { getQuranCache, setQuranCache } from '../utils/quran-db.js';
import { normalizeArabicWords } from '../utils/arabic.js';

const BASE_URL = 'https://api.alquran.cloud/v1';
const FETCH_TIMEOUT_MS = 12000;

/** Deduplicate concurrent requests for the same resource */
const inflightRequests = new Map();

async function fetchJsonWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cachedFetch(cacheKey, url, errorLabel) {
  const cached = await getQuranCache(cacheKey);
  if (cached) return cached;

  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const req = (async () => {
    try {
      const json = await fetchJsonWithTimeout(url);
      if (json && json.code === 200 && json.data) {
        await setQuranCache(cacheKey, json.data);
        return json.data;
      }
      throw new Error(`Failed to fetch ${errorLabel}`);
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, req);
  return req;
}

export async function getSurahList() {
  return cachedFetch('surah-list', `${BASE_URL}/surah`, 'surah list');
}

export async function getSurah(number) {
  const validNum = Math.min(114, Math.max(1, parseInt(number, 10) || 1));
  return cachedFetch(
    `surah-${validNum}`,
    `${BASE_URL}/surah/${validNum}/quran-uthmani`,
    `surah ${validNum}`
  );
}

export async function getPage(number) {
  const validPage = Math.min(604, Math.max(1, parseInt(number, 10) || 1));
  return cachedFetch(
    `page-${validPage}`,
    `${BASE_URL}/page/${validPage}/quran-uthmani`,
    `page ${validPage}`
  );
}

export function getSurahStartPage(number) {
  const validNum = Math.min(114, Math.max(1, parseInt(number, 10) || 1));
  return SURAH_START_PAGES[String(validNum)] || 1;
}

/**
 * Resolve exact Mushaf page number for a given (surahNumber, ayahNumber).
 */
export async function getPageForAyah(surahNumber, ayahNumber) {
  const startPage = getSurahStartPage(surahNumber);
  if (!ayahNumber || ayahNumber <= 1) return startPage;

  try {
    const surah = await getSurah(surahNumber);
    const ayah = surah?.ayahs?.find((a) => a.numberInSurah === ayahNumber);
    if (ayah && ayah.page) return ayah.page;
  } catch {
    // Fallback to surah start page
  }
  return startPage;
}

/**
 * Normalized Arabic + English + numeric surah search (strips diacritics & unifies Alef forms).
 */
export function searchSurahs(surahs, query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return surahs;

  const qLower = trimmed.toLowerCase();
  const qNormAr = normalizeArabicWords(trimmed);

  return surahs.filter((s) => {
    if (String(s.number) === trimmed) return true;
    if (s.englishName?.toLowerCase().includes(qLower)) return true;
    if (s.englishNameTranslation?.toLowerCase().includes(qLower)) return true;
    if (s.name?.includes(trimmed)) return true;
    if (qNormAr && normalizeArabicWords(s.name).includes(qNormAr)) return true;
    return false;
  });
}
