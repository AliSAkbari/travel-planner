import type { Express } from 'express';
import { defineSecret } from 'firebase-functions/params';
import { onInit } from 'firebase-functions/v2/core';
import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

// Production entry point: the Express app as a 2nd-gen Firebase HTTPS function.
// Firebase Hosting rewrites /api/** and /health here (see firebase.json).
// Like server.ts, it only wires config to the app, so it is excluded from
// unit-test coverage and verified with the Firebase emulators instead.

// Stored in Google Secret Manager; set with `firebase functions:secrets:set <NAME>`.
const jwtSecret = defineSecret('JWT_SECRET');
const demoPasswordHash = defineSecret('DEMO_PASSWORD_HASH');
// Optional for the app, but once bound here it must exist in Secret Manager or
// the deploy fails. It gives ip2location.io a per-key quota (docs/ARCHITECTURE.md §5.3).
const ip2locationApiKey = defineSecret('IP2LOCATION_API_KEY');

let app: Express | undefined;

// Secret values can't be read at module scope: the Firebase CLI loads this file
// during deploy, before secrets exist. onInit runs once per instance at startup
// (never during deploy), so the app is built here.
onInit(() => {
  // loadConfig stays the single place config is validated: secrets are merged
  // into the same env object that local development passes in from process.env.
  const env: NodeJS.ProcessEnv = {
    ...process.env, // non-secret settings deployed from backend/.env.<projectId>
    JWT_SECRET: jwtSecret.value(),
    DEMO_PASSWORD_HASH: demoPasswordHash.value(),
    IP2LOCATION_API_KEY: ip2locationApiKey.value(),
  };
  // PORT belongs to the platform (the emulator even sets it to a socket path),
  // and this function never calls listen(), so it isn't ours to validate.
  delete env.PORT;

  app = createApp(loadConfig(env));
});

export const api = onRequest(
  {
    // Next to Hosting's colocated regions and close to Alberta.
    region: 'us-west1',
    // Anyone may invoke the function at the platform level: Hosting forwards
    // public traffic to it, and our own JWT middleware does the authentication.
    invoker: 'public',
    // Only these functions get access to the secrets.
    secrets: [jwtSecret, demoPasswordHash, ip2locationApiKey],
    // One instance caps cost if the app is flooded, and keeps a single set of
    // in-memory rate-limit counters and caches. It serves up to 80 requests at once.
    maxInstances: 1,
    concurrency: 80,
    cpu: 1,
  },
  (req, res) => {
    if (!app) throw new Error('App not initialised: onInit has not run');
    app(req, res);
  },
);
