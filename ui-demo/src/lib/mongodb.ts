import { MongoClient } from "mongodb";

import { getServerEnv } from "./env";

declare global {
  // Reuse the same MongoClient promise during local development hot reloads.
  // The Node.js driver defaults are appropriate for this low-traffic demo.
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getMongoClient(): Promise<MongoClient> {
  const { MONGODB_URI } = getServerEnv();

  if (!globalThis.mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI);
    globalThis.mongoClientPromise = client.connect().catch((error) => {
      globalThis.mongoClientPromise = undefined;
      throw error;
    });
  }

  return globalThis.mongoClientPromise;
}

export async function getAppDb() {
  const { MONGODB_DB } = getServerEnv();
  const client = await getMongoClient();

  return client.db(MONGODB_DB);
}
