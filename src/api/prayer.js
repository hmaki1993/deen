/**
 * Deen App — Prayer Times & Geolocation Service
 * Uses Capacitor Geolocation on native Android (with Web fallback),
 * caches coordinates & daily prayer schedules for instant page load,
 * and enforces fetch timeouts to prevent UI hangs on weak mobile networks.
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { save, load } from '../utils/storage.js';

const BASE_URL = 'https://api.aladhan.com/v1';
const FETCH_TIMEOUT_MS = 10000;
const LOCATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getDateKey() {
  const today = new Date();
  return `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
}

async function fetchJsonWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function getCachedLocation() {
  const cached = load('last-location', null);
  if (
    cached &&
    typeof cached.lat === 'number' &&
    typeof cached.lng === 'number' &&
    Date.now() - cached.timestamp < LOCATION_CACHE_TTL_MS
  ) {
    return { lat: cached.lat, lng: cached.lng };
  }
  return null;
}

export async function getPrayerTimes(latitude, longitude, method = 5, forceRefresh = false) {
  const date = getDateKey();
  const latKey = Number(latitude).toFixed(2);
  const lngKey = Number(longitude).toFixed(2);
  const cacheKey = `prayer-${date}-${latKey}-${lngKey}-${method}`;

  if (!forceRefresh) {
    const cached = load(cacheKey, null);
    if (cached) return cached;
  }

  const json = await fetchJsonWithTimeout(
    `${BASE_URL}/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=${method}`
  );

  if (json.code === 200 && json.data) {
    save(cacheKey, json.data);
    return json.data;
  }
  throw new Error('Failed to fetch prayer times');
}

export async function getPrayerTimesByCity(city, country, method = 5, forceRefresh = false) {
  const date = getDateKey();
  const cacheKey = `prayer-city-${date}-${city.toLowerCase()}-${country.toLowerCase()}-${method}`;

  if (!forceRefresh) {
    const cached = load(cacheKey, null);
    if (cached) return cached;
  }

  const json = await fetchJsonWithTimeout(
    `${BASE_URL}/timingsByCity/${date}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`
  );

  if (json.code === 200 && json.data) {
    save(cacheKey, json.data);
    return json.data;
  }
  throw new Error('Failed to fetch prayer times');
}

export async function getQiblaDirection(latitude, longitude) {
  const latKey = Number(latitude).toFixed(2);
  const lngKey = Number(longitude).toFixed(2);
  const cacheKey = `qibla-${latKey}-${lngKey}`;
  const cached = load(cacheKey, null);
  if (cached && typeof cached.direction === 'number') return cached;

  const json = await fetchJsonWithTimeout(`${BASE_URL}/qibla/${latitude}/${longitude}`);
  if (json.code === 200 && json.data) {
    save(cacheKey, json.data);
    return json.data;
  }
  throw new Error('Failed to fetch qibla direction');
}

/**
 * Retrieve GPS coordinates using Capacitor Geolocation on native Android,
 * with cached fast-path (unless forceRefresh = true) and Web API fallback.
 */
export async function getUserLocation(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedLocation();
    if (cached) return cached;
  }

  let coords = null;

  if (Capacitor.isNativePlatform()) {
    const perms = await Geolocation.checkPermissions();
    if (perms.location !== 'granted' && perms.coarseLocation !== 'granted') {
      const req = await Geolocation.requestPermissions();
      if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
        throw new Error('Location permission denied');
      }
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: forceRefresh ? 0 : 300000,
    });
    coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } else {
    coords = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: forceRefresh ? 0 : 300000 }
      );
    });
  }

  save('last-location', { ...coords, timestamp: Date.now() });
  return coords;
}

/**
 * Determine which prayer is coming up next (null-safe).
 */
export function getNextPrayer(timings) {
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  if (!timings) {
    return { name: 'Fajr', time: '--:--', tomorrow: false };
  }

  const now = new Date();
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  for (const prayer of prayers) {
    const raw = timings[prayer];
    if (typeof raw !== 'string') continue;
    const timeStr = raw.replace(/\s*\(.*\)/, '').trim();
    const [h, m] = timeStr.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;

    if (h * 3600 + m * 60 > nowSeconds) {
      return { name: prayer, time: timeStr, tomorrow: false };
    }
  }

  const fajrRaw = typeof timings.Fajr === 'string' ? timings.Fajr : '05:00';
  return {
    name: 'Fajr',
    time: fajrRaw.replace(/\s*\(.*\)/, '').trim(),
    tomorrow: true,
  };
}
