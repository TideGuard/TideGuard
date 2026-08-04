export function isDemoMode(origin: {
  enabled: boolean;
  protectAll: boolean;
  pathPrefixes: string[];
}): boolean {
  if (!origin.enabled) return true;
  return !origin.protectAll && origin.pathPrefixes.length === 0;
}
