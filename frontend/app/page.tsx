"use client";

import { useRef, useState, useCallback, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const FRAME_INTERVAL_MS = 900; // how often we sample a frame and call the API

type Counts = Record<string, number>;
type Box = { class: string; bbox: [number, number, number, number] };

function CountTile({ label, value, tone }: { label: string; value: number; tone: "live" | "sold" }) {
  const digits = String(value).padStart(2, "0").split("");
  const toneClass = tone === "live" ? "text-live border-live/40" : "text-sold border-sold/40";
  return (
    <div className="flex items-center justify-between border border-line bg-panel px-4 py-3">
      <span className="font-body text-sm text-muted uppercase tracking-wide">{label}</span>
      <div className="flex gap-1">
        {digits.map((d, i) => (
          <span
            key={i}
            className={`font-mono text-2xl tabular w-8 h-10 flex items-center justify-center border ${toneClass} bg-ink`}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [liveCounts, setLiveCounts] = useState<Counts>({});
  const [soldCounts, setSoldCounts] = useState<Counts>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "watching">("idle");

  const allClasses = Array.from(new Set([...Object.keys(liveCounts), ...Object.keys(soldCounts)]));

  const drawBoxes = useCallback((boxes: Box[]) => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.lineWidth = 3;
    ctx.font = "16px monospace";
    boxes.forEach((b) => {
      const [x1, y1, x2, y2] = b.bbox;
      ctx.strokeStyle = "#7FB069";
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.fillStyle = "#7FB069";
      ctx.fillText(b.class, x1 + 4, y1 > 18 ? y1 - 6 : y1 + 18);
    });
  }, []);

  const sendFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const sessionId = sessionIdRef.current;
    if (!video || !canvas || !sessionId || video.paused || video.ended) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const form = new FormData();
      form.append("file", blob, "frame.jpg");
      try {
        const res = await fetch(`${API_URL}/session/${sessionId}/frame`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setLiveCounts(data.live_counts || {});
        setSoldCounts(data.sold_counts || {});
        drawBoxes(data.boxes || []);
        setError(null);
      } catch (e: any) {
        setError(e.message || "Frame processing failed");
      }
    }, "image/jpeg", 0.85);
  }, [drawBoxes]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const res = await fetch(`${API_URL}/session/new`, { method: "POST" });
      if (!res.ok) throw new Error("Could not reach backend");
      const data = await res.json();
      sessionIdRef.current = data.session_id;
      setLiveCounts({});
      setSoldCounts({});
      videoRef.current?.play();
      setRunning(true);
      setStatus("watching");
      intervalRef.current = setInterval(sendFrame, FRAME_INTERVAL_MS);
    } catch (e: any) {
      setError(e.message || "Failed to start session");
      setStatus("idle");
    }
  }, [sendFrame]);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    videoRef.current?.pause();
    setRunning(false);
    setStatus("idle");
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      fetch(`${API_URL}/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoUrl(URL.createObjectURL(file));
    setLiveCounts({});
    setSoldCounts({});
  };

  return (
    <main className="min-h-screen bg-ink px-6 py-10 md:px-14">
      <header className="mb-10 flex items-end justify-between border-b border-line pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-signal mb-2">
            Shelf Watch
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight">
            Live product counter
          </h1>
          <p className="text-muted mt-2 max-w-md">
            Upload shelf footage. Items are tallied as sold the moment they leave the frame edge.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 font-mono text-xs uppercase text-muted">
          <span
            className={`w-2 h-2 rounded-full ${
              status === "watching" ? "bg-live" : status === "connecting" ? "bg-signal" : "bg-muted"
            }`}
          />
          {status}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
        {/* Video panel */}
        <section className="border border-line bg-panel p-4">
          {videoUrl ? (
            <div className="relative">
              <video
                ref={videoRef}
                src={videoUrl}
                muted
                loop
                className="w-full border border-line"
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-72 border border-dashed border-line cursor-pointer hover:border-signal transition-colors">
              <span className="font-mono text-sm text-muted uppercase tracking-wide">
                Click to upload footage
              </span>
              <span className="text-xs text-muted mt-1">MP4, MOV, or AVI</span>
              <input type="file" accept="video/*" className="hidden" onChange={onFileChange} />
            </label>
          )}
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-3 mt-4">
            <button
              onClick={start}
              disabled={!videoUrl || running}
              className="flex-1 bg-signal text-ink font-body font-semibold py-2 disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition"
            >
              Start watching
            </button>
            <button
              onClick={stop}
              disabled={!running}
              className="flex-1 border border-line text-paper font-body font-semibold py-2 disabled:opacity-30 disabled:cursor-not-allowed hover:border-sold hover:text-sold transition"
            >
              Stop
            </button>
          </div>

          {error && (
            <p className="mt-3 text-sm text-sold font-mono">{error}</p>
          )}
        </section>

        {/* Counts panel */}
        <section className="flex flex-col gap-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted mb-3">
              On shelf now
            </p>
            <div className="flex flex-col gap-2">
              {allClasses.length === 0 && (
                <p className="text-sm text-muted italic">No products tracked yet.</p>
              )}
              {allClasses.map((cls) => (
                <CountTile key={`live-${cls}`} label={cls} value={liveCounts[cls] || 0} tone="live" />
              ))}
            </div>
          </div>

          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted mb-3">
              Sold (left frame)
            </p>
            <div className="flex flex-col gap-2">
              {allClasses.length === 0 && (
                <p className="text-sm text-muted italic">Nothing sold yet.</p>
              )}
              {allClasses.map((cls) => (
                <CountTile key={`sold-${cls}`} label={cls} value={soldCounts[cls] || 0} tone="sold" />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
