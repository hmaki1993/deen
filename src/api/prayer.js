/**
 * Deen App — Prayer Times & Geolocation Service
 * Uses Capacitor Geolocation on native Android (with Web fallback),
 * caches coordinates & daily prayer schedules for instant page load,
 * and enforces fetch timeouts to prevent UI hangs on weak mobile networks.
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  save,
  load,
  getPrayerNotificationsEnabled,
} from '../utils/storage.js';
import {
  computeOfflinePrayerData,
  computeQiblaBearing,
} from '../utils/prayer-calc.js';
import { t } from '../i18n/index.js';

const BASE_URL = 'https://api.aladhan.com/v1';
const FETCH_TIMEOUT_MS = 6500;
const LOCATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const CAIRO_COORDS = { lat: 30.0444, lng: 31.2357 };

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

/**
 * Return the user's last known GPS coordinates regardless of TTL,
 * so indoor/offline sessions still use their real city rather than Cairo.
 */
export function getLastKnownLocation() {
  const cached = load('last-location', null);
  if (cached && typeof cached.lat === 'number' && typeof cached.lng === 'number') {
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

  try {
    const json = await fetchJsonWithTimeout(
      `${BASE_URL}/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=${method}`
    );

    if (json.code === 200 && json.data) {
      save(cacheKey, json.data);
      return json.data;
    }
  } catch {
    // Offline or weak network: compute exact astronomical schedule locally in 0ms!
  }

  return computeOfflinePrayerData(latitude, longitude, new Date());
}

export async function getPrayerTimesByCity(city, country, method = 5, forceRefresh = false) {
  const date = getDateKey();
  const cacheKey = `prayer-city-${date}-${city.toLowerCase()}-${country.toLowerCase()}-${method}`;

  if (!forceRefresh) {
    const cached = load(cacheKey, null);
    if (cached) return cached;
  }

  try {
    const json = await fetchJsonWithTimeout(
      `${BASE_URL}/timingsByCity/${date}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`
    );

    if (json.code === 200 && json.data) {
      save(cacheKey, json.data);
      return json.data;
    }
  } catch {
    // Offline fallback for Cairo
  }

  return computeOfflinePrayerData(CAIRO_COORDS.lat, CAIRO_COORDS.lng, new Date());
}

export async function getQiblaDirection(latitude, longitude) {
  return {
    latitude,
    longitude,
    direction: computeQiblaBearing(latitude, longitude),
  };
}

/**
 * Schedule 7 days of local Prayer & Morning/Evening Azkar notifications via DeenSystem Android plugin.
 */
export async function syncPrayerNotificationsIfEnabled(coords = null) {
  if (!Capacitor.isNativePlatform() || !Capacitor?.Plugins?.DeenSystem) return false;

  if (!getPrayerNotificationsEnabled()) {
    try {
      await Capacitor.Plugins.DeenSystem.cancelNotifications();
    } catch {
      // Ignore
    }
    return false;
  }

  const loc = coords || getLastKnownLocation() || CAIRO_COORDS;
  const nowMs = Date.now();
  const alarms = [];
  const prayerDefs = [
    { key: 'Fajr', labelKey: 'prayer_fajr' },
    { key: 'Dhuhr', labelKey: 'prayer_dhuhr' },
    { key: 'Asr', labelKey: 'prayer_asr' },
    { key: 'Maghrib', labelKey: 'prayer_maghrib' },
    { key: 'Isha', labelKey: 'prayer_isha' },
  ];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    targetDate.setHours(12, 0, 0, 0);

    const schedule = computeOfflinePrayerData(loc.lat, loc.lng, targetDate);
    for (let pIdx = 0; pIdx < prayerDefs.length; pIdx++) {
      const def = prayerDefs[pIdx];
      const raw = schedule.timings[def.key];
      if (!raw) continue;
      const [h, m] = raw.split(':').map(Number);
      const fireAt = new Date(targetDate);
      fireAt.setHours(h, m, 0, 0);
      if (fireAt.getTime() > nowMs + 15000) {
        const pName = t(def.labelKey);
        alarms.push({
          id: 1000 + dayOffset * 10 + pIdx,
          triggerAt: fireAt.getTime(),
          title: `${t('app_name')} — ${pName}`,
          body: `${t('notif_prayer_time')} ${pName}`,
        });
      }
    }

    // Morning Azkar (06:45 AM) & Evening Azkar (04:45 PM)
    const morningAt = new Date(targetDate);
    morningAt.setHours(6, 45, 0, 0);
    if (morningAt.getTime() > nowMs + 15000) {
      alarms.push({
        id: 2000 + dayOffset * 10 + 1,
        triggerAt: morningAt.getTime(),
        title: `${t('app_name')} — ${t('azkar_morning')}`,
        body: t('notif_morning_azkar'),
      });
    }

    const eveningAt = new Date(targetDate);
    eveningAt.setHours(16, 45, 0, 0);
    if (eveningAt.getTime() > nowMs + 15000) {
      alarms.push({
        id: 2000 + dayOffset * 10 + 2,
        triggerAt: eveningAt.getTime(),
        title: `${t('app_name')} — ${t('azkar_evening')}`,
        body: t('notif_evening_azkar'),
      });
    }
  }

  try {
    const res = await Capacitor.Plugins.DeenSystem.scheduleNotifications({ alarms });
    return Boolean(res?.granted);
  } catch {
    return false;
  }
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
