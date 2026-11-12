import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RoundPositions } from "@/shared/api";
import type { ViewState } from "@/shared/ui/utils";

export const PLAYBACK_SPEEDS = [.5, 1, 2, 4] as const;

interface PlaybackOptions {
  roundKey: string;
  view: ViewState;
  setView: (patch: Partial<ViewState>) => void;
  positions: RoundPositions | undefined;
  endT: number;
}

/** Own the replay clock, keyboard controls and pause/resume when player details open. */
export function useRoundPlayback({ roundKey, view, setView, positions, endT }: PlaybackOptions) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);
  const [time, setTime] = useState(view.time ?? 0);
  const modalPlayback = useRef({ open: false, resume: false });

  // Start a different round with a stopped clock and the full map.
  const seen = useRef(roundKey);
  useLayoutEffect(() => {
    if (seen.current === roundKey) return;
    seen.current = roundKey;
    setPlaying(false);
    setTime(0);
    setView({ zoom: 1, center: null });
  }, [roundKey]);

  // Advance using elapsed frame time, so playback speed is independent of frame rate.
  useEffect(() => {
    if (!playing || !positions || endT <= 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt * speed;
        if (next >= endT) {
          setPlaying(false);
          return endT;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, endT, positions]);

  // Save the paused position to the URL without updating it on every animation frame.
  useEffect(() => {
    if (!view.playback || playing) return;
    const t = Math.round(time * 10) / 10;
    if ((view.time ?? 0) !== t) setView({ time: t });
  }, [playing, view.playback, time]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts share the same clock as the slider and play button.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "," || e.key === ".") {
        e.preventDefault();
        setPlaying(false);
        setTime((t) => Math.max(0, Math.min(endT, t + (e.key === "ArrowRight" || e.key === "." ? 1 : -1))));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endT]);

  // Closing player details resumes only a replay that was running when opened.
  useEffect(() => {
    if (view.player && !modalPlayback.current.open) {
      modalPlayback.current = { open: true, resume: playing };
      setPlaying(false);
    } else if (!view.player && modalPlayback.current.open) {
      const resume = modalPlayback.current.resume;
      modalPlayback.current = { open: false, resume: false };
      if (resume) setPlaying(true);
    }
  }, [view.player]); // เปิด modal ต้องหยุด replay โดยไม่เปลี่ยนเวลา

  return { playing, setPlaying, speed, setSpeed, time, setTime };
}
