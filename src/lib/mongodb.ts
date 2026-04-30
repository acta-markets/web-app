import { MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI. Add it to your .env.local (see ENV_SETUP.md).");
  }

  const mongoClient = new MongoClient(uri);
  const mongoClientPromise: Promise<MongoClient> =
    global.__mongoClientPromise ?? mongoClient.connect();

  if (process.env.NODE_ENV !== "production") {
    global.__mongoClientPromise = mongoClientPromise;
  }

  const client = await mongoClientPromise;
  const dbName = process.env.MONGODB_DB || "acta";
  return client.db(dbName);
}


