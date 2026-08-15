"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  heroMediaEmbedUrl,
  type HeroMedia as HeroMediaValue,
} from "@mydaust/shared";
import { assetUrl } from "@/lib/api";

const PAUSED_KEY = "daust-hero-video-paused";
const YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";

function startYoutubePlayer(frame: HTMLIFrameElement | null) {
  const player = frame?.contentWindow;
  if (!player) return;
  player.postMessage(
    JSON.stringify({ event: "listening", id: "daust-hero-youtube" }),
    YOUTUBE_ORIGIN,
  );
  for (const func of ["mute", "playVideo"]) {
    player.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      YOUTUBE_ORIGIN,
    );
  }
}

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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [eligible, setEligible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(true);
  const [providerPlaying, setProviderPlaying] = useState(false);
  const mediaKey = JSON.stringify(media);

  useEffect(() => {
    setFailed(false);
    setProviderPlaying(false);
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

  useEffect(() => {
    if (media.kind !== "youtube" || !eligible || failed || paused) return;

    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        (event.origin !== YOUTUBE_ORIGIN &&
          event.origin !== "https://www.youtube.com")
      ) {
        return;
      }
      let data: { event?: string; info?: number } | null = null;
      try {
        data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.event === "onReady") startYoutubePlayer(iframeRef.current);
      if (data?.event === "onStateChange" && data.info === 1) {
        setProviderPlaying(true);
      }
    };

    window.addEventListener("message", onMessage);
    startYoutubePlayer(iframeRef.current);
    return () => window.removeEventListener("message", onMessage);
  }, [eligible, failed, media.kind, paused]);

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
  const embed = heroMediaEmbedUrl(media);

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
          ref={iframeRef}
          id={media.kind === "youtube" ? "daust-hero-youtube" : undefined}
          src={embed}
          title="DAUST campus background video"
          allow="autoplay; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setFailed(true)}
          onLoad={() => {
            if (media.kind !== "youtube") {
              setProviderPlaying(true);
              return;
            }
            startYoutubePlayer(iframeRef.current);
          }}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-10%",
            width: "120%",
            height: "120%",
            border: 0,
            pointerEvents: "none",
            opacity: media.kind === "youtube" && !providerPlaying ? 0 : 1,
            transition: "opacity 180ms ease",
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
