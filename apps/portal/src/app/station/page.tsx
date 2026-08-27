"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Coffee,
  LogOut,
  Moon,
  QrCode,
  ShieldAlert,
  Utensils,
  XCircle,
} from "lucide-react";
import {
  type LiveScans,
  type Me,
  type ScanResult,
  diningScan,
  diningScanOverride,
  fileUrl,
  getLiveScans,
  getMe,
  logout,
} from "@/lib/api";

const MEALS = [
  {
    key: "breakfast",
    label: "Breakfast",
    window: "07:00 – 09:00",
    icon: Coffee,
  },
  { key: "lunch", label: "Lunch", window: "12:00 – 14:00", icon: Utensils },
  { key: "dinner", label: "Dinner", window: "19:00 – 21:00", icon: Moon },
] as const;

/** Four seconds on the ambient feed. The verdict itself is never polled — a scan is a POST
 *  whose response IS the answer, so the door never waits on a timer. */
const POLL_MS = 4_000;
const HOLD_SERVED_MS = 2_600;
const HOLD_DENIED_MS = 4_200;

/** The prototype's two-tone accept and low square reject. Behaviour, not decoration:
 *  staff work this door by ear while looking at the student, not the screen. */
function beep(ok: boolean) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new Ctx();
    const t = ac.currentTime;
    if (ok) {
      [659.25, 880].forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(g);
        g.connect(ac.destination);
        g.gain.setValueAtTime(0, t + i * 0.09);
        g.gain.linearRampToValueAtTime(0.16, t + i * 0.09 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.18);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.2);
      });
    } else {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "square";
      o.frequency.value = 160;
      o.connect(g);
      g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.start(t);
      o.stop(t + 0.34);
    }
  } catch {
    // No audio device, or the tablet has not been interacted with yet. Visual is enough.
  }
}

function currentMeal() {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 17) return "lunch";
  return "dinner";
}

export default function StationPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [period, setPeriod] = useState<string>(currentMeal);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [feed, setFeed] = useState<LiveScans | null>(null);
  const [clock, setClock] = useState("");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [buffer, setBuffer] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async (p: string) => {
    try {
      setFeed(await getLiveScans(p));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refresh(period);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh(period);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [period, refresh]);

  // The wedge scanner types into a focused input and sends Enter. Keep focus on it
  // unless the operator is deliberately typing a student number.
  const focusScanner = useCallback(() => {
    if (document.activeElement?.getAttribute("data-manual") !== "true") {
      inputRef.current?.focus();
    }
  }, []);
  useEffect(() => {
    focusScanner();
    const id = setInterval(focusScanner, 1_500);
    return () => clearInterval(id);
  }, [focusScanner]);

  function hold(verdict: ScanResult) {
    setResult(verdict);
    beep(verdict.result === "served");
    if (holdRef.current) clearTimeout(holdRef.current);
    holdRef.current = setTimeout(
      () => setResult(null),
      verdict.result === "served" ? HOLD_SERVED_MS : HOLD_DENIED_MS,
    );
  }

  async function submitToken(token: string) {
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      hold(await diningScan(token.trim(), period));
      refresh(period);
    } catch {
      setOnline(false);
    } finally {
      setBusy(false);
    }
  }

  async function submitOverride(studentNo: string) {
    if (!studentNo.trim() || busy) return;
    setBusy(true);
    try {
      hold(await diningScanOverride(studentNo.trim(), period));
      setManual("");
      refresh(period);
    } catch {
      setOnline(false);
    } finally {
      setBusy(false);
    }
  }

  const meal = MEALS.find((m) => m.key === period) ?? MEALS[1];
  const served = result?.result === "served";

  return (
    // The station is pinned to the light palette: it is a fixed-brightness appliance in a
    // bright hall, and the viewer's dark-mode preference has no bearing on that wall.
    <div
      data-theme="light"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-subtle, #f5f7f9)",
        fontFamily: "var(--font-body)",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          height: 74,
          flexShrink: 0,
          background: "var(--daust-navy)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "0 24px",
        }}
      >
        <strong
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            letterSpacing: ".02em",
          }}
        >
          Dining Entrance ·{" "}
          <span style={{ opacity: 0.7, fontWeight: 500 }}>Main Hall</span>
        </strong>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 4,
            background: "rgba(255,255,255,.1)",
            padding: 4,
            borderRadius: 999,
          }}
        >
          {MEALS.map((m) => {
            const on = m.key === period;
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => setPeriod(m.key)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 999,
                  padding: "8px 16px",
                  background: on ? "var(--daust-orange)" : "transparent",
                  color: on ? "#fff" : "rgba(255,255,255,.72)",
                  fontWeight: 600,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <Icon size={15} /> {m.label}
              </button>
            );
          })}
        </div>

        <div style={{ textAlign: "right", minWidth: 96 }}>
          <div
            style={{ fontWeight: 700, fontSize: 18, letterSpacing: ".04em" }}
          >
            {clock}
          </div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.75,
              display: "flex",
              alignItems: "center",
              gap: 6,
              justifyContent: "flex-end",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: online ? "#4ade80" : "#f87171",
              }}
            />
            {online ? "Online" : "Reconnecting"}
          </div>
        </div>

        <button
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
          title={me ? `Signed in as ${me.name}` : "End station session"}
          style={{
            border: "none",
            background: "rgba(255,255,255,.12)",
            color: "#fff",
            borderRadius: 999,
            padding: "9px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <LogOut size={15} /> End session
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Viewfinder */}
        <main
          style={{
            flex: 1,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 24,
                margin: 0,
              }}
            >
              Scan student QR
            </h1>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--daust-orange)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              {meal.label} · {meal.window}
            </span>
          </div>

          <div
            onClick={focusScanner}
            style={{
              flex: 1,
              borderRadius: 18,
              position: "relative",
              overflow: "hidden",
              minHeight: 0,
              background:
                "radial-gradient(120% 120% at 50% 30%, #1a2733 0%, #0c151d 100%)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {result ? (
              <ResultOverlay verdict={result} onOverride={submitOverride} />
            ) : (
              <div
                style={{ textAlign: "center", color: "rgba(255,255,255,.6)" }}
              >
                <QrCode size={64} style={{ opacity: 0.55 }} />
                <p style={{ marginTop: 14, fontSize: 14 }}>
                  {busy
                    ? "Reading code…"
                    : "Hold the student's QR code inside the frame"}
                </p>
              </div>
            )}
            {/* The wedge scanner types the token here and sends Enter. Visually hidden and
                kept focused, so staff never touch the tablet during a service. */}
            <input
              ref={inputRef}
              aria-label="Scan pass token"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const token = buffer;
                setBuffer("");
                submitToken(token);
              }}
              style={{
                position: "absolute",
                opacity: 0,
                width: 1,
                height: 1,
              }}
            />
          </div>

          {/* Manual entry: the fallback when a pass will not scan. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitOverride(manual);
            }}
            style={{ display: "flex", gap: 10, marginTop: 16 }}
          >
            <input
              data-manual="true"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Student number — manual serve"
              style={{
                flex: 1,
                padding: "11px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                fontSize: 14,
                fontFamily: "var(--font-body)",
              }}
            />
            <button
              type="submit"
              disabled={busy || !manual.trim()}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "11px 22px",
                background: "var(--daust-orange)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy || !manual.trim() ? 0.55 : 1,
              }}
            >
              Serve
            </button>
          </form>
        </main>

        {/* Session panel */}
        <aside
          style={{
            width: 320,
            flexShrink: 0,
            background: "#fff",
            borderLeft: "1px solid var(--divider)",
            padding: 20,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <Counter
              value={feed?.served ?? 0}
              label={`Served · ${meal.label.toLowerCase()}`}
              tone="#2e7d52"
              bg="#eaf3ee"
            />
            <Counter
              value={feed?.turnedAway ?? 0}
              label="Turned away"
              tone="#c0392b"
              bg="#fbecea"
            />
          </div>

          <p
            style={{
              fontSize: 11,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "var(--fg3)",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Recent scans
          </p>
          {!feed?.recent.length ? (
            <p style={{ fontSize: 13, color: "var(--fg3)" }}>
              No scans yet this service.
            </p>
          ) : (
            feed.recent.map((s, i) => (
              <div
                key={`${s.studentNo}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 0",
                  borderBottom: "1px solid var(--divider)",
                }}
              >
                {s.result === "served" ? (
                  <CheckCircle2 size={17} color="#2e7d52" />
                ) : (
                  <XCircle size={17} color="#c0392b" />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--fg3)" }}>
                    {s.reason ?? s.studentNo}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--fg3)" }}>
                  {new Date(s.time).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}

function Counter({
  value,
  label,
  tone,
  bg,
}: {
  value: number;
  label: string;
  tone: string;
  bg: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: bg,
        borderRadius: 14,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 30,
          color: tone,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--fg2)", marginTop: 5 }}>
        {label}
      </div>
    </div>
  );
}

function ResultOverlay({
  verdict,
  onOverride,
}: {
  verdict: ScanResult;
  onOverride: (studentNo: string) => void;
}) {
  const served = verdict.result === "served";
  return (
    <div
      role="status"
      aria-live="assertive"
      style={{
        position: "absolute",
        inset: 0,
        background: served ? "#2e7d52" : "#c0392b",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
      }}
    >
      {served ? <CheckCircle2 size={72} /> : <ShieldAlert size={72} />}
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 44,
          letterSpacing: ".04em",
          lineHeight: 1,
        }}
      >
        {served ? "SERVED" : verdict.code}
      </div>

      {/* The photo is the actual control against a shared screenshot — the pass token is a
          stable HMAC and cannot tell two students apart. */}
      {verdict.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fileUrl(verdict.photoUrl)}
          alt=""
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            objectFit: "cover",
            border: "3px solid rgba(255,255,255,.65)",
          }}
        />
      )}

      {verdict.name && (
        <div style={{ fontSize: 22, fontWeight: 700 }}>{verdict.name}</div>
      )}
      {verdict.studentNo && (
        <div style={{ opacity: 0.85, fontSize: 15, letterSpacing: ".04em" }}>
          {verdict.studentNo}
          {verdict.program ? ` · ${verdict.program}` : ""}
        </div>
      )}
      {verdict.reason && (
        <div style={{ opacity: 0.92, fontSize: 15, maxWidth: 420 }}>
          {verdict.reason}
        </div>
      )}

      {verdict.overridable && verdict.studentNo && (
        <button
          onClick={() => onOverride(verdict.studentNo!)}
          style={{
            marginTop: 6,
            border: "2px solid rgba(255,255,255,.75)",
            background: "transparent",
            color: "#fff",
            borderRadius: 999,
            padding: "10px 24px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Serve anyway — records an override
        </button>
      )}
    </div>
  );
}
