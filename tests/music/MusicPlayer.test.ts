import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import type { SceneMusicConfig } from "../../src/music/types";

vi.mock("../../src/music/AudioLayer", () => ({
  AudioLayer: class {
    state = {
      currentPlaylistId: null as string | null,
      currentTrackIndex: -1,
      isPlaying: false,
      repeatMode: "playlist" as "none" | "playlist" | "track",
      isShuffled: false,
      volume: 70,
      isMuted: false,
      position: 0,
      duration: 0,
    };

    fadeDurationMs = 0;
    stopCalled = false;
    loadPlaylistCalled = false;
    playCalled = false;
    duckVolumeCalled = 0;
    unduckVolumeCalled = 0;

    constructor(_app: any, volume: number, fadeDurationMs: number) {
      this.state.volume = volume;
      this.fadeDurationMs = fadeDurationMs;
    }

    stopAsync(): Promise<void> {
      return new Promise<void>(() => {
        // Intentionally unresolved by default to simulate a hung fade.
      });
    }

    stop() {
      this.stopCalled = true;
      this.state.isPlaying = false;
      this.state.position = 0;
    }

    loadPlaylist(playlist: { id: string }) {
      this.loadPlaylistCalled = true;
      this.state.currentPlaylistId = playlist.id;
      this.state.currentTrackIndex = 0;
    }

    play() {
      this.playCalled = true;
      this.state.isPlaying = true;
    }

    setVolume(volume: number) {
      this.state.volume = volume;
    }

    destroy() {}
    pause() {}
    togglePlayPause() {}
    next() {}
    previous() {}
    seek(_seconds: number) {}
    seekPercent(_pct: number) {}
    toggleMute() {}
    fadeVolumeTo(_target: number, _durationMs: number) { return Promise.resolve(); }
    toggleShuffle() {}
    cycleRepeatMode() {}
    getCurrentTrack() { return null; }
    getTrackList() { return []; }
    playTrackByIndex(_index: number) {}
    duckVolume(_amount: number, _fadeMs: number) { this.duckVolumeCalled++; }
    unduckVolume(_fadeMs: number) { this.unduckVolumeCalled++; }
  },
}));

import { MusicPlayer } from "../../src/music/MusicPlayer";

class MockAudio extends EventTarget {
  paused = true;
  ended = false;
  src = "";
  volume = 1;
  currentTime = 0;
  play = vi.fn(() => {
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
  finish() {
    this.ended = true;
    this.paused = true;
    this.dispatchEvent(new Event("ended"));
  }
}

function createSettings() {
  return {
    defaultVolume: 70,
    ambientVolume: 50,
    fadeDurationMs: 0,
    playlists: [
      { id: "p1", name: "Primary", trackPaths: ["music/a.mp3"] },
      { id: "a1", name: "Ambient", trackPaths: ["music/b.mp3"] },
    ],
    soundEffects: [],
    duckingEnabled: true,
    duckingAmount: 50,
    duckingFadeDownMs: 100,
    duckingFadeUpMs: 400,
  } as any;
}

describe("music/MusicPlayer transition hardening", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Audio", MockAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("stopAll recovers if layer stopAsync hangs", async () => {
    const player = new MusicPlayer({} as any, createSettings());

    const stopPromise = player.stopAll();
    expect(player.isStopping()).toBe(true);

    await vi.advanceTimersByTimeAsync(1600);
    await stopPromise;

    expect(player.isStopping()).toBe(false);
    expect((player.primary as any).stopCalled).toBe(true);
    expect((player.ambient as any).stopCalled).toBe(true);
  });

  it("loadSceneMusic recovers from hung stop and still loads playlists", async () => {
    const player = new MusicPlayer({} as any, createSettings());

    const config: SceneMusicConfig = {
      primaryPlaylistId: "p1",
      primaryTrackPath: null,
      ambientPlaylistId: "a1",
      ambientTrackPath: null,
      autoPlay: true,
    };

    const loadPromise = player.loadSceneMusic(config, true);
    expect(player.isTransitioning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1600);
    await loadPromise;

    expect(player.isTransitioning()).toBe(false);
    expect((player.primary as any).loadPlaylistCalled).toBe(true);
    expect((player.ambient as any).loadPlaylistCalled).toBe(true);
    expect((player.primary as any).playCalled).toBe(true);
    expect((player.ambient as any).playCalled).toBe(true);
  });
});

describe("music/MusicPlayer sound effect playback handles", () => {
  beforeEach(() => {
    vi.stubGlobal("Audio", MockAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createAppWithAudioFile(path: string) {
    const file = Object.assign(new TFile(), { path });
    return {
      vault: {
        getAbstractFileByPath: vi.fn((candidate: string) => candidate === path ? file : null),
        getResourcePath: vi.fn(() => `app://vault/${path}`),
      },
    } as any;
  }

  it("returns a handle that stops the active SFX and restores ducking", () => {
    const player = new MusicPlayer(createAppWithAudioFile("sfx/ring.mp3"), createSettings());

    const playback = player.playSoundEffect({
      id: "ring",
      name: "Telephone Ringing",
      filePath: "sfx/ring.mp3",
      icon: "☎️",
    });

    expect(playback).not.toBeNull();
    expect(playback!.isPlaying()).toBe(true);
    expect((player.primary as any).duckVolumeCalled).toBe(1);
    expect((player.ambient as any).duckVolumeCalled).toBe(1);

    playback!.stop();

    expect(playback!.isPlaying()).toBe(false);
    expect((player.primary as any).unduckVolumeCalled).toBe(1);
    expect((player.ambient as any).unduckVolumeCalled).toBe(1);
  });

  it("marks the handle stopped when the SFX ends naturally", () => {
    const player = new MusicPlayer(createAppWithAudioFile("sfx/chime.mp3"), createSettings());
    const playback = player.playSoundEffect({
      id: "chime",
      name: "Chime",
      filePath: "sfx/chime.mp3",
      icon: "🔔",
    });
    const onStop = vi.fn();
    playback!.onStop(onStop);

    const audio = (player as any).sfxAudios[0] as MockAudio;
    audio.finish();

    expect(playback!.isPlaying()).toBe(false);
    expect(onStop).toHaveBeenCalledOnce();
    expect((player.primary as any).unduckVolumeCalled).toBe(1);
    expect((player.ambient as any).unduckVolumeCalled).toBe(1);
  });
});
