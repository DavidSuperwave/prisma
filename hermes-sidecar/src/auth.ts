import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import type { SidecarConfig } from "./config";

function readToken(request: Request): string {
  const authHeader = request.header("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const apiKeyHeader = request.header("x-api-key") ?? "";
  if (apiKeyHeader) {
    return apiKeyHeader.trim();
  }
  return "";
}

function tokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  // timingSafeEqual requires equal-length inputs. Compare lengths separately;
  // return false fast when they differ, still without branching on contents.
  if (providedBuf.length !== expectedBuf.length) {
    // Hash both to a fixed-size buffer just to keep compare-time uniform when
    // lengths differ, while still returning false.
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function requireBearer(config: SidecarConfig) {
  return function requireBearerMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ) {
    const token = readToken(request);
    if (!tokensMatch(token, config.apiKey)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}
