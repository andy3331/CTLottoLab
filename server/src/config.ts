import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  get databasePath() {
    return (
      process.env.DATABASE_PATH ??
      path.resolve(process.cwd(), "server", "data", "lottolens.db")
    );
  },
};
