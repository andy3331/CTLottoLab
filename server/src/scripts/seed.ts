import fs from "node:fs";
import path from "node:path";
import { importCtLottoFile } from "../services/importService.js";

const sourcePath = path.resolve(process.cwd(), "..", "lottoresults.txt");
if (!fs.existsSync(sourcePath)) {
  console.error("lottoresults.txt was not found at the project root.");
  process.exit(1);
}

const content = fs.readFileSync(sourcePath, "utf-8");
const summary = importCtLottoFile({
  fileName: "lottoresults.txt",
  content,
});

console.log(JSON.stringify(summary, null, 2));
