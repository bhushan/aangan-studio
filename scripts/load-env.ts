// Loads .env for local scripts if present. Never prints values.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env: rely on the shell environment.
}
