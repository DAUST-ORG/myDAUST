"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HeroMedia as HeroMediaValue } from "@mydaust/shared";
import { assetUrl } from "@/lib/api";

const PAUSED_KEY = "daust-hero-video-paused";

export function HeroMedia({
  media,
  poster,
  label,
}: {
  media: HeroMediaValue;
  poster: string;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [eligible, setEligible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(true);
  const mediaKey = JSON.stringify(media);

  useEffect(() => {
    setFailed(false);
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const allowed =
      media.kind !== "image" &&
      !window.matchMedia("(max-width: 767px)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !connection?.saveData;
    const storedPaused = sessionStorage.getItem(PAUSED_KEY) === "true";
    setPaused(storedPaused);
    const frame = requestAnimationFrame(() => setEligible(allowed));
    return () => cancelAnimationFrame(frame);
  }, [mediaKey, media.kind]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !eligible || failed) return;
    if (paused) {
      video.pause();
      return;
    }
    void video.play().catch(() => setFailed(true));
  }, [eligible, failed, paused]);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    sessionStorage.setItem(PAUSED_KEY, String(next));
  };
  const showVideo = eligible && !failed && !paused && media.kind !== "image";
  const source =
    media.kind === "uploaded" || media.kind === "direct"
      ? assetUrl(media.url)
      : undefined;
  const embed =
    media.kind === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${media.videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${media.videoId}&playsinline=1&rel=0`
      : media.kind === "vimeo"
        ? `https://player.vimeo.com/video/${media.videoId}?background=1&autoplay=1&muted=1&loop=1&dnt=1`
        : null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- poster must paint before optional media */}
      <img
        src={assetUrl(poster)}
        alt={label}
        fetchPriority="high"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {showVideo && source && (
        <video
          ref={videoRef}
          src={source}
          poster={assetUrl(poster)}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onError={() => setFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      {showVideo && embed && (
        <iframe
          src={embed}
          title="DAUST campus background video"
          allow="autoplay; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setFailed(true)}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-10%",
            width: "120%",
            height: "120%",
            border: 0,
            pointerEvents: "none",
          }}
        />
      )}
      {eligible && media.kind !== "image" && !failed && (
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? "Play hero video" : "Pause hero video"}
          style={{
            position: "absolute",
            zIndex: 3,
            right: 24,
            bottom: 22,
            width: 42,
            height: 42,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,.65)",
            background: "rgba(10,26,48,.68)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          {paused ? (
            <Play size={17} fill="currentColor" />
          ) : (
            <Pause size={17} fill="currentColor" />
          )}
        </button>
      )}
    </>
  );
}
