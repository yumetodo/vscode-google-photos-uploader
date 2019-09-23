export function mergePureUrlsAndNoReplaceIndexes(pureUrls: (string | undefined)[], noReplaceIndexes: number[]) {
  const re: (string | undefined)[] = [];
  let i = 0;
  for (let j = 0; i < pureUrls.length && j < noReplaceIndexes.length; ++i) {
    if (re.length === noReplaceIndexes[j]) {
      re.push(undefined);
      ++j;
    }
    re.push(pureUrls[i]);
  }
  for (; i < pureUrls.length; ++i) {
    re.push(pureUrls[i]);
  }
  return Object.freeze(re);
}
