/**
 * Test script for node-network-tab
 *
 * Run this with: node --import ./dist/start.js test/demo.js
 * Or: node test/demo.js (after uncommenting the import)
 */

// Uncomment to test zero-config mode:
// import '../dist/start.js';

import https from "node:https";
import http from "node:http";

// Make some test requests
async function makeTestRequests() {
  console.log("Making test HTTP requests...\n");

  // Test 1: Simple GET
  await makeRequest("https://jsonplaceholder.typicode.com/posts/1", "GET");

  // Test 2: Simple GET with different endpoint
  await makeRequest("https://jsonplaceholder.typicode.com/users/1", "GET");

  // Test 3: POST with body
  await makePostRequest(
    "https://jsonplaceholder.typicode.com/posts",
    JSON.stringify({ title: "Test Post", body: "Hello World", userId: 1 }),
  );

  // Test 4: Another GET
  await makeRequest(
    "https://jsonplaceholder.typicode.com/comments?postId=1",
    "GET",
  );

  console.log("\nAll requests completed!");
}

function makeRequest(url: string, method: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        console.log(`✓ ${method} ${url} → ${res.statusCode}`);
        resolve();
      });
    });

    req.on("error", (err) => {
      console.error(`✗ ${method} ${url} → Error: ${err.message}`);
      reject(err);
    });
  });
}

function makePostRequest(url: string, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        console.log(`✓ POST ${url} → ${res.statusCode}`);
        resolve();
      });
    });

    req.on("error", (err) => {
      console.error(`✗ POST ${url} → Error: ${err.message}`);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

// Run the tests
makeTestRequests().catch(console.error);
