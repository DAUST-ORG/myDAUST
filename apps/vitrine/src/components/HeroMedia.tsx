"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  heroMediaEmbedUrl,
  type HeroMedia as HeroMediaValue,
} from "@mydaust/shared";
import { assetUrl } from "@/lib/api";

const PAUSED_KEY = "daust-hero-video-paused";

type YouTubePlayer = {
  destroy: () => void;
  mute: () => void;
  playVideo: () => void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onError: () => void;
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { PLAYING: number };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player API did not initialize."));
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existing) {
      existing.addEventListener(
        "error",
        () => reject(new Error("YouTube player API failed to load.")),
        {
          once: true,
        },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.addEventListener(
      "error",
      () => reject(new Error("YouTube player API failed to load.")),
      {
        once: true,
      },
    );
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
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
  const [providerOrigin, setProviderOrigin] = useState<string>();
  const mediaKey = JSON.stringify(media);

  useEffect(() => {
    setFailed(false);
    setProviderPlaying(false);
    setProviderOrigin(window.location.origin);
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

    let active = true;
    let player: YouTubePlayer | null = null;
    void loadYouTubeApi()
      .then((api) => {
        if (!active || !iframeRef.current) return;
        player = new api.Player(iframeRef.current, {
          events: {
            onReady: (event) => {
              event.target.mute();
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === api.PlayerState.PLAYING) {
                setProviderPlaying(true);
              }
            },
            onError: () => setFailed(true),
          },
        });
      })
      .catch(() => setFailed(true));

    return () => {
      active = false;
      player?.destroy();
    };
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
  const embed = heroMediaEmbedUrl(media, providerOrigin);

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
            }
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
