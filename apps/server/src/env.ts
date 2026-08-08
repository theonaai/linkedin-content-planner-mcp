export function loadEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return {
    port: Number(process.env.PORT ?? 3210),
    databaseUrl,
  };
}
