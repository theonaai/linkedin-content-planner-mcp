import { createDb } from "./client.js";
import { workspaces } from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const db = createDb(connectionString);

const existing = await db.select().from(workspaces).limit(1);
if (existing.length === 0) {
  await db.insert(workspaces).values({ name: "Default Workspace" });
  console.log("Seeded default workspace");
} else {
  console.log("Workspace already exists, skipping seed");
}

process.exit(0);
