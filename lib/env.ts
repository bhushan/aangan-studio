// Reads required configuration. Errors name the missing variable, never a value.
export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Server misconfigured: ${name} is not set`);
  return v;
}

export const optionalEnv = (name: string): string | undefined => process.env[name] || undefined;
