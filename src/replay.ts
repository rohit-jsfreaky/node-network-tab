/**
 * Request Replay Helper
 */

import http from "node:http";
import https from "node:https";
import { type RequestLog } from "./store.js";

export function replayRequest(log: RequestLog): void {
  const isHttps = log.protocol === "https";
  const requestModule = isHttps ? https : http;

  const urlObj = new URL(log.url);

  const options: http.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: log.method,
    headers: log.reqHeaders as http.OutgoingHttpHeaders,
  };

  const req = requestModule.request(options, (res) => {
    res.on("data", () => {});
    res.on("end", () => {});
  });

  req.on("error", () => {
    // Error is handled by the interceptor
  });

  if (log.reqBody) {
    req.write(log.reqBody);
  }

  req.end();
}
