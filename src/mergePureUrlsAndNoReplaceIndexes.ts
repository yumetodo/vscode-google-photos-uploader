export function mergePureUrlsAndNoReplaceIndexes(
  pureUrls: (string | undefined)[],
  noReplaceIndexes: number[]
): readonly (string | undefined)[] {
  const re: (string | undefined)[] = [];
  let i = 0;
  for (const pureUrl of pureUrls) {
    for (; i < noReplaceIndexes.length && re.length === noReplaceIndexes[i]; ++i) {
      re.push(undefined);
    }
    re.push(pureUrl);
  }
  for (; i < noReplaceIndexes.length && re.length === noReplaceIndexes[i]; ++i) {
    re.push(undefined);
  }
  if (i !== noReplaceIndexes.length) {
    throw new Error('noReplaceIndexes is broken');
  }
  return Object.freeze(re);
}
