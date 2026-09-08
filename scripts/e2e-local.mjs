#!/usr/bin/env node
// `npm run e2e:local` — start the Supabase emulator, build the app against it
// (NEXT_PUBLIC_* are inlined at build time, so the env must be set BEFORE
// `next build`), then run the Playwright suite. Extra CLI args are passed to
// `playwright test` (e.g. `npm run e2e:local -- --project=desktop e2e/guest.spec.ts`).
// Set E2E_SKIP_BUILD=1 to reuse the existing .next build.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const MOCK_PORT = process.env.MOCK_SUPABASE_PORT ?? "54321";
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: MOCK_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "mock-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "mock-service-role-key",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3411"}`,
  MOCK_SUPABASE_PORT: MOCK_PORT,
  MOCK_QUIET: process.env.MOCK_QUIET ?? "1",
  // Make sure no real provider credentials leak into the run: sends must be stubbed.
  RESEND_API_KEY: "",
  WHATSAPP_ACCESS_TOKEN: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
};

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env, ...opts });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`))));
    child.on("error", reject);
  });
}

async function waitForMock(attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${MOCK_URL}/__mock/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`mock-supabase did not come up on ${MOCK_URL}`);
}

const mock = spawn(npx, ["tsx", "scripts/mock-supabase/server.ts"], { stdio: "inherit", env });
const stopMock = () => {
  if (!mock.killed) mock.kill("SIGTERM");
};
process.on("exit", stopMock);
process.on("SIGINT", () => {
  stopMock();
  process.exit(130);
});

let exitCode = 0;
try {
  await waitForMock();
  if (process.env.E2E_SKIP_BUILD !== "1") await run(npx, ["next", "build"]);
  await run(npx, ["playwright", "test", ...process.argv.slice(2)]);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  exitCode = 1;
} finally {
  stopMock();
}
process.exit(exitCode);
