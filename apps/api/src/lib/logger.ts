import pino from "pino";
import { isProd } from "../env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  redact: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.apiKey"],
  ...(isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }),
});
