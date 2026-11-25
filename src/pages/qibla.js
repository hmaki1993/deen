/**
 * دين — Qibla Compass Page
 * Accurate True-North Qibla compass using deviceorientationabsolute (Android)
 * and webkitCompassHeading (iOS), with continuous unwrapped angle smoothing
 * (no 358° spin-back), alignment indicator, and leak-proof cleanup.
 */

import { t } from '../i18n/index.js';
import { getQiblaDirection, getUserLocation, getLastKnownLocation, CAIRO_COORDS } from '../api/prayer.js';
import { formatNum } from '../utils/helpers.js';

let absoluteHandler = null;
let fallbackHandler = null;
let sensorCheckTimer = null;
let isMounted = false;

/**
 * Shortest signed angular delta in [-180, 180] from `fromDeg` to `toDeg`.
 */
export function shortestAngleDelta(fromDeg, toDeg) {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

/**
 * Compute needle rotation relative to device heading.
 * - On iOS, `webkitCompassHeading` is clockwise degrees from North [0..360).
 * - On Android `deviceorientationabsolute`, W3C `alpha` is counter-clockwise
 *   from North, so clockwise compass heading = (360 - alpha) % 360.
 * - Needle angle = (qiblaBearing - compassHeading + 360) % 360.
 */
export function computeQiblaNeedleAngle(qiblaBearing, compassHeading) {
  return (((qiblaBearing - compassHeading) % 360) + 360) % 360;
}

export async function render(container) {
  cleanup();
  isMounted = true;

  container.innerHTML = `
    <div class="page page--qibla fade-in">
      <div class="page-header">
        <a href="#/prayer" class="back-btn">
          <svg class="icon-back-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          <span>${t('back')}</span>
        </a>
        <h2 class="page-title">${t('qibla_title')}</h2>
      </div>

      <div class="qibla-compass" id="qibla-compass">
        <div class="compass-ring" id="compass-ring">
          <span class="compass-cardinal compass-cardinal--n">N</span>
          <span class="compass-cardinal compass-cardinal--e">E</span>
          <span class="compass-cardinal compass-cardinal--s">S</span>
          <span class="compass-cardinal compass-cardinal--w">W</span>
          <div class="compass-needle" id="compass-needle">
            <div class="needle-shaft"></div>
            <div class="needle-point">🕋</div>
          </div>
          <div class="compass-degrees" id="compass-degrees">--°</div>
        </div>
        <p class="qibla-status" id="qibla-status"></p>
        <p class="qibla-instruction">${t('qibla_instruction')}</p>
      </div>

      <div id="qibla-loading" class="loading-spinner">
        <div class="spinner"></div>
        <p>${t('loading')}</p>
      </div>
    </div>
  `;

  try {
    let pos = null;
    let usedCairoFallback = false;
    try {
      pos = await getUserLocation();
    } catch {
      pos = getLastKnownLocation();
      if (!pos) {
        pos = CAIRO_COORDS;
        usedCairoFallback = true;
      }
    }
    if (!isMounted) return;

    const data = await getQiblaDirection(pos.lat, pos.lng);
    if (!isMounted) return;

    const direction = data.direction; // Degrees clockwise from True North

    const loader = document.getElementById('qibla-loading');
    if (loader) loader.style.display = 'none';

    const degreesEl = document.getElementById('compass-degrees');
    if (degreesEl) {
      degreesEl.textContent = `${formatNum(Math.round(direction))}°`;
    }

    const needle = document.getElementById('compass-needle');
    const ring = document.getElementById('compass-ring');
    const statusEl = document.getElementById('qibla-status');
    if (usedCairoFallback && statusEl) {
      statusEl.textContent = t('prayer_fallback_cairo');
    }

    let smoothedAngle = direction;
    let hasReceivedSensor = false;
    let wasAligned = false;

    if (needle) {
      needle.style.transform = `rotate(${smoothedAngle}deg)`;
    }

    const applyHeading = (compassHeading) => {
      if (!isMounted || !needle) return;
      hasReceivedSensor = true;

      const targetAngle = computeQiblaNeedleAngle(direction, compassHeading);
      const delta = shortestAngleDelta(smoothedAngle, targetAngle);
      // Smooth low-pass filter to remove sensor jitter without backward 358° spins
      smoothedAngle += delta * 0.25;
      needle.style.transform = `rotate(${smoothedAngle.toFixed(1)}deg)`;

      // Check alignment within ±6° of straight ahead (0° / 360°)
      const offsetFromTop = Math.abs(shortestAngleDelta(0, targetAngle));
      const isAligned = offsetFromTop <= 6;
      if (ring) ring.classList.toggle('compass-ring--aligned', isAligned);
      if (statusEl) {
        statusEl.textContent = isAligned ? t('qibla_aligned') : '';
        statusEl.classList.toggle('qibla-status--aligned', isAligned);
      }
      if (isAligned && !wasAligned && navigator.vibrate) {
        try { navigator.vibrate(25); } catch {}
      }
      wasAligned = isAligned;
    };

    // Request iOS 13+ permission if required
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        await DeviceOrientationEvent.requestPermission();
      } catch {
        // Continue with static bearing
      }
    }

    if (!isMounted) return;

    // 1. Primary on Android: absolute orientation relative to Earth's coordinate frame
    absoluteHandler = (e) => {
      if (e.alpha !== null && typeof e.alpha === 'number') {
        const heading = (360 - e.alpha) % 360;
        applyHeading(heading);
      }
    };
    window.addEventListener('deviceorientationabsolute', absoluteHandler, true);

    // 2. Fallback: iOS webkitCompassHeading or absolute=true deviceorientation
    fallbackHandler = (e) => {
      if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
        applyHeading(e.webkitCompassHeading);
      } else if (e.absolute === true && e.alpha !== null) {
        const heading = (360 - e.alpha) % 360;
        applyHeading(heading);
      }
    };
    window.addEventListener('deviceorientation', fallbackHandler, true);

    // Inform user cleanly if the device lacks a magnetometer / absolute compass sensor
    sensorCheckTimer = setTimeout(() => {
      if (isMounted && !hasReceivedSensor && statusEl) {
        statusEl.textContent = t('qibla_no_sensor');
      }
    }, 2500);
  } catch {
    if (!isMounted) return;
    const loader = document.getElementById('qibla-loading');
    if (loader) {
      loader.innerHTML = `
        <div class="error-state">
          <p>${t('error')}</p>
          <p class="error-subtext">${t('qibla_enable_location')}</p>
          <a href="#/prayer" class="btn btn--primary">${t('back')}</a>
        </div>
      `;
    }
  }
}

export function cleanup() {
  isMounted = false;
  if (sensorCheckTimer) {
    clearTimeout(sensorCheckTimer);
    sensorCheckTimer = null;
  }
  if (absoluteHandler) {
    window.removeEventListener('deviceorientationabsolute', absoluteHandler, true);
    absoluteHandler = null;
  }
  if (fallbackHandler) {
    window.removeEventListener('deviceorientation', fallbackHandler, true);
    fallbackHandler = null;
  }
}
