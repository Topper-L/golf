import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8765',
    browserName: 'webkit',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true
  },
  webServer: {
    command: 'python3 -m http.server 8765',
    port: 8765,
    reuseExistingServer: true
  }
});
