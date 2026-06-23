/**
 * Sound Effect widgets – `dnd-sfx`
 *
 * Provides:
 *  1.  SoundEffectModal      – opened via the "Insert Sound Effect" command to
 *                              let the user pick an audio file for inline playback.
 *  2.  renderSoundEffectBlock – registered as a Markdown code-block processor;
 *                              renders a compact card with a ▶ Play button that
 *                              plays the SFX overlaid on any current music.
 *  3.  renderInlineSoundEffectWidgets – registered as a Markdown post processor;
 *                              normalizes inline SFX controls for note text.
 */
import { App, Modal, Notice, Setting, MarkdownPostProcessorContext, TFile, TFolder } from 'obsidian';
import { MusicPlayer } from './MusicPlayer';
import type { SoundEffectPlayback } from './MusicPlayer';
import type { MusicSettings, SoundEffect } from './types';
import { AUDIO_EXTENSIONS, isAudioExtension } from './types';

// ─────────────────────────────────────────────────────────────────
//  SoundEffectConfig – stored as JSON inside the dnd-sfx codeblock
// ─────────────────────────────────────────────────────────────────

export interface SoundEffectConfig {
  /** Display name for the sound effect */
  name: string;
  /** Emoji icon for the button */
  icon: string;
  /** Vault path to the audio file */
  filePath: string;
  /** Volume override 0-100 (null = use master volume) */
  volume: number | null;
}

export const DEFAULT_SFX_CONFIG: SoundEffectConfig = {
  name: '',
  icon: '🔊',
  filePath: '',
  volume: null,
};

const INLINE_SFX_PROTOCOL = 'dnd-sfx:';
const INLINE_SFX_PROTOCOL_SLASHES = 'dnd-sfx://';
const inlineSfxPlaybacks = new WeakMap<HTMLElement, SoundEffectPlayback>();

// ─────────────────────────────────────────────────────────────────
//  SoundEffectModal – form to configure the SFX before inserting
// ─────────────────────────────────────────────────────────────────

export class SoundEffectModal extends Modal {
  private settings: MusicSettings;
  private config: SoundEffectConfig;
  private onSubmit: (config: SoundEffectConfig) => void;

  constructor(
    app: App,
    settings: MusicSettings,
    existing: SoundEffectConfig | null,
    onSubmit: (config: SoundEffectConfig) => void,
  ) {
    super(app);
    this.settings = settings;
    this.config = existing ? { ...existing } : { ...DEFAULT_SFX_CONFIG };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.modalEl.addClass('dnd-sfx-modal');
    this.titleEl.setText('🔊 Insert Sound Effect');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    // ── Source selection ───────────────────────────────────
    contentEl.createEl('h4', { text: '🎵 Audio Source' });

    // Option 1: Pick from configured soundboard effects
    if (this.settings.soundEffects.length > 0) {
      contentEl.createEl('p', {
        text: 'Pick from your configured soundboard:',
        cls: 'setting-item-description',
      });

      const grid = contentEl.createEl('div', { cls: 'dnd-sfx-picker-grid' });
      for (const sfx of this.settings.soundEffects) {
        if (!sfx.filePath) continue;
        const btn = grid.createEl('button', {
          cls: `dnd-sfx-picker-btn ${this.config.filePath === sfx.filePath ? 'selected' : ''}`,
        });
        btn.createEl('span', { text: sfx.icon, cls: 'dnd-sfx-picker-icon' });
        btn.createEl('span', { text: sfx.name, cls: 'dnd-sfx-picker-name' });

        btn.addEventListener('click', () => {
          this.config.name = sfx.name;
          this.config.icon = sfx.icon;
          this.config.filePath = sfx.filePath;
          this.config.volume = sfx.volume ?? null;
          this.render();
        });
      }

      contentEl.createEl('hr', { cls: 'dnd-sfx-divider' });
    }

    // Option 2: Pick any audio file from vault
    contentEl.createEl('p', {
      text: 'Or select any audio file from the vault:',
      cls: 'setting-item-description',
    });

    const fileRow = contentEl.createEl('div', { cls: 'dnd-sfx-file-row' });
    if (this.config.filePath) {
      const fileName = this.config.filePath.split('/').pop() || this.config.filePath;
      fileRow.createEl('span', { text: `📁 ${fileName}`, cls: 'dnd-sfx-file-name' });
    } else {
      fileRow.createEl('span', { text: 'No file selected', cls: 'dnd-sfx-file-name dnd-sfx-none' });
    }

    const browseBtn = fileRow.createEl('button', { text: 'Browse…', cls: 'mod-cta' });
    browseBtn.style.marginLeft = '8px';
    browseBtn.addEventListener('click', () => {
      this.openFilePicker();
    });

    // ── Name & Icon ───────────────────────────────────────
    contentEl.createEl('h4', { text: '⚙️ Display Settings' });

    new Setting(contentEl)
      .setName('Name')
      .setDesc('Display name for the sound effect')
      .addText(t => {
        t.setValue(this.config.name);
        t.setPlaceholder('e.g. Thunder Crash');
        t.onChange(val => { this.config.name = val; });
      });

    new Setting(contentEl)
      .setName('Icon')
      .setDesc('Emoji icon displayed on the button')
      .addText(t => {
        t.setValue(this.config.icon);
        t.setPlaceholder('🔊');
        t.onChange(val => { this.config.icon = val || '🔊'; });
        t.inputEl.style.width = '60px';
      });

    new Setting(contentEl)
      .setName('Volume')
      .setDesc('Volume override (leave empty to use master volume)')
      .addSlider(s => {
        s.setLimits(0, 100, 1);
        s.setValue(this.config.volume ?? 70);
        s.setDynamicTooltip();
        s.onChange(val => { this.config.volume = val; });
      });

    // ── Actions ───────────────────────────────────────────
    const actions = contentEl.createEl('div', { cls: 'dnd-sfx-actions' });

    const insertBtn = actions.createEl('button', { text: 'Insert', cls: 'mod-cta' });
    insertBtn.addEventListener('click', () => {
      if (!this.config.filePath) {
        new Notice('Please select an audio file');
        return;
      }
      if (!this.config.name) {
        // Auto-name from filename
        this.config.name = (this.config.filePath.split('/').pop() || 'Sound Effect')
          .replace(/\.[^.]+$/, '');
      }
      this.onSubmit(this.config);
      this.close();
    });

    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }

  private openFilePicker() {
    // Inline audio file picker (similar to MusicSettingsModal's AudioFilePickerModal)
    const pickerModal = new Modal(this.app);
    pickerModal.modalEl.addClass('audio-file-picker-modal');
    pickerModal.titleEl.setText('🎵 Select Audio File');

    let filterText = '';
    const { contentEl } = pickerModal;

    const filterInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Filter files…',
      cls: 'audio-picker-filter',
    });

    const listContainer = contentEl.createEl('div', { cls: 'audio-picker-list' });

    const getAudioFiles = (): TFile[] => {
      const audioFolderPath = this.settings.audioFolderPath;
      let root: TFolder;
      if (audioFolderPath) {
        const folder = this.app.vault.getAbstractFileByPath(audioFolderPath);
        if (folder instanceof TFolder) {
          root = folder;
        } else {
          root = this.app.vault.getRoot();
        }
      } else {
        root = this.app.vault.getRoot();
      }
      const results: TFile[] = [];
      const walk = (folder: TFolder) => {
        for (const child of folder.children) {
          if (child instanceof TFile && isAudioExtension(child.extension)) {
            results.push(child);
          } else if (child instanceof TFolder) {
            walk(child);
          }
        }
      };
      walk(root);
      results.sort((a, b) => a.path.localeCompare(b.path));
      return results;
    };

    const renderList = () => {
      listContainer.empty();
      const audioFiles = getAudioFiles();
      const filtered = filterText
        ? audioFiles.filter(f => f.path.toLowerCase().includes(filterText.toLowerCase()))
        : audioFiles;

      if (filtered.length === 0) {
        listContainer.createEl('p', { text: 'No audio files found.', cls: 'empty-message' });
        return;
      }

      for (const file of filtered) {
        const row = listContainer.createEl('div', { cls: 'audio-picker-row' });
        row.createEl('span', { text: file.name, cls: 'audio-picker-name' });
        row.createEl('span', { text: file.path, cls: 'audio-picker-path' });
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          this.config.filePath = file.path;
          // Auto-fill name from filename if empty
          if (!this.config.name) {
            this.config.name = file.name.replace(/\.[^.]+$/, '');
          }
          pickerModal.close();
          this.render();
        });
      }
    };

    filterInput.addEventListener('input', () => {
      filterText = filterInput.value;
      renderList();
    });

    renderList();
    filterInput.focus();
    pickerModal.open();
  }
}

// ─────────────────────────────────────────────────────────────────
//  Code-block renderer  –  ```dnd-sfx
// ─────────────────────────────────────────────────────────────────

/**
 * Render function registered via `registerMarkdownCodeBlockProcessor('dnd-sfx', …)`.
 *
 * The code-block body is a JSON-encoded SoundEffectConfig.
 * Plays the SFX **overlaid** on any currently playing music — it does NOT stop music.
 */
export function renderSoundEffectBlock(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  musicPlayer: MusicPlayer,
  settings: MusicSettings,
  onPlayTriggered?: () => void,
  app?: App
) {
  // ── Parse config ────────────────────────────────────────
  let config: SoundEffectConfig;
  try {
    config = JSON.parse(source.trim());
  } catch {
    el.createEl('div', {
      text: '⚠️ Invalid sound effect configuration',
      cls: 'dnd-sfx-block-error',
    });
    return;
  }

  if (!config.filePath) {
    el.createEl('div', {
      text: '⚠️ No audio file specified',
      cls: 'dnd-sfx-block-error',
    });
    return;
  }

  const container = el.createEl('div', { cls: 'dnd-sfx-block' });

  // ── Play button (large, prominent) ──────────────────────
  const playBtn = container.createEl('button', { cls: 'dnd-sfx-play-btn' });
  const playIcon = playBtn.createEl('span', { text: config.icon || '🔊', cls: 'dnd-sfx-play-icon' });
  let playback: SoundEffectPlayback | null = null;

  const setPlaying = (isPlaying: boolean) => {
    playBtn.classList.toggle('is-playing', isPlaying);
    playIcon.setText(isPlaying ? '⏹' : (config.icon || '🔊'));
    playBtn.setAttribute(
      'aria-label',
      `${isPlaying ? 'Stop' : 'Play'} sound effect: ${config.name || 'Sound Effect'}`
    );
    playBtn.setAttribute('title', isPlaying ? 'Stop sound effect' : 'Play sound effect');
  };
  setPlaying(false);

  // ── Info section ────────────────────────────────────────
  const info = container.createEl('div', { cls: 'dnd-sfx-info' });
  info.createEl('span', { text: config.name || 'Sound Effect', cls: 'dnd-sfx-name' });

  const fileName = config.filePath.split('/').pop() || config.filePath;
  info.createEl('span', { text: fileName, cls: 'dnd-sfx-file' });

  // ── Edit button ────────────────────────────────────────
  if (app) {
    const editBtn = container.createEl('button', {
      text: '✏️',
      cls: 'dnd-sfx-edit-btn',
      attr: { 'aria-label': 'Edit sound effect' },
    });
    editBtn.addEventListener('click', () => {
      new SoundEffectModal(app, settings, config, async (updated) => {
        const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;
        const content = await app.vault.read(file);
        const oldBlock = '```dnd-sfx\n' + source.trim() + '\n```';
        const newBlock = buildSoundEffectCodeblock(updated);
        if (content.includes(oldBlock)) {
          await app.vault.modify(file, content.replace(oldBlock, newBlock));
          new Notice('Sound effect block updated');
        } else {
          new Notice('Could not locate code block to update');
        }
      }).open();
    });
  }

  // ── Click handler — plays SFX without stopping music ───
  playBtn.addEventListener('click', () => {
    if (playback?.isPlaying()) {
      playback.stop();
      return;
    }

    // Ensure the music player leaf is open
    if (onPlayTriggered) onPlayTriggered();
    playback = playSoundEffectConfig(config, musicPlayer);
    if (!playback) return;
    setPlaying(true);
    playback.onStop(() => {
      playback = null;
      setPlaying(false);
    });

    // Visual feedback
    playBtn.classList.add('playing');
    setTimeout(() => playBtn.classList.remove('playing'), 400);
  });
}

// ─────────────────────────────────────────────────────────────────
//  Inline renderer  –  <button data-dnd-sfx="...">Thunder</button>
// ─────────────────────────────────────────────────────────────────

export function renderInlineSoundEffectWidgets(
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext,
  musicPlayer: MusicPlayer,
  _settings: MusicSettings,
  onPlayTriggered?: () => void,
) {
  const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href^="dnd-sfx:"]'));

  el.querySelectorAll<HTMLElement>('[data-dnd-sfx]').forEach((widget) => {
    widget.classList.add('dnd-sfx-inline-btn');
    if (!widget.getAttribute('role')) widget.setAttribute('role', 'button');
    if (!widget.getAttribute('tabindex')) widget.setAttribute('tabindex', '0');
  });

  for (const link of links) {
    const config = parseSoundEffectInlineHref(link.getAttribute('href') || '');
    if (!config) continue;

    const widget = createSpan({ cls: 'dnd-sfx-inline' });
    widget.appendChild(createInlineSoundEffectButton(config, link.textContent || undefined));
    link.replaceWith(widget);
  }
}

export function handleInlineSoundEffectInteraction(
  event: MouseEvent | KeyboardEvent,
  musicPlayer: MusicPlayer,
  onPlayTriggered?: () => void,
): boolean {
  if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return false;

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const control = target.closest<HTMLElement>('[data-dnd-sfx], a[href^="dnd-sfx:"]');
  if (!control) return false;

  const config = control.hasAttribute('data-dnd-sfx')
    ? parseSoundEffectInlineData(control.getAttribute('data-dnd-sfx') || '')
    : parseSoundEffectInlineHref(control.getAttribute('href') || '');
  if (!config) return false;

  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  const activePlayback = inlineSfxPlaybacks.get(control);
  if (activePlayback?.isPlaying()) {
    activePlayback.stop();
    return true;
  }

  if (onPlayTriggered) onPlayTriggered();
  const playback = playSoundEffectConfig(config, musicPlayer);
  if (!playback) return true;

  inlineSfxPlaybacks.set(control, playback);
  setInlineSoundEffectPlaying(control, config, true);
  playback.onStop(() => {
    if (inlineSfxPlaybacks.get(control) === playback) {
      inlineSfxPlaybacks.delete(control);
      setInlineSoundEffectPlaying(control, config, false);
    }
  });
  control.classList.add('playing');
  setTimeout(() => control.classList.remove('playing'), 400);
  return true;
}

function createInlineSoundEffectButton(config: SoundEffectConfig, fallbackLabel?: string): HTMLButtonElement {
  const button = createEl('button', {
    cls: 'dnd-sfx-inline-btn',
    attr: {
      type: 'button',
      'data-dnd-sfx': encodeSoundEffectInlineData(config),
      'aria-label': `Play sound effect: ${config.name || 'Sound Effect'}`,
      title: config.filePath,
    },
  });
  button.createEl('span', { text: config.icon || '🔊', cls: 'dnd-sfx-inline-icon' });
  button.createEl('span', { text: config.name || fallbackLabel || 'Sound Effect', cls: 'dnd-sfx-inline-name' });
  return button;
}

function setInlineSoundEffectPlaying(control: HTMLElement, config: SoundEffectConfig, isPlaying: boolean) {
  control.classList.toggle('is-playing', isPlaying);
  control.setAttribute(
    'aria-label',
    `${isPlaying ? 'Stop' : 'Play'} sound effect: ${config.name || 'Sound Effect'}`
  );
  control.setAttribute('title', isPlaying ? 'Playing. Press again to stop.' : config.filePath);
}

function playSoundEffectConfig(config: SoundEffectConfig, musicPlayer: MusicPlayer): SoundEffectPlayback | null {
  const sfx: SoundEffect = {
    id: 'inline-sfx',
    name: config.name || 'Sound Effect',
    filePath: config.filePath,
    icon: config.icon || '🔊',
    volume: config.volume ?? undefined,
  };
  return musicPlayer.playSoundEffect(sfx);
}

// ─────────────────────────────────────────────────────────────────
//  Helpers – build note syntax for insertion into the editor
// ─────────────────────────────────────────────────────────────────

export function buildSoundEffectCodeblock(config: SoundEffectConfig): string {
  return '```dnd-sfx\n' + JSON.stringify(config, null, 2) + '\n```';
}

export function parseSoundEffectCodeblockMarkdown(markdown: string): SoundEffectConfig | null {
  const trimmed = markdown.trim();
  const match = trimmed.match(/^```dnd-sfx\s*\n([\s\S]*?)\n?```$/);
  const json = match?.[1] ?? trimmed;

  try {
    const parsed = JSON.parse(json) as Partial<SoundEffectConfig>;
    if (!parsed.filePath) return null;
    const filePath = parsed.filePath;
    return {
      name: parsed.name || fileNameWithoutExtension(filePath) || 'Sound Effect',
      icon: parsed.icon || '🔊',
      filePath,
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : null,
    };
  } catch {
    return null;
  }
}

export function parseSoundEffectInlineMarkdown(markdown: string): SoundEffectConfig | null {
  const trimmed = markdown.trim();
  const markdownLink = trimmed.match(/^\[[^\]]+\]\((dnd-sfx:[^)]+)\)$/);
  if (markdownLink?.[1]) return parseSoundEffectInlineHref(markdownLink[1]);

  const htmlData = trimmed.match(/data-dnd-sfx=(?:"([^"]+)"|'([^']+)')/);
  const encodedData = htmlData?.[1] ?? htmlData?.[2];
  if (encodedData) return parseSoundEffectInlineData(unescapeHtmlAttribute(encodedData));

  return null;
}

export function buildSoundEffectInlineMarkdown(config: SoundEffectConfig): string {
  const name = config.name || fileNameWithoutExtension(config.filePath) || 'Sound Effect';
  const icon = config.icon || '🔊';
  const data = escapeHtmlAttribute(encodeSoundEffectInlineData({ ...config, name, icon }));

  return `<button type="button" class="dnd-sfx-inline-btn" data-dnd-sfx="${data}" aria-label="Play sound effect: ${escapeHtmlAttribute(name)}">${escapeHtmlText(icon)} ${escapeHtmlText(name)}</button>`;
}

function encodeSoundEffectInlineData(config: SoundEffectConfig): string {
  return encodeURIComponent(JSON.stringify(config));
}

function parseSoundEffectInlineData(data: string): SoundEffectConfig | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(data)) as Partial<SoundEffectConfig>;
    if (!parsed.filePath) return null;
    return {
      name: parsed.name || fileNameWithoutExtension(parsed.filePath) || 'Sound Effect',
      icon: parsed.icon || '🔊',
      filePath: parsed.filePath,
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : null,
    };
  } catch {
    return null;
  }
}

function parseSoundEffectInlineHref(href: string): SoundEffectConfig | null {
  if (!href.startsWith(INLINE_SFX_PROTOCOL)) return null;

  const rest = href.startsWith(INLINE_SFX_PROTOCOL_SLASHES)
    ? href.slice(INLINE_SFX_PROTOCOL_SLASHES.length)
    : href.slice(INLINE_SFX_PROTOCOL.length);
  const queryIndex = rest.indexOf('?');
  const encodedPath = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : rest.slice(queryIndex + 1);

  let filePath: string;
  try {
    filePath = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }

  if (!filePath) return null;

  const params = new URLSearchParams(query);
  const volumeParam = params.get('volume');
  const parsedVolume = volumeParam === null || volumeParam.trim() === ''
    ? null
    : Number(volumeParam);
  const volume = parsedVolume !== null && Number.isFinite(parsedVolume)
    ? Math.max(0, Math.min(100, parsedVolume))
    : null;

  return {
    name: params.get('name') || fileNameWithoutExtension(filePath) || 'Sound Effect',
    icon: params.get('icon') || '🔊',
    filePath,
    volume,
  };
}

function fileNameWithoutExtension(filePath: string): string {
  return (filePath.split('/').pop() || '').replace(/\.[^.]+$/, '');
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(text: string): string {
  return escapeHtmlText(text)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeHtmlAttribute(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}
