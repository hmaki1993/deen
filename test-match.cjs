const fs = require('fs');

function normalizeArabicForMatching(text) {
  return text
    .replace(/[\u064B-\u065F\u0656-\u065E\u06D6-\u06ED]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0670/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A')
    .replace(/[\s\.\,\-\?\!]/g, '')
    .trim();
}

function normalizeArabicWords(text) {
  return text
    .replace(/[\u064B-\u065F\u0656-\u065E\u06D6-\u06ED]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0670/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A')
    .replace(/[\.\,\-\?\!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcSimilarity(a, b) {
  if (a.length === 0) return b.length === 0 ? 1.0 : 0.0;
  if (b.length === 0) return 0.0;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

function matchAyahPrefix(recentSpokenWords, targetWords) {
  let maxTargetIndexReached = 0;
  let lastSpokenIdx = -1;
  let skippedTargets = 0;
  let actualWordsMatched = 0;
  
  for (let targetIdx = 0; targetIdx < targetWords.length; targetIdx++) {
    const normTarget = normalizeArabicForMatching(targetWords[targetIdx]);
    
    if (normTarget.length <= 1) {
      maxTargetIndexReached = Math.max(maxTargetIndexReached, targetIdx + 1);
      actualWordsMatched++;
      continue;
    }
    
    let found = false;
    const maxLookahead = 6;
    // Allow j to start from lastSpokenIdx (instead of lastSpokenIdx + 1) to handle merged words!
    const startIndex = Math.max(0, lastSpokenIdx);
    const searchLimit = Math.min(recentSpokenWords.length, startIndex + maxLookahead);
    
    for (let j = startIndex; j < searchLimit; j++) {
      const normSpoken = normalizeArabicForMatching(recentSpokenWords[j]);
      if (normSpoken.length === 0) continue;
      
      let wordMatched = false;
      if (normSpoken === normTarget) {
        wordMatched = true;
      } else {
        if (normSpoken.includes(normTarget)) {
          if (normTarget.length >= 4) {
            wordMatched = true; 
          } else if (normSpoken.startsWith(normTarget) || normSpoken.endsWith(normTarget)) {
            wordMatched = true; 
          } else if (normSpoken.length - normTarget.length <= 2) {
            wordMatched = true;
          }
        } else if (normTarget.includes(normSpoken) && (normTarget.length - normSpoken.length <= 2)) {
          wordMatched = true;
        } else if (normTarget.length >= 3 && normSpoken.length >= 3 && calcSimilarity(normSpoken, normTarget) >= 0.75) {
          wordMatched = true;
        }
      }
      
      if (wordMatched) {
        maxTargetIndexReached = Math.max(maxTargetIndexReached, targetIdx + 1);
        lastSpokenIdx = j;
        found = true;
        skippedTargets = 0;
        actualWordsMatched++;
        break;
      }
    }
    
    if (!found) {
      skippedTargets++;
      if (skippedTargets > 3) {
        break;
      }
    }
  }
  
  return { 
    targetCount: maxTargetIndexReached, 
    spokenCount: lastSpokenIdx + 1,
    actualWordsMatched: actualWordsMatched 
  };
}

const targetText = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ";
const targetWords = normalizeArabicWords(targetText).split(' ').filter(Boolean);

const spokenText2 = "الحمدلله ربالعالمين";
const spokenWords2 = normalizeArabicWords(spokenText2).split(' ').filter(Boolean);
console.log("TEST 2:");
console.log(matchAyahPrefix(spokenWords2, targetWords));

const spokenText4 = "الحمدللهربالعالمين";
const spokenWords4 = normalizeArabicWords(spokenText4).split(' ').filter(Boolean);
console.log("\nTEST 4 (all merged):");
console.log(matchAyahPrefix(spokenWords4, targetWords));
