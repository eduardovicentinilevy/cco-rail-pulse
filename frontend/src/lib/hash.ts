// frontend/src/lib/hash.ts

/** Hash determinístico e estável (djb2) — a mesma string sempre produz o mesmo valor. */
export const hashString = (value: string): number => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash);
};
