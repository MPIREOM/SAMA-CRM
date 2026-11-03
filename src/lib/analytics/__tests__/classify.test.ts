import { describe, expect, it } from "vitest";
import { browserFromUa, classifyPath, deviceFromUa, isBot, referrerHost, trafficSource } from "../classify";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("classifyPath", () => {
  it.each([
    ["/en", "en", "home", null],
    ["/ar/rooms", "ar", "rooms", null],
    ["/en/rooms/chalet", "en", "room", "chalet"],
    ["/en/book", "en", "results", null],
    ["/en/book/chalet", "en", "booking", "chalet"],
    ["/en/the-peak", "en", "content", null],
    ["/en/something-else", "en", "other", null],
  ])("%s", (path, locale, pageType, room) => {
    const r = classifyPath(path);
    expect(r.locale).toBe(locale);
    expect(r.pageType).toBe(pageType);
    expect(r.roomSlug).toBe(room);
  });

  it("confirmation and manage pages carry the booking ref", () => {
    expect(classifyPath("/ar/booking/sama-26-abc123")).toMatchObject({ pageType: "confirmation", bookingRef: "SAMA-26-ABC123" });
    expect(classifyPath("/en/booking/SAMA-26-ABC123/manage").pageType).toBe("manage");
  });
});

describe("traffic source", () => {
  it("prefers utm_source, then known channels, then the host, else direct", () => {
    expect(trafficSource("Newsletter", "google.com")).toBe("newsletter");
    expect(trafficSource(null, referrerHost("https://www.google.com/search?q=sama"))).toBe("google");
    expect(trafficSource(null, referrerHost("https://l.instagram.com/?u=x"))).toBe("instagram");
    expect(trafficSource(null, referrerHost("https://m.facebook.com/"))).toBe("facebook");
    expect(trafficSource(null, referrerHost("https://example.org/page"))).toBe("example.org");
    expect(trafficSource(null, null)).toBe("direct");
    expect(trafficSource(null, "samahotel.net", ["www.samahotel.net"])).toBe("direct");
  });

  it("ignores invalid referrers", () => {
    expect(referrerHost("not a url")).toBeNull();
    expect(referrerHost("")).toBeNull();
  });
});

describe("user agent", () => {
  it("detects device and browser", () => {
    expect(deviceFromUa(IPHONE)).toBe("mobile");
    expect(deviceFromUa(IPAD)).toBe("tablet");
    expect(deviceFromUa(MAC_CHROME)).toBe("desktop");
    expect(browserFromUa(IPHONE)).toBe("Safari");
    expect(browserFromUa(MAC_CHROME)).toBe("Chrome");
    expect(browserFromUa(`${IPHONE} Instagram 300.0`)).toBe("Instagram app");
  });

  it("filters bots and empty agents", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(IPHONE)).toBe(false);
    expect(isBot(MAC_CHROME)).toBe(false);
  });
});
