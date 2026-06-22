const requiredServerEnv = ["MONGODB_URI", "MONGODB_DB", "VOYAGE_API_KEY"] as const;

export type ServerEnv = {
  MONGODB_URI: string;
  MONGODB_DB: string;
  VOYAGE_API_KEY: string;
};

export function getServerEnv(): ServerEnv {
  const missing = requiredServerEnv.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required server environment variables: ${missing.join(", ")}`);
  }

  return {
    MONGODB_URI: process.env.MONGODB_URI as string,
    MONGODB_DB: process.env.MONGODB_DB as string,
    VOYAGE_API_KEY: process.env.VOYAGE_API_KEY as string,
  };
}
