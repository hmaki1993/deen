/**
 * Helper Utilities
 * Common formatting and calculation functions used across the Deen app.
 */

import { getLang } from '../i18n/index.js';

/** Arabic-Indic numeral characters (٠–٩) */
const ARABIC_NUMS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Convert a number to Arabic-Indic numerals.
 * @param {number|string} num - Number to convert
 * @returns {string} Number with Arabic-Indic digits
 */
export function toArabicNum(num) {
  return String(num).replace(/[0-9]/g, (d) => ARABIC_NUMS[d]);
}

/**
 * Format a number based on the current language.
 * Arabic → Arabic-Indic numerals, English → Western numerals.
 * @param {number|string} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNum(num) {
  return getLang() === 'ar' ? toArabicNum(num) : String(num);
}

/**
 * Clean a time string for display.
 * Removes timezone abbreviations like "(EET)" from API responses.
 * @param {string} timeStr - Raw time string (e.g. "05:23 (EET)")
 * @returns {string} Clean time string (e.g. "05:23")
 */
export function formatTime(timeStr) {
  if (!timeStr) return '';
  // Remove any timezone info in parentheses
  const clean = timeStr.replace(/\s*\(.*\)/, '').trim();
  return clean;
}

/**
 * Calculate milliseconds until a given HH:MM time today (or tomorrow if passed).
 * @param {string} timeStr - Time in "HH:MM" format
 * @returns {number} Milliseconds until target time
 */
export function getTimeDiff(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  // If the target time has already passed today, set it to tomorrow
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

/**
 * Convert milliseconds into hours, minutes, seconds components.
 * @param {number} ms - Milliseconds
 * @returns {{ hours: number, minutes: number, seconds: number }}
 */
export function formatCountdown(ms) {
  if (ms <= 0) return { hours: 0, minutes: 0, seconds: 0 };
  const totalSeconds = Math.floor(ms / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Pad a number with a leading zero (e.g. 5 → "05").
 * @param {number} num - Number to pad
 * @returns {string} Zero-padded string
 */
export function pad(num) {
  return String(num).padStart(2, '0');
}
