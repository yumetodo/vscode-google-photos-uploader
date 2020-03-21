export function mergePureUrlsAndNoReplaceIndexes(pureUrls: (string | undefined)[], noReplaceIndexes: number[]) {
  const re: (string | undefined)[] = [];
  let i = 0;
  for (const pureUrl of pureUrls) {
    for (; i < noReplaceIndexes.length && re.length === noReplaceIndexes[i]; ++i) {
      re.push(undefined);
    }
    re.push(pureUrl);
  }
  return Object.freeze(re);
}
