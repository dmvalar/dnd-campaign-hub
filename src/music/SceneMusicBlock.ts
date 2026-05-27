/**
 * Scene Music Code Block – `dnd-music`
 *
 * Provides:
 *  1.  SceneMusicModal      – opened via the "Insert Scene Music" command to
 *                             let the GM pick a primary + ambient playlist/track.
 *  2.  renderSceneMusicBlock – registered as a Markdown code-block processor;
 *                             renders a compact card with a ▶ Play button.
 */
import { App, Modal, Setting, Notice, MarkdownPostProcessorContext, MarkdownRenderChild, Editor, TFile, TFolder } from 'obsidian';
import { MusicPlayer } from './MusicPlayer';
import type { MusicSettings, Playlist, SceneMusicConfig, RepeatMode } from './types';
import { DEFAULT_SCENE_MUSIC_CONFIG } from './types';

// ─────────────────────────────────────────────────────────────────
//  SceneMusicModal – form to configure primary + ambient music
// ─────────────────────────────────────────────────────────────────

export class SceneMusicModal extends Modal {
  private settings: MusicSettings;
  private config: SceneMusicConfig;
  private onSubmit: (config: SceneMusicConfig) => void;

  constructor(
    app: App,
    settings: MusicSettings,
    existing: SceneMusicConfig | null,
    onSubmit: (config: SceneMusicConfig) => void
  ) {
    super(app);
    this.settings = settings;
    this.config = existing
      ? { ...existing }
      : { ...DEFAULT_SCENE_MUSIC_CONFIG };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.modalEl.addClass('scene-music-modal');
    this.titleEl.setText('🎵 Scene Music Configuration');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    const playlists = this.settings.playlists;

    // ── Primary layer ──────────────────────────────────────
    contentEl.createEl('h4', { text: '🎵 Primary Layer' });

    // Playlist dropdown
    new Setting(contentEl)
      .setName('Playlist')
      .setDesc('Select a playlist for the primary (melodic) layer')
      .addDropdown(dd => {
        dd.addOption('', '— None —');
        for (const pl of playlists) {
          dd.addOption(pl.id, `${pl.name} (${pl.mood})`);
        }
        dd.setValue(this.config.primaryPlaylistId || '');
        dd.onChange(val => {
          this.config.primaryPlaylistId = val || null;
          // Reset track when playlist changes
          this.config.primaryTrackPath = null;
          this.render();
        });
      });

    // Track dropdown (only if a playlist is selected)
    if (this.config.primaryPlaylistId) {
      const pl = playlists.find(p => p.id === this.config.primaryPlaylistId);
      if (pl && pl.trackPaths.length > 0) {
        new Setting(contentEl)
          .setName('Starting Track')
          .setDesc('Optional: pick a specific track to start on')
          .addDropdown(dd => {
            dd.addOption('', '— Default (first / shuffle) —');
            for (const tp of pl.trackPaths) {
              const label = tp.split('/').pop() || tp;
              dd.addOption(tp, label);
            }
            dd.setValue(this.config.primaryTrackPath || '');
            dd.onChange(val => {
              this.config.primaryTrackPath = val || null;
            });
          });
      }
    }

    // ── Ambient layer ──────────────────────────────────────
    contentEl.createEl('h4', { text: '🌊 Ambient Layer' });

    const ambientPlaylists = playlists.filter(p => p.isBackgroundSound);
    new Setting(contentEl)
      .setName('Playlist')
      .setDesc('Select a playlist for the ambient (background) layer')
      .addDropdown(dd => {
        dd.addOption('', '— None —');
        for (const pl of ambientPlaylists) {
          dd.addOption(pl.id, `${pl.name} (${pl.mood})`);
        }
        dd.setValue(this.config.ambientPlaylistId || '');
        dd.onChange(val => {
          this.config.ambientPlaylistId = val || null;
          this.config.ambientTrackPath = null;
          this.render();
        });
      });

    if (this.config.ambientPlaylistId) {
      const pl = playlists.find(p => p.id === this.config.ambientPlaylistId);
      if (pl && pl.trackPaths.length > 0) {
        new Setting(contentEl)
          .setName('Starting Track')
          .setDesc('Optional: pick a specific track to start on')
          .addDropdown(dd => {
            dd.addOption('', '— Default (first / shuffle) —');
            for (const tp of pl.trackPaths) {
              const label = tp.split('/').pop() || tp;
              dd.addOption(tp, label);
            }
            dd.setValue(this.config.ambientTrackPath || '');
            dd.onChange(val => {
              this.config.ambientTrackPath = val || null;
            });
          });
      }
    }

    // ── Playback behaviour ─────────────────────────────────
    contentEl.createEl('h4', { text: '🔁 Playback' });

    const repeatLabels: { [K in RepeatMode]: string } = {
      'playlist': '🔁 Repeat Playlist',
      'track': '🔂 Repeat Track',
      'none': '▶️ No Repeat',
    };

    // Primary repeat mode
    new Setting(contentEl)
      .setName('Primary Repeat')
      .setDesc('How the primary playlist repeats')
      .addDropdown(dd => {
        dd.addOption('playlist', repeatLabels['playlist']);
        dd.addOption('track', repeatLabels['track']);
        dd.addOption('none', repeatLabels['none']);
        dd.setValue(this.config.primaryRepeatMode ?? 'playlist');
        dd.onChange(val => {
          this.config.primaryRepeatMode = val as RepeatMode;
        });
      });

    // Primary shuffle
    new Setting(contentEl)
      .setName('Primary Shuffle')
      .setDesc('Shuffle the track order in the primary playlist')
      .addToggle(t => {
        t.setValue(this.config.primaryShuffle ?? false);
        t.onChange(val => { this.config.primaryShuffle = val; });
      });

    // Ambient repeat mode
    new Setting(contentEl)
      .setName('Ambient Repeat')
      .setDesc('How the ambient playlist repeats')
      .addDropdown(dd => {
        dd.addOption('playlist', repeatLabels['playlist']);
        dd.addOption('track', repeatLabels['track']);
        dd.addOption('none', repeatLabels['none']);
        dd.setValue(this.config.ambientRepeatMode ?? 'playlist');
        dd.onChange(val => {
          this.config.ambientRepeatMode = val as RepeatMode;
        });
      });

    // Ambient shuffle
    new Setting(contentEl)
      .setName('Ambient Shuffle')
      .setDesc('Shuffle the track order in the ambient playlist')
      .addToggle(t => {
        t.setValue(this.config.ambientShuffle ?? false);
        t.onChange(val => { this.config.ambientShuffle = val; });
      });

    // ── Volume controls ───────────────────────────────────
    contentEl.createEl('h4', { text: '🔊 Volume' });

    // Primary layer volume
    const primaryVolVal = this.config.primaryVolume ?? this.settings.defaultVolume ?? 70;
    const primaryVolSetting = new Setting(contentEl)
      .setName('Primary Volume')
      .setDesc(`Volume for the primary (melodic) layer: ${primaryVolVal}%`);
    primaryVolSetting.addSlider(slider => {
      slider.setLimits(0, 100, 1);
      slider.setValue(primaryVolVal);
      slider.setDynamicTooltip();
      slider.onChange(val => {
        this.config.primaryVolume = val;
        primaryVolSetting.setDesc(`Volume for the primary (melodic) layer: ${val}%`);
      });
    });

    // Ambient layer volume
    const ambientVolVal = this.config.ambientVolume ?? this.settings.ambientVolume ?? 50;
    const ambientVolSetting = new Setting(contentEl)
      .setName('Ambient Volume')
      .setDesc(`Volume for the ambient (background) layer: ${ambientVolVal}%`);
    ambientVolSetting.addSlider(slider => {
      slider.setLimits(0, 100, 1);
      slider.setValue(ambientVolVal);
      slider.setDynamicTooltip();
      slider.onChange(val => {
        this.config.ambientVolume = val;
        ambientVolSetting.setDesc(`Volume for the ambient (background) layer: ${val}%`);
      });
    });

    // ── Options ────────────────────────────────────────────
    contentEl.createEl('h4', { text: '⚙️ Options' });

    new Setting(contentEl)
      .setName('Auto-play')
      .setDesc('Automatically start playback when the Play button is pressed')
      .addToggle(t => {
        t.setValue(this.config.autoPlay);
        t.onChange(val => { this.config.autoPlay = val; });
      });

    // ── Actions ────────────────────────────────────────────
    const actions = contentEl.createEl('div', { cls: 'scene-music-actions' });

    const insertBtn = actions.createEl('button', { text: 'Insert', cls: 'mod-cta' });
    insertBtn.addEventListener('click', () => {
      this.onSubmit(this.config);
      this.close();
    });

    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }
}

// ─────────────────────────────────────────────────────────────────
//  Lifecycle child – cleans up the scene-change listener when the
//  code block is removed from the document.
// ─────────────────────────────────────────────────────────────────

class SceneMusicRenderChild extends MarkdownRenderChild {
  private unsubscribe: () => void;

  constructor(
    containerEl: HTMLElement,
    musicPlayer: MusicPlayer,
    syncButton: () => void,
  ) {
    super(containerEl);
    this.unsubscribe = musicPlayer.onSceneChange(syncButton);
  }

  onunload() {
    this.unsubscribe();
  }
}

// ─────────────────────────────────────────────────────────────────
//  Code-block renderer  –  ```dnd-music
// ─────────────────────────────────────────────────────────────────

/**
 * Render function registered via `registerMarkdownCodeBlockProcessor('dnd-music', …)`.
 *
 * The code-block body is a JSON-encoded SceneMusicConfig.
 */
export function renderSceneMusicBlock(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  musicPlayer: MusicPlayer,
  settings: MusicSettings,
  onPlayTriggered?: () => void,
  app?: App
) {
  // ── Parse config ────────────────────────────────────────
  let config: SceneMusicConfig;
  try {
    config = JSON.parse(source.trim());
  } catch {
    el.createEl('div', {
      text: '⚠️ Invalid scene music configuration',
      cls: 'scene-music-block-error',
    });
    return;
  }

  const container = el.createEl('div', { cls: 'scene-music-block' });

  // ── Header ──────────────────────────────────────────────
  const header = container.createEl('div', { cls: 'scene-music-block-header' });
  header.createEl('span', { text: '🎵 Scene Music', cls: 'scene-music-block-title' });

  // Edit button – reopens the SceneMusicModal and writes the updated
  // config back into the code block.
  if (app) {
    const editBtn = header.createEl('button', {
      text: '✏️',
      cls: 'scene-music-edit-btn',
      attr: { 'aria-label': 'Edit scene music' },
    });
    editBtn.addEventListener('click', () => {
      new SceneMusicModal(app, settings, config, async (updated) => {
        const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;
        const content = await app.vault.read(file);
        const oldBlock = '```dnd-music\n' + source.trim() + '\n```';
        const newBlock = buildSceneMusicCodeblock(updated);
        if (content.includes(oldBlock)) {
          await app.vault.modify(file, content.replace(oldBlock, newBlock));
          new Notice('Scene music block updated');
        } else {
          new Notice('Could not locate code block to update');
        }
      }).open();
    });
  }

  // ── Summary rows ────────────────────────────────────────
  const body = container.createEl('div', { cls: 'scene-music-block-body' });

  // Primary
  const primaryRow = body.createEl('div', { cls: 'scene-music-row' });
  primaryRow.createEl('span', { text: '🎵 Primary:', cls: 'scene-music-label' });
  if (config.primaryPlaylistId) {
    const pl = settings.playlists.find(p => p.id === config.primaryPlaylistId);
    const plName = pl ? pl.name : '(unknown playlist)';
    let detail = plName;
    if (config.primaryTrackPath) {
      const trackName = config.primaryTrackPath.split('/').pop() || config.primaryTrackPath;
      detail += ` → ${trackName}`;
    }
    primaryRow.createEl('span', { text: detail, cls: 'scene-music-value' });
    const primaryBadges: string[] = [];
    if (config.primaryVolume != null) primaryBadges.push(`🔊 ${config.primaryVolume}%`);
    if (config.primaryRepeatMode && config.primaryRepeatMode !== 'playlist') {
      primaryBadges.push(config.primaryRepeatMode === 'track' ? '🔂 track' : '▶️ once');
    }
    if (config.primaryShuffle) primaryBadges.push('🔀');
    if (primaryBadges.length > 0) {
      primaryRow.createEl('span', { text: primaryBadges.join(' · '), cls: 'scene-music-volume-badge' });
    }
  } else {
    primaryRow.createEl('span', { text: 'None', cls: 'scene-music-value scene-music-none' });
  }

  // Ambient
  const ambientRow = body.createEl('div', { cls: 'scene-music-row' });
  ambientRow.createEl('span', { text: '🌊 Ambient:', cls: 'scene-music-label' });
  if (config.ambientPlaylistId) {
    const pl = settings.playlists.find(p => p.id === config.ambientPlaylistId);
    const plName = pl ? pl.name : '(unknown playlist)';
    let detail = plName;
    if (config.ambientTrackPath) {
      const trackName = config.ambientTrackPath.split('/').pop() || config.ambientTrackPath;
      detail += ` → ${trackName}`;
    }
    ambientRow.createEl('span', { text: detail, cls: 'scene-music-value' });
    const ambientBadges: string[] = [];
    if (config.ambientVolume != null) ambientBadges.push(`🔊 ${config.ambientVolume}%`);
    if (config.ambientRepeatMode && config.ambientRepeatMode !== 'playlist') {
      ambientBadges.push(config.ambientRepeatMode === 'track' ? '🔂 track' : '▶️ once');
    }
    if (config.ambientShuffle) ambientBadges.push('🔀');
    if (ambientBadges.length > 0) {
      ambientRow.createEl('span', { text: ambientBadges.join(' · '), cls: 'scene-music-volume-badge' });
    }
  } else {
    ambientRow.createEl('span', { text: 'None', cls: 'scene-music-value scene-music-none' });
  }

  // ── Play / Stop button ──────────────────────────────────
  const controls = container.createEl('div', { cls: 'scene-music-block-controls' });

  /** Sync button appearance with the actual player state. */
  const syncButton = () => {
    const busy = musicPlayer.isTransitioning();
    const active = musicPlayer.isScenePlaying(config);
    playBtn.disabled = busy;
    playBtn.classList.toggle('is-disabled', busy);
    if (active) {
      playBtn.textContent = '⏹ Stop';
      playBtn.classList.remove('mod-cta');
      playBtn.classList.add('mod-warning');
      playBtn.classList.add('scene-music-playing');
    } else {
      playBtn.textContent = '▶ Load & Play';
      playBtn.classList.add('mod-cta');
      playBtn.classList.remove('mod-warning');
      playBtn.classList.remove('scene-music-playing');
    }
  };

  const playBtn = controls.createEl('button', {
    text: '▶ Load & Play',
    cls: 'scene-music-play-btn mod-cta',
  });

  playBtn.addEventListener('click', async () => {
    // Ignore clicks while any scene transition is in progress
    if (musicPlayer.isTransitioning()) return;

    try {
      if (musicPlayer.isScenePlaying(config)) {
        // This scene is active → stop everything
        await musicPlayer.stopAll();
      } else {
        // Ensure the music player leaf is open before loading
        if (onPlayTriggered) onPlayTriggered();
        // Load & play this scene (stops any previous scene first)
        await musicPlayer.loadSceneMusic(config, config.autoPlay);
        new Notice('🎵 Scene music loaded' + (config.autoPlay ? ' & playing' : ''));
      }
    } finally {
      // Ensure UI state is refreshed even if a transition throws
      syncButton();
    }
  });

  // Initial sync in case this scene is already playing
  syncButton();

  // Listen for scene changes (another block started / stopped) so the
  // button always reflects reality.  Use MarkdownRenderChild so Obsidian
  // calls onunload() reliably when the code-block element is removed —
  // avoiding the fragile MutationObserver approach which could prematurely
  // unsubscribe during Obsidian's internal DOM rearrangements.
  const child = new SceneMusicRenderChild(el, musicPlayer, syncButton);
  ctx.addChild(child);

  // Auto-play indicator
  if (config.autoPlay) {
    controls.createEl('span', {
      text: '⚡ auto-play',
      cls: 'scene-music-autoplay-badge',
    });
  }
}

// ─────────────────────────────────────────────────────────────────
//  Helper – build code-block string for insertion into the editor
// ─────────────────────────────────────────────────────────────────

export function buildSceneMusicCodeblock(config: SceneMusicConfig): string {
  return '```dnd-music\n' + JSON.stringify(config, null, 2) + '\n```';
}

// ─────────────────────────────────────────────────────────────────
//  Inline renderer – <button data-dnd-music="...">Scene Music</button>
// ─────────────────────────────────────────────────────────────────

export function renderInlineSceneMusicWidgets(
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext,
  musicPlayer: MusicPlayer,
  _settings: MusicSettings,
  onPlayTriggered?: () => void,
) {
  el.querySelectorAll<HTMLElement>('[data-dnd-music]').forEach((widget) => {
    widget.classList.add('dnd-music-inline-btn');
    if (!widget.getAttribute('role')) widget.setAttribute('role', 'button');
    if (!widget.getAttribute('tabindex')) widget.setAttribute('tabindex', '0');
    if (!widget.getAttribute('aria-label')) widget.setAttribute('aria-label', 'Play scene music');
  });
}

export function handleInlineSceneMusicInteraction(
  event: MouseEvent | KeyboardEvent,
  musicPlayer: MusicPlayer,
  onPlayTriggered?: () => void,
): boolean {
  if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return false;

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const control = target.closest<HTMLElement>('[data-dnd-music]');
  if (!control) return false;

  const config = parseSceneMusicInlineData(control.getAttribute('data-dnd-music') || '');
  if (!config) return false;

  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

  void (async () => {
    if (musicPlayer.isTransitioning()) return;
    try {
      if (musicPlayer.isScenePlaying(config)) {
        await musicPlayer.stopAll();
      } else {
        if (onPlayTriggered) onPlayTriggered();
        await musicPlayer.loadSceneMusic(config, config.autoPlay);
        new Notice('🎵 Scene music loaded' + (config.autoPlay ? ' & playing' : ''));
      }
    } finally {
      control.classList.add('playing');
      setTimeout(() => control.classList.remove('playing'), 400);
    }
  })();

  return true;
}

export function buildSceneMusicInlineMarkdown(config: SceneMusicConfig, label = 'Scene Music'): string {
  const data = escapeHtmlAttribute(encodeSceneMusicInlineData(normalizeSceneMusicConfig(config)));
  const safeLabel = escapeHtmlText(label || 'Scene Music');
  return `<button type="button" class="dnd-music-inline-btn" data-dnd-music="${data}" aria-label="Play scene music: ${safeLabel}">🎵 ${safeLabel}</button>`;
}

export function parseSceneMusicCodeblockMarkdown(markdown: string): SceneMusicConfig | null {
  const trimmed = markdown.trim();
  const match = trimmed.match(/^```dnd-music\s*\n([\s\S]*?)\n?```$/);
  const json = match?.[1] ?? trimmed;
  try {
    return normalizeSceneMusicConfig(JSON.parse(json) as Partial<SceneMusicConfig>);
  } catch {
    return null;
  }
}

export function parseSceneMusicInlineMarkdown(markdown: string): SceneMusicConfig | null {
  const htmlData = markdown.trim().match(/data-dnd-music=(?:"([^"]+)"|'([^']+)')/);
  const encodedData = htmlData?.[1] ?? htmlData?.[2];
  return encodedData ? parseSceneMusicInlineData(unescapeHtmlAttribute(encodedData)) : null;
}

function encodeSceneMusicInlineData(config: SceneMusicConfig): string {
  return encodeURIComponent(JSON.stringify(config));
}

function parseSceneMusicInlineData(data: string): SceneMusicConfig | null {
  try {
    return normalizeSceneMusicConfig(JSON.parse(decodeURIComponent(data)) as Partial<SceneMusicConfig>);
  } catch {
    return null;
  }
}

function normalizeSceneMusicConfig(config: Partial<SceneMusicConfig>): SceneMusicConfig {
  const clampVolume = (value: unknown): number | null | undefined => {
    if (value === null || value === undefined) return value as null | undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
  };

  return {
    primaryPlaylistId: typeof config.primaryPlaylistId === 'string' ? config.primaryPlaylistId : null,
    primaryTrackPath: typeof config.primaryTrackPath === 'string' ? config.primaryTrackPath : null,
    ambientPlaylistId: typeof config.ambientPlaylistId === 'string' ? config.ambientPlaylistId : null,
    ambientTrackPath: typeof config.ambientTrackPath === 'string' ? config.ambientTrackPath : null,
    primaryVolume: clampVolume(config.primaryVolume),
    ambientVolume: clampVolume(config.ambientVolume),
    primaryRepeatMode: config.primaryRepeatMode ?? null,
    ambientRepeatMode: config.ambientRepeatMode ?? null,
    primaryShuffle: config.primaryShuffle ?? null,
    ambientShuffle: config.ambientShuffle ?? null,
    autoPlay: config.autoPlay !== false,
  };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
