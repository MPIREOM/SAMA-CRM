import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, FALLBACK_APP_URL } from "../app-url";

afterEach(() => vi.unstubAllEnvs());

describe("appOrigin", () => {
  it("uses NEXT_PUBLIC_APP_URL without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.samahotel.net/");
    expect(appOrigin()).toBe("https://www.samahotel.net");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", " https://www.samahotel.net ");
    expect(appOrigin()).toBe("https://www.samahotel.net");
  });

  it("falls back to the Vercel address when unset, a placeholder, or not a URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(appOrigin()).toBe(FALLBACK_APP_URL);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://YOUR_DOMAIN");
    expect(appOrigin()).toBe(FALLBACK_APP_URL);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "www.samahotel.net");
    expect(appOrigin()).toBe(FALLBACK_APP_URL);
  });
});
