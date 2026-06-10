import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", apiRouter);

  const clientDistPath = path.resolve(process.cwd(), "client", "dist");
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api")) {
        next();
        return;
      }
      response.sendFile(path.join(clientDistPath, "index.html"));
    });
  }

  return app;
}
