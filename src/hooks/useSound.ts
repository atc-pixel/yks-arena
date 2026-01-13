"use client";

import { useEffect, useRef } from "react";

type SoundName = "click" | "correct" | "wrong" | "spin" | "win";

type AudioMap = Partial<Record<SoundName, HTMLAudioElement>>;

function safeCreateAudio(src: string): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  try {
    const a = new Audio(src);
    a.preload = "auto";
    return a;
  } catch {
    return null;
  }
}

function safePlay(a: HTMLAudioElement | undefined | null, { loop = false } = {}) {
  if (!a) return;
  try {
    a.loop = loop;
    // If the element hasn't loaded yet, play() may reject—ignore.
    a.currentTime = 0;
    const p = a.play();
    // Type guard for Promise (play() returns Promise<void> | undefined)
    if (p instanceof Promise) {
      p.catch(() => void 0);
    }
  } catch {
    // ignore
  }
}

function safeStop(a: HTMLAudioElement | undefined | null) {
  if (!a) return;
  try {
    a.loop = false;
    a.pause();
    a.currentTime = 0;
  } catch {
    // ignore
  }
}

export function useSound() {
  const audioRef = useRef<AudioMap>({});

  // Lazily create audios only once on client
  useEffect(() => {
    if (typeof window === "undefined") return;

    const map: Partial<Record<SoundName, string>> = {
      click: "/sounds/click.mp3",
      correct: "/sounds/correct.mp3",
      wrong: "/sounds/wrong.mp3",
      spin: "/sounds/spin.mp3",
      win: "/sounds/win.mp3",
    };

    (Object.keys(map) as SoundName[]).forEach((k) => {
      if (audioRef.current[k]) return;
      const a = safeCreateAudio(map[k]!);
      if (a) audioRef.current[k] = a;
    });
  }, []);

  return {
    playClick: () => safePlay(audioRef.current.click),
    playCorrect: () => safePlay(audioRef.current.correct),
    playWrong: () => safePlay(audioRef.current.wrong),
    playSpin: () => safePlay(audioRef.current.spin, { loop: true }),
    stopSpin: () => safeStop(audioRef.current.spin),
    playWin: () => safePlay(audioRef.current.win),
  };
}
