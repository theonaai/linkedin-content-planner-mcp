import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const db = createDb(connectionString);

await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });

console.log("Migrations complete");
process.exit(0);
