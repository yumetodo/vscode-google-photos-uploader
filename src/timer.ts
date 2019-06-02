export const waitFor = (ms: number) =>
  new Promise((resolve, _) => {
    setTimeout(resolve, ms);
  });
