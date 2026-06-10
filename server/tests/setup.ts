import fs from "node:fs";
import path from "node:path";

const testDataDir = path.resolve(process.cwd(), "test-data");
fs.mkdirSync(testDataDir, { recursive: true });
process.env.DATABASE_PATH = path.join(testDataDir, "vitest-lottolens.db");
