import { describe, expect, it } from "vitest";
import {
  EMPTY_SITE_OVERRIDES,
  heroMediaEmbedUrl,
  normalizeHeroMediaUrl,
  sanitizeSiteOverrides,
} from "./site-content.js";

describe("hero media URLs", () => {
  it("normalizes supported direct and provider URLs", () => {
    expect(
      normalizeHeroMediaUrl("https://cdn.example.org/campus.webm"),
    ).toEqual({
      kind: "direct",
      url: "https://cdn.example.org/campus.webm",
    });
    expect(normalizeHeroMediaUrl("https://youtu.be/abcDEF12345")).toEqual({
      kind: "youtube",
      videoId: "abcDEF12345",
    });
    expect(normalizeHeroMediaUrl("https://vimeo.com/123456789")).toEqual({
      kind: "vimeo",
      videoId: "123456789",
    });
  });

  it("builds a chrome-free autoplaying loop for a YouTube hero", () => {
    const media = normalizeHeroMediaUrl(
      "https://www.youtube.com/watch?v=Mt9jSB0rP2o",
    );
    expect(media).toEqual({ kind: "youtube", videoId: "Mt9jSB0rP2o" });

    const embed = heroMediaEmbedUrl(media!);
    expect(embed).toContain(
      "https://www.youtube-nocookie.com/embed/Mt9jSB0rP2o?",
    );
    expect(embed).toContain("autoplay=1");
    expect(embed).toContain("mute=1");
    expect(embed).toContain("controls=0");
    expect(embed).toContain("loop=1");
    expect(embed).toContain("playlist=Mt9jSB0rP2o");
    expect(embed).toContain("disablekb=1");
  });

  it("rejects unsafe schemes and unsupported iframe providers", () => {
    expect(normalizeHeroMediaUrl("data:video/mp4;base64,abc")).toBeNull();
    expect(normalizeHeroMediaUrl("http://example.org/campus.mp4")).toBeNull();
    expect(normalizeHeroMediaUrl("https://example.org/watch/123")).toBeNull();
  });

  it("falls back to image when persisted media metadata is invalid", () => {
    const sanitized = sanitizeSiteOverrides({
      ...EMPTY_SITE_OVERRIDES,
      heroMedia: { kind: "youtube", videoId: "<script>" },
    });
    expect(sanitized.heroMedia).toEqual({ kind: "image" });
  });
});
