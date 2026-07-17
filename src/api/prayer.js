/**
 * ═══════════════════════════════════════════════════════════════
 * Deen App — Prayer Times API Service
 * ═══════════════════════════════════════════════════════════════
 * Interfaces with the Aladhan API (aladhan.com) to fetch
 * accurate prayer times by coordinates or city name, Qibla
 * direction, and includes utility helpers for geolocation
 * and determining the next upcoming prayer.
 *
 * Calculation methods (param `method`):
 *   0 = Shia Ithna-Ashari
 *   1 = University of Islamic Sciences, Karachi
 *   2 = Islamic Society of North America (ISNA)
 *   3 = Muslim World League
 *   4 = Umm Al-Qura University, Makkah
 *   5 = Egyptian General Authority of Survey (default)
 *   7 = Institute of Geophysics, University of Tehran
 *  99 = Custom
 * ═══════════════════════════════════════════════════════════════
 */

const BASE_URL = 'https://api.aladhan.com/v1';

// ─── Prayer Times by Coordinates ──────────────────────────────

/**
 * Fetch today's prayer times for a given latitude/longitude.
 *
 * @param {number} latitude  - Geographic latitude
 * @param {number} longitude - Geographic longitude
 * @param {number} [method=5] - Calculation method (see header)
 * @returns {Promise<Object>} Aladhan response data with timings, date, meta
 * @throws {Error} If the API returns a non-200 status
 */
export async function getPrayerTimes(latitude, longitude, method = 5) {
  const today = new Date();
  const date = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

  const res = await fetch(
    `${BASE_URL}/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=${method}`
  );
  const json = await res.json();

  if (json.code === 200) return json.data;
  throw new Error('Failed to fetch prayer times');
}

// ─── Prayer Times by City ─────────────────────────────────────

/**
 * Fetch today's prayer times for a given city and country.
 *
 * @param {string} city    - City name (e.g. "Cairo", "London")
 * @param {string} country - Country name (e.g. "Egypt", "UK")
 * @param {number} [method=5] - Calculation method
 * @returns {Promise<Object>} Aladhan response data
 * @throws {Error} If the API returns a non-200 status
 */
export async function getPrayerTimesByCity(city, country, method = 5) {
  const res = await fetch(
    `${BASE_URL}/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`
  );
  const json = await res.json();

  if (json.code === 200) return json.data;
  throw new Error('Failed to fetch prayer times');
}

// ─── Qibla Direction ──────────────────────────────────────────

/**
 * Get the Qibla compass direction for a given location.
 *
 * @param {number} latitude  - Geographic latitude
 * @param {number} longitude - Geographic longitude
 * @returns {Promise<Object>} Object with `direction` (degrees from North)
 * @throws {Error} If the API returns a non-200 status
 */
export async function getQiblaDirection(latitude, longitude) {
  const res = await fetch(`${BASE_URL}/qibla/${latitude}/${longitude}`);
  const json = await res.json();

  if (json.code === 200) return json.data;
  throw new Error('Failed to fetch qibla direction');
}

// ─── Geolocation Helper ───────────────────────────────────────

/**
 * Request the user's current GPS coordinates via the browser
 * Geolocation API. Returns a promise that resolves with
 * { lat, lng } or rejects with an appropriate error.
 *
 * @returns {Promise<{lat: number, lng: number}>}
 */
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ─── Next Prayer Calculator ───────────────────────────────────

/**
 * Determine which prayer is coming up next based on the current
 * time. Compares against the five daily prayers in order.
 *
 * The Aladhan API sometimes appends timezone info in parentheses
 * to the time strings (e.g. "05:23 (EET)"), so we strip those.
 *
 * @param {Object} timings - The `timings` object from Aladhan
 *   (keys: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha, etc.)
 * @returns {{name: string, time: string, tomorrow?: boolean}}
 *   The next prayer's name and formatted time. If all five
 *   prayers have passed, returns Fajr with `tomorrow: true`.
 */
export function getNextPrayer(timings) {
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const prayer of prayers) {
    // Strip any parenthesised timezone suffix
    const timeStr = timings[prayer].replace(/\s*\(.*\)/, '').trim();
    const [h, m] = timeStr.split(':').map(Number);
    const prayerMinutes = h * 60 + m;

    if (prayerMinutes > nowMinutes) {
      return { name: prayer, time: timeStr };
    }
  }

  // All prayers have passed today — next is Fajr tomorrow
  return {
    name: 'Fajr',
    time: timings.Fajr.replace(/\s*\(.*\)/, '').trim(),
    tomorrow: true,
  };
}
