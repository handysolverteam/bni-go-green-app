/**
 * Normalizes member names by removing special characters, titles, and extra whitespace.
 */
export function normalizeMemberName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.|er\.|CA|adv\.)\s+/i, '') // strip common honorifics
    .replace(/[^a-z0-9\s]/g, '') // strip special characters
    .replace(/\s+/g, ' ') // collapse extra spaces
    .trim();
}

/**
 * Calculates string similarity score between 0.0 and 1.0 using token matching & Levenshtein distance.
 */
export function calculateNameSimilarity(nameA: string, nameB: string): number {
  const s1 = normalizeMemberName(nameA);
  const s2 = normalizeMemberName(nameB);

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  // Token set match (e.g., "Saurabh Dhull" vs "Dhull Saurabh")
  const tokens1 = s1.split(' ').sort().join(' ');
  const tokens2 = s2.split(' ').sort().join(' ');
  if (tokens1 === tokens2) return 0.95;

  // Substring containment match (e.g., "Saurabh" contained in "Saurabh Kumar")
  if (s1.length > 3 && s2.length > 3) {
    if (s1.includes(s2) || s2.includes(s1)) return 0.88;
  }

  // Levenshtein edit distance
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1.0 : (maxLen - distance) / maxLen;
}

/**
 * Finds the best matching member from a list based on name similarity threshold (default 75%).
 */
export function findBestMatchingMember<T extends { Name: string }>(
  targetName: string,
  memberList: T[],
  threshold = 0.75
): { member: T; score: number } | null {
  let bestMatch: T | null = null;
  let highestScore = 0;

  for (const m of memberList) {
    const score = calculateNameSimilarity(targetName, m.Name);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = m;
    }
  }

  if (bestMatch && highestScore >= threshold) {
    return { member: bestMatch, score: highestScore };
  }

  return null;
}
