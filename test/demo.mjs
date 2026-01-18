/**
 * Test script for node-network-tab
 *
 * Run: node test/demo.mjs
 */

import "../dist/start.js";
import https from "node:https";

// Wait a bit for the UI to initialize
await new Promise((resolve) => setTimeout(resolve, 500));

console.log("\n🧪 Making test HTTP requests...\n");

// Test 1: Simple GET
await makeRequest("https://jsonplaceholder.typicode.com/posts/1");

// Test 2: Another GET
await makeRequest("https://jsonplaceholder.typicode.com/users/1");

// Test 3: POST with body
await makePostRequest(
  "https://jsonplaceholder.typicode.com/posts",
  JSON.stringify({ title: "Test", body: "Hello", userId: 1 }),
);

// Test 4: One more GET
await makeRequest("https://jsonplaceholder.typicode.com/comments?postId=1");

console.log("\n✅ All test requests completed!");
console.log("📊 Check the TUI above to see captured requests.");
console.log("⌨️  Use ↑↓ to navigate, Tab to switch tabs, q to quit\n");

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(
            `  ✓ GET ${url.split("/").slice(-2).join("/")} → ${res.statusCode}`,
          );
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
