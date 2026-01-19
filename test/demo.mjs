/**
 * Test script for node-network-tab with filtering demo
 *
 * Run: node test/demo.mjs
 *
 * This script makes various HTTP requests to demonstrate filtering:
 * - Press / or f to open filter
 * - Type "GET" to show only GET requests
 * - Type "POST" to show only POST requests
 * - Type "200" to show only successful requests
 * - Type "user" to fuzzy search for user-related endpoints
 * - Type "error" to show failed requests
 * - Press Esc to clear filter
 */

import "../dist/start.js";
import https from "node:https";

// Wait a bit for the UI to initialize
await new Promise((resolve) => setTimeout(resolve, 500));

console.log("\n🧪 Making test HTTP requests for filtering demo...\n");

// Make many different requests to test filtering
const requests = [
  // GET requests
  { method: "GET", url: "https://jsonplaceholder.typicode.com/posts/1" },
  { method: "GET", url: "https://jsonplaceholder.typicode.com/users/1" },
  { method: "GET", url: "https://jsonplaceholder.typicode.com/users/2" },
  {
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/comments?postId=1",
  },
  { method: "GET", url: "https://jsonplaceholder.typicode.com/albums/1" },

  // POST requests
  {
    method: "POST",
    url: "https://jsonplaceholder.typicode.com/posts",
    body: { title: "Test", body: "Hello", userId: 1 },
  },
  {
    method: "POST",
    url: "https://jsonplaceholder.typicode.com/posts",
    body: { title: "Another", body: "World", userId: 2 },
  },

  // More GET requests
  { method: "GET", url: "https://jsonplaceholder.typicode.com/todos/1" },
  { method: "GET", url: "https://jsonplaceholder.typicode.com/photos/1" },
];

for (const req of requests) {
  try {
    if (req.method === "GET") {
      await makeGetRequest(req.url);
    } else if (req.method === "POST") {
      await makePostRequest(req.url, JSON.stringify(req.body));
    }
    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (err) {
    console.log(`  ✗ ${req.method} ${req.url} → Error`);
  }
}

console.log("\n✅ All test requests completed!");
console.log("\n🔎 FILTERING DEMO:");
console.log("  Press / or f to open filter bar");
console.log("  Try these filters:");
console.log('    "GET"     → Show only GET requests');
console.log('    "POST"    → Show only POST requests');
console.log('    "user"    → Fuzzy search for user endpoints');
console.log('    "200"     → Show successful requests');
console.log('    "posts"   → Show posts endpoints');
console.log("  Press Esc to clear filter");
console.log("  Press Enter to apply and close filter bar\n");

function makeGetRequest(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const path = new URL(url).pathname;
          console.log(`  ✓ GET ${path} → ${res.statusCode}`);
          resolve(data);
        });
      })
      .on("error", reject);
  });
}

function makePostRequest(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`  ✓ POST ${urlObj.pathname} → ${res.statusCode}`);
          resolve(data);
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
