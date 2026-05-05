export function clearReferencePreview(prev: string | null): string | null {
  if (prev) URL.revokeObjectURL(prev);
  return null;
}
