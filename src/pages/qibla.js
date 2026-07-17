/**
 * ═══════════════════════════════════════════════
 *  دين — Qibla Compass Page
 *  Shows Qibla direction with a visual compass.
 *  Uses DeviceOrientation API on supported
 *  devices for a live rotating needle.
 * ═══════════════════════════════════════════════
 */

import { t } from '../i18n/index.js';
import { getQiblaDirection, getUserLocation } from '../api/prayer.js';

/** Store the orientation listener so we can clean it up */
let orientationHandler = null;

// ─── Main Render ────────────────────────────────
export async function render(container) {
  container.innerHTML = `
    <div class="page page--qibla fade-in">
      <div class="page-header">
        <a href="#/prayer" class="back-btn">← ${t('back')}</a>
        <h2 class="page-title">${t('qibla_title')}</h2>
      </div>

      <!-- ✦ Compass Visual ✦ -->
      <div class="qibla-compass" id="qibla-compass">
        <div class="compass-ring">
          <div class="compass-needle" id="compass-needle">
            <div class="needle-point">🕋</div>
          </div>
          <div class="compass-degrees" id="compass-degrees">--°</div>
        </div>
        <p class="qibla-instruction">${t('qibla_instruction')}</p>
      </div>

      <!-- ✦ Loading Indicator ✦ -->
      <div id="qibla-loading" class="loading-spinner">
        <div class="spinner"></div>
        <p>${t('loading')}</p>
      </div>
    </div>
  `;

  try {
    const pos       = await getUserLocation();
    const data      = await getQiblaDirection(pos.lat, pos.lng);
    const direction = data.direction;

    // Hide loader
    const loader = document.getElementById('qibla-loading');
    if (loader) loader.style.display = 'none';

    // Show computed bearing
    const degreesEl = document.getElementById('compass-degrees');
    if (degreesEl) {
      degreesEl.textContent = `${Math.round(direction)}° ${t('qibla_degrees')}`;
    }

    // Static needle rotation
    const needle = document.getElementById('compass-needle');
    if (needle) needle.style.transform = `rotate(${direction}deg)`;

    // ── Live compass via DeviceOrientation ──
    if (window.DeviceOrientationEvent && needle) {
      orientationHandler = (e) => {
        if (e.alpha !== null) {
          const heading       = e.alpha;         // device heading
          const qiblaRotation = direction - heading;
          needle.style.transform = `rotate(${qiblaRotation}deg)`;
        }
      };
      window.addEventListener('deviceorientation', orientationHandler);
    }
  } catch (_err) {
    const loader = document.getElementById('qibla-loading');
    if (loader) {
      loader.innerHTML = `
        <div class="error-state">
          <p>${t('error')}</p>
          <p style="font-size: 0.85rem; opacity: 0.7;">${t('qibla_enable_location') || 'Please enable location access'}</p>
          <a href="#/prayer" class="btn btn--primary">${t('back')}</a>
        </div>
      `;
    }
  }
}

// ─── Cleanup (called on page exit) ─────────────
export function cleanup() {
  if (orientationHandler) {
    window.removeEventListener('deviceorientation', orientationHandler);
    orientationHandler = null;
  }
}
