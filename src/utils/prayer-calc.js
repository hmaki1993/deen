/**
 * دين (Deen) — Offline Astronomical Prayer Times, Hijri Date & Qibla Calculator
 * - High-precision USNO solar coordinates + Egyptian General Authority of Survey (Method 5:
 *   Fajr 19.5°, Isha 17.5°, Shafi'i Asr shadow ratio 1 + tan(|lat - decl|))
 * - Great-circle spherical trigonometry Qibla bearing to Kaaba (21.422487°N, 39.826206°E)
 * - Built-in Intl Umm al-Qura Hijri date formatting (zero network dependency, 0ms latency)
 */

const KAABA_LAT = 21.422487;
const KAABA_LNG = 39.826206;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const dsin = (d) => Math.sin(d * DEG2RAD);
const dcos = (d) => Math.cos(d * DEG2RAD);
const dtan = (d) => Math.tan(d * DEG2RAD);
const darcsin = (x) => Math.asin(Math.max(-1, Math.min(1, x))) * RAD2DEG;
const darccos = (x) => Math.acos(Math.max(-1, Math.min(1, x))) * RAD2DEG;
const darctan2 = (y, x) => Math.atan2(y, x) * RAD2DEG;
const darccot = (x) => Math.atan(1 / x) * RAD2DEG;

function fixAngle(a) {
  return ((a % 360) + 360) % 360;
}

function fixHour(h) {
  return ((h % 24) + 24) % 24;
}

function julianDate(year, month, day) {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    B -
    1524.5
  );
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g));
  const e = 23.439 - 0.00000036 * D;

  const decl = darcsin(dsin(e) * dsin(L));
  const ra = darctan2(dcos(e) * dsin(L), dcos(L)) / 15.0;
  let eqt = q / 15.0 - fixHour(ra);
  if (eqt > 12) eqt -= 24;
  if (eqt < -12) eqt += 24;

  return { decl, eqt };
}

function formatHoursToHHMM(hoursFloat) {
  if (!Number.isFinite(hoursFloat)) return '05:00';
  const totalMinutes = Math.round(fixHour(hoursFloat) * 60) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Compute exact Great-Circle Qibla bearing in degrees [0, 360) clockwise from True North.
 */
export function computeQiblaBearing(latitude, longitude) {
  const phi1 = latitude * DEG2RAD;
  const phi2 = KAABA_LAT * DEG2RAD;
  const deltaLambda = (KAABA_LNG - longitude) * DEG2RAD;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x) * RAD2DEG;
  return ((theta % 360) + 360) % 360;
}

/**
 * Format Hijri & Gregorian date metadata offline matching Aladhan API's `date` shape.
 */
export function computeOfflineDateMeta(date = new Date()) {
  let day = '1';
  let year = '1448';
  let monthAr = 'رمضان';
  let monthEn = 'Ramadan';

  try {
    const arParts = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(date);
    for (const p of arParts) {
      if (p.type === 'day') day = p.value;
      if (p.type === 'month') monthAr = p.value;
      if (p.type === 'year') year = p.value;
    }

    const enParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      month: 'long',
    }).formatToParts(date);
    for (const p of enParts) {
      if (p.type === 'month') monthEn = p.value;
    }
  } catch {
    // Keep safe defaults on very old WebViews
  }

  let readable = date.toDateString();
  try {
    readable = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    // Ignore
  }

  return {
    readable,
    hijri: {
      day,
      year,
      month: { ar: monthAr, en: monthEn },
    },
  };
}

/**
 * Compute daily prayer schedule offline (Egyptian General Authority of Survey — Method 5,
 * with automatic high-latitude safety clamping).
 */
export function computeOfflinePrayerData(latitude, longitude, date = new Date()) {
  const tzHours = -date.getTimezoneOffset() / 60;
  const jd =
    julianDate(date.getFullYear(), date.getMonth() + 1, date.getDate()) +
    0.5 -
    longitude / 360.0;
  const { decl, eqt } = sunPosition(jd);

  const midDay = fixHour(12.0 + tzHours - longitude / 15.0 - eqt);

  const hourAngleForAltitude = (altDeg) => {
    const num = dsin(altDeg) - dsin(latitude) * dsin(decl);
    const den = dcos(latitude) * dcos(decl);
    const ratio = Math.max(-1, Math.min(1, num / (den || 1e-6)));
    return darccos(ratio) / 15.0;
  };

  // Method 5 (Egyptian General Authority of Survey): Fajr -19.5°, Isha -17.5°
  const fajrDiff = hourAngleForAltitude(-19.5);
  const sunriseDiff = hourAngleForAltitude(-0.8333);
  const ishaDiff = hourAngleForAltitude(-17.5);

  // Shafi'i / Standard Asr: shadow length = 1 + tan(|lat - decl|)
  const asrAlt = darccot(1.0 + dtan(Math.abs(latitude - decl)));
  const asrDiff = hourAngleForAltitude(asrAlt);

  const timings = {
    Fajr: formatHoursToHHMM(midDay - fajrDiff),
    Sunrise: formatHoursToHHMM(midDay - sunriseDiff),
    Dhuhr: formatHoursToHHMM(midDay + 1 / 60),
    Asr: formatHoursToHHMM(midDay + asrDiff),
    Maghrib: formatHoursToHHMM(midDay + sunriseDiff + 1 / 60),
    Isha: formatHoursToHHMM(midDay + ishaDiff),
  };

  return {
    timings,
    date: computeOfflineDateMeta(date),
    offline: true,
  };
}
