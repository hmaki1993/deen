/**
 * Unified Arabic Text Normalization, Bismillah Stripping, and Recitation Matching.
 * Single source of truth shared across Quran search, Mushaf reader, and Quran reader.
 */

export const DISJOINTED_LETTERS_MAP = {
  'الم': ['الف لام ميم', 'الف لا ميم'],
  'المص': ['الف لام ميم صاد'],
  'الر': ['الف لام را', 'الف لا را', 'الف لام ر'],
  'المر': ['الف لام ميم را', 'الف لا ميم را', 'الف لام ميم ر'],
  'كهيعص': ['كاف ها يا عين صاد', 'كاف ه ي ع صاد'],
  'طه': ['طه', 'طا ها', 'ط ه'],
  'طسم': ['طسم', 'طا سين ميم', 'ط س م'],
  'طس': ['طس', 'طا سين', 'ط س'],
  'يس': ['يس', 'ياسين', 'يا سين', 'ي س'],
  'ص': ['صاد', 'ص'],
  'حم': ['حم', 'حا ميم', 'ح ميم'],
  'حم عسق': ['حم عسق', 'حا ميم عين سين قاف'],
  'عسق': ['عين سين قاف', 'ع س ق'],
  'ق': ['قاف', 'ق'],
  'ن': ['نون', 'ن'],
};

/**
 * Normalize Arabic text into space-separated plain words without diacritics/tashkeel.
 * Used for both Arabic Surah search and word-level recitation matching.
 */
export function normalizeArabicWords(text) {
  if (!text) return '';
  return String(text)
    .replace(/\u0648\u0670/g, 'ا') // Waw + dagger alef (e.g. صلوة -> صلاة)
    .replace(/[\u064B-\u065F\u0656-\u065E\u06D6-\u06ED\u0670\u0640]/g, '') // Diacritics, Quranic marks, tatweel
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627') // Alef forms + Alef wasla -> ا
    .replace(/\u0629/g, '\u0647') // Teh marbuta -> ه
    .replace(/\u0649/g, '\u064A') // Alef maksura -> ي
    .replace(/\u0624/g, '\u0648') // Waw hamza -> و
    .replace(/\u0626/g, '\u064A') // Yeh hamza -> ي
    .replace(/[.,\-?!()[\]﴿﴾«»؛،]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize Arabic text into a compact continuous character string (no spaces).
 */
export function normalizeArabicForMatching(text) {
  return normalizeArabicWords(text).replace(/\s+/g, '');
}

/**
 * Strip Bismillah prefix from Ayah 1 of non-Fatiha / non-Tawbah surahs.
 */
export function stripBismillah(text) {
  if (!text) return '';
  const exactStrings = [
    'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ',
    'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  ];

  for (const str of exactStrings) {
    if (text.startsWith(str)) {
      return text.substring(str.length).trim();
    }
  }

  const diacritics = /[\u064B-\u065F\u0670\u06D6-\u06ED]/;
  const clean = text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
  const normalized = clean.replace(/[\u0671\u0622\u0623\u0625]/g, 'ا').replace(/ى/g, 'ي');

  if (normalized.startsWith('بسم الله الرحمن الرحيم')) {
    let nonDiacriticCount = 0;
    let originalIndex = 0;
    while (nonDiacriticCount < 22 && originalIndex < text.length) {
      if (!diacritics.test(text[originalIndex])) {
        nonDiacriticCount++;
      }
      originalIndex++;
    }
    return text.substring(originalIndex).trim();
  }
  return text;
}

/**
 * Ignore spoken Bismillah at the start of recitation when target ayah does not start with "بسم".
 */
export function stripSpokenBismillah(spokenWords, targetWords) {
  if (targetWords.length > 0 && normalizeArabicForMatching(targetWords[0]) === 'بسم') {
    return spokenWords;
  }

  const norm = spokenWords.map((w) => normalizeArabicForMatching(w));

  if (
    norm.length >= 4 &&
    norm[0] === 'بسم' &&
    norm[1] === 'الله' &&
    (norm[2] === 'رحمن' || norm[2] === 'الرحمن') &&
    (norm[3] === 'رحيم' || norm[3] === 'الرحيم')
  ) {
    return spokenWords.slice(4);
  }
  if (norm.length >= 2 && norm[0] === 'بسم' && norm[1] === 'الله') {
    return spokenWords.slice(2);
  }
  if (norm.length >= 1 && norm[0] === 'بسم') {
    return spokenWords.slice(1);
  }
  return spokenWords;
}

/**
 * Levenshtein-based normalized similarity in [0, 1].
 */
export function calcSimilarity(a, b) {
  if (a.length === 0) return b.length === 0 ? 1.0 : 0.0;
  if (b.length === 0) return 0.0;

  let prev = new Array(a.length + 1);
  let curr = new Array(a.length + 1);
  for (let j = 0; j <= a.length; j++) prev[j] = j;

  for (let i = 1; i <= b.length; i++) {
    curr[0] = i;
    const bChar = b.charAt(i - 1);
    for (let j = 1; j <= a.length; j++) {
      if (bChar === a.charAt(j - 1)) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], curr[j - 1], prev[j]);
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  const maxLen = Math.max(a.length, b.length);
  return 1.0 - prev[a.length] / maxLen;
}

/**
 * Check if a single normalized spoken word matches a normalized target word.
 */
function isSingleWordMatch(normSpoken, normTarget) {
  if (!normSpoken || !normTarget) return false;
  if (normSpoken === normTarget) return true;
  if (normTarget.length >= 3) {
    if (normSpoken.includes(normTarget)) return true;
    if (normTarget.includes(normSpoken) && normTarget.length - normSpoken.length <= 2) return true;
    if (normSpoken.length >= 3 && calcSimilarity(normSpoken, normTarget) >= 0.68) return true;
  }
  return false;
}

/**
 * Try matching a target word (including disjointed letters & split-word concatenation)
 * within a bounded lookahead window starting at `startIndex`.
 * Returns { matchedIdx, consumedEnd, isSubstring } or null.
 */
function findTargetInSpoken(normSpokenList, startIndex, normTarget, maxLookahead = 6) {
  const limit = Math.min(normSpokenList.length, startIndex + maxLookahead);

  // Check disjointed letters (الحروف المقطعة) like الم -> الف لام ميم
  for (const [key, variations] of Object.entries(DISJOINTED_LETTERS_MAP)) {
    if (normTarget === normalizeArabicForMatching(key)) {
      for (const variation of variations) {
        const varWords = normalizeArabicWords(variation).split(' ').filter(Boolean);
        if (varWords.length === 0) continue;
        for (let j = startIndex; j < limit; j++) {
          if (j + varWords.length <= normSpokenList.length) {
            let allOk = true;
            for (let k = 0; k < varWords.length; k++) {
              if (!isSingleWordMatch(normSpokenList[j + k], normalizeArabicForMatching(varWords[k]))) {
                allOk = false;
                break;
              }
            }
            if (allOk) {
              return { matchedIdx: j, consumedEnd: j + varWords.length - 1, isSubstring: false };
            }
          }
          // Also check joined single spoken token (e.g. "ياسين" for "يس")
          const joinedVar = normalizeArabicForMatching(variation);
          if (normSpokenList[j] === joinedVar || normSpokenList[j].includes(joinedVar)) {
            return { matchedIdx: j, consumedEnd: j, isSubstring: false };
          }
        }
      }
    }
  }

  for (let j = startIndex; j < limit; j++) {
    const normSpoken = normSpokenList[j];
    if (!normSpoken) continue;

    if (normSpoken === normTarget) {
      return { matchedIdx: j, consumedEnd: j, isSubstring: false };
    }

    if (normTarget.length >= 3) {
      if (normSpoken.includes(normTarget)) {
        return { matchedIdx: j, consumedEnd: j, isSubstring: true };
      }
      if (normTarget.includes(normSpoken) && normTarget.length - normSpoken.length <= 2) {
        return { matchedIdx: j, consumedEnd: j, isSubstring: false };
      }
      if (normSpoken.length >= 3 && calcSimilarity(normSpoken, normTarget) >= 0.68) {
        return { matchedIdx: j, consumedEnd: j, isSubstring: false };
      }

      // Concatenation check for words split by ASR (e.g. "ال عالمين" -> "العالمين")
      if (j + 1 < normSpokenList.length) {
        const combined = normSpoken + (normSpokenList[j + 1] || '');
        if (combined.includes(normTarget) || calcSimilarity(combined, normTarget) >= 0.72) {
          return { matchedIdx: j, consumedEnd: j + 1, isSubstring: false };
        }
      }
    }
  }

  return null;
}

/**
 * Sequential prefix word matcher for live word-by-word memorization reveal.
 * Supports:
 * - Instant partial/interim live streams
 * - Disjointed letters (الم، يس، طه...)
 * - Split-word concatenation
 * - 1-word ASR drop bridging (if the next 2 target words match cleanly in sequence)
 */
export function matchAyahPrefix(recentSpokenWords, targetWords) {
  const spoken = stripSpokenBismillah(recentSpokenWords, targetWords);
  const normSpokenList = spoken.map((w) => normalizeArabicForMatching(w));
  const normTargetList = targetWords.map((w) => normalizeArabicForMatching(w));

  let maxTargetIndexReached = 0;
  let lastSpokenIdx = -1;
  let lastSpokenMatchedSubstring = false;
  let actualWordsMatched = 0;

  for (let targetIdx = 0; targetIdx < normTargetList.length; targetIdx++) {
    const normTarget = normTargetList[targetIdx];
    if (normTarget.length === 0) {
      maxTargetIndexReached = Math.max(maxTargetIndexReached, targetIdx + 1);
      continue;
    }

    const startIndex = Math.max(0, lastSpokenMatchedSubstring ? lastSpokenIdx : lastSpokenIdx + 1);
    if (startIndex >= normSpokenList.length) break;

    const hit = findTargetInSpoken(normSpokenList, startIndex, normTarget, 6);
    if (hit) {
      maxTargetIndexReached = Math.max(maxTargetIndexReached, targetIdx + 1);
      lastSpokenIdx = hit.consumedEnd;
      lastSpokenMatchedSubstring = hit.isSubstring;
      actualWordsMatched++;
      continue;
    }

    // 1-word ASR drop bridge: if Google Speech dropped/misheard 1 word,
    // allow bridging ONLY if the next 2 target words match cleanly in order
    // (or the next word is the final word of a short ayah and has >= 4 chars).
    const nextIdx = targetIdx + 1;
    if (nextIdx < normTargetList.length && normTargetList[nextIdx].length >= 3) {
      const nextHit = findTargetInSpoken(normSpokenList, startIndex, normTargetList[nextIdx], 4);
      if (nextHit) {
        const next2Idx = targetIdx + 2;
        let bridged = false;
        if (next2Idx < normTargetList.length && normTargetList[next2Idx].length > 0) {
          const next2Start = nextHit.isSubstring ? nextHit.consumedEnd : nextHit.consumedEnd + 1;
          const next2Hit = findTargetInSpoken(normSpokenList, next2Start, normTargetList[next2Idx], 4);
          if (next2Hit) {
            maxTargetIndexReached = Math.max(maxTargetIndexReached, next2Idx + 1);
            lastSpokenIdx = next2Hit.consumedEnd;
            lastSpokenMatchedSubstring = next2Hit.isSubstring;
            actualWordsMatched += 2;
            targetIdx = next2Idx;
            bridged = true;
          }
        } else if (nextIdx === normTargetList.length - 1 && normTargetList[nextIdx].length >= 4) {
          maxTargetIndexReached = Math.max(maxTargetIndexReached, nextIdx + 1);
          lastSpokenIdx = nextHit.consumedEnd;
          lastSpokenMatchedSubstring = nextHit.isSubstring;
          actualWordsMatched++;
          targetIdx = nextIdx;
          bridged = true;
        }
        if (bridged) continue;
      }
    }

    break;
  }

  return {
    targetCount: maxTargetIndexReached,
    spokenCount: lastSpokenIdx + 1,
    actualWordsMatched,
  };
}

/**
 * Whole-ayah fuzzy matcher (including disjointed letters).
 */
export function compareTexts(spoken, target) {
  const spokenWords = normalizeArabicWords(spoken).split(' ').filter(Boolean);
  const targetWords = normalizeArabicWords(target).split(' ').filter(Boolean);
  if (targetWords.length === 0) return false;

  const recentSpokenWords = spokenWords.slice(-(Math.max(targetWords.length * 2, 24) + 8));
  const normalizedRecentSpoken = normalizeArabicForMatching(recentSpokenWords.join(' '));
  const normalizedTarget = normalizeArabicForMatching(target);

  if (normalizedRecentSpoken.includes(normalizedTarget)) return true;

  for (const [key, variations] of Object.entries(DISJOINTED_LETTERS_MAP)) {
    if (normalizedTarget === normalizeArabicForMatching(key)) {
      for (const variation of variations) {
        if (normalizedRecentSpoken.includes(normalizeArabicForMatching(variation))) {
          return true;
        }
      }
    }
  }

  let matchCount = 0;
  const used = new Set();

  for (const targetWord of targetWords) {
    let matched = false;
    for (let i = 0; i < recentSpokenWords.length; i++) {
      if (used.has(i)) continue;
      const spokenWord = recentSpokenWords[i];
      if (targetWord.length >= 3) {
        if (spokenWord.includes(targetWord) || targetWord.includes(spokenWord)) {
          matched = true;
          used.add(i);
          break;
        }
        if (targetWord.length >= 4 && spokenWord.length >= 3 && calcSimilarity(spokenWord, targetWord) >= 0.7) {
          matched = true;
          used.add(i);
          break;
        }
      } else if (spokenWord === targetWord) {
        matched = true;
        used.add(i);
        break;
      }
    }
    if (matched) matchCount++;
  }

  const requiredRatio = targetWords.length <= 2 ? 0.7 : 0.55;
  return matchCount / targetWords.length >= requiredRatio;
}
