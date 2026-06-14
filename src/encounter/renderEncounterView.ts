import { App, Notice, TFile } from "obsidian";
import { ConfirmModal } from "../utils/ConfirmModal";
import type DndCampaignHubPlugin from "../main";
import { updateYamlFrontmatter } from "../utils/YamlFrontmatter";

/** Format a relative "time ago" string from an ISO date. */
function formatTimeAgo(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function mapEncounterCreatures(fm: any) {
	return (fm.creatures || []).map((c: any) => {
		const name = String(c.name ?? "");
		const initiativeMatch = name.match(/\(Initiative\s+(\d+)\)/i);
		const inferredInitiative = initiativeMatch?.[1] ? parseInt(initiativeMatch[1], 10) : undefined;
		const isTrap = c.is_trap ?? c.isTrap ?? !!initiativeMatch;
		return {
			name: c.name,
			count: c.count ?? 1,
			initiative: c.initiative ?? inferredInitiative,
			initiativeCounts: Array.isArray(c.initiative_counts) ? c.initiative_counts : c.initiativeCounts,
			fixedInitiative: c.fixed_initiative ?? c.fixedInitiative ?? !!initiativeMatch,
			hp: c.hp,
			ac: c.ac,
			cr: c.cr,
			source: c.source,
			path: c.path && c.path !== "[SRD]" ? c.path : undefined,
			isTrap,
			trapPath: c.trap_path ?? c.trapPath,
			isFriendly: c.isFriendly ?? c.is_friendly ?? false,
			isHidden: c.isHidden ?? c.is_hidden ?? false,
		};
	});
}

async function appendCreaturesToActiveEncounter(plugin: DndCampaignHubPlugin, creatures: any[]) {
	const state = plugin.combatTracker.getState();
	if (!state?.encounterPath || creatures.length === 0) return false;

	const file = plugin.app.vault.getAbstractFileByPath(state.encounterPath);
	if (!(file instanceof TFile)) return false;

	try {
		const content = await plugin.app.vault.read(file);
		const nextContent = updateYamlFrontmatter(content, (frontmatter) => {
			const existing = Array.isArray(frontmatter.creatures) ? frontmatter.creatures : [];
			return {
				...frontmatter,
				creatures: [...existing, ...structuredClone(creatures)],
			};
		});
		if (nextContent !== content) {
			await plugin.app.vault.modify(file, nextContent);
		}
		return true;
	} catch (error) {
		console.error("[EncounterView] Failed to append encounter creatures:", error);
		new Notice("Added to tracker, but could not update the active encounter note.");
		return false;
	}
}

export interface InlineEncounterConfig {
	path: string;
	name?: string;
}

export async function startEncounterFromFile(plugin: DndCampaignHubPlugin, encounterFile: TFile): Promise<void> {
	const cache = plugin.app.metadataCache.getFileCache(encounterFile);
	const fm = cache?.frontmatter;
	if (!fm || fm.type !== 'encounter') {
		new Notice("Not a valid encounter note.");
		return;
	}

	const encounterName = fm.name || encounterFile.basename;
	const mappedCreatures = mapEncounterCreatures(fm);
	const partyMembers: Array<{ name: string; level: number; hp: number; maxHp: number; ac: number; notePath?: string; tokenId?: string; initBonus?: number; thp?: number }> = [];

	const includeParty = fm.include_party !== false;
	const fmParty: any[] | undefined = fm.party_members;
	if (Array.isArray(fmParty) && fmParty.length > 0) {
		for (const m of fmParty) {
			if (!m || !m.name) continue;
			const maxHp = typeof m.hp_max === "number" ? m.hp_max : (typeof m.hp === "number" ? m.hp : 10);
			partyMembers.push({
				name: m.name,
				level: typeof m.level === "number" ? m.level : 1,
				hp: typeof m.hp === "number" ? m.hp : maxHp,
				maxHp,
				ac: typeof m.ac === "number" ? m.ac : 10,
				notePath: m.note_path || undefined,
				tokenId: m.token_id || undefined,
				initBonus: typeof m.init_bonus === "number" ? m.init_bonus : 0,
				thp: typeof m.thp === "number" ? m.thp : 0,
			});
		}
	} else if (includeParty) {
		const resolvedParty = plugin.partyManager.resolvePartyForNote(encounterFile.path)
			|| plugin.partyManager.getDefaultParty();
		if (resolvedParty) {
			const resolved = await plugin.partyManager.resolveMembers(resolvedParty.id);
			for (const m of resolved) {
				if (!m.enabled || m.absent) continue;
				partyMembers.push({
					name: m.name,
					level: m.level,
					hp: m.hp,
					maxHp: m.maxHp,
					ac: m.ac,
					notePath: m.notePath,
					tokenId: m.tokenId,
					initBonus: m.initBonus,
					thp: m.thp,
				});
			}
		}
	}

	await plugin.combatTracker.startFromEncounter(
		encounterName,
		mappedCreatures,
		partyMembers,
		fm.use_color_names ?? true,
		encounterFile.path,
	);

	await plugin.openCombatTracker();
}

export function resolveEncounterFile(plugin: DndCampaignHubPlugin, rawPath: string, sourcePath: string): TFile | null {
	const trimmed = rawPath.trim();
	if (!trimmed) return null;

	let filePath = trimmed;
	const wikiMatch = trimmed.match(/^\[\[(.+?)\]\]$/);
	if (wikiMatch?.[1]) {
		filePath = wikiMatch[1];
	}

	if (!filePath.endsWith('.md')) {
		filePath += '.md';
	}

	const direct = plugin.app.vault.getAbstractFileByPath(filePath);
	if (direct instanceof TFile) return direct;

	const resolved = plugin.app.metadataCache.getFirstLinkpathDest(filePath.replace(/\.md$/, ''), sourcePath);
	return resolved instanceof TFile ? resolved : null;
}

export function renderInlineEncounterWidgets(el: HTMLElement) {
	el.querySelectorAll<HTMLElement>('[data-dnd-encounter]').forEach((widget) => {
		widget.classList.add('dnd-encounter-inline-btn');
		if (!widget.getAttribute('role')) widget.setAttribute('role', 'button');
		if (!widget.getAttribute('tabindex')) widget.setAttribute('tabindex', '0');
		if (!widget.getAttribute('aria-label')) widget.setAttribute('aria-label', 'Run encounter');
	});
}

export function handleInlineEncounterInteraction(
	event: MouseEvent | KeyboardEvent,
	plugin: DndCampaignHubPlugin,
): boolean {
	if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return false;

	const target = event.target;
	if (!(target instanceof Element)) return false;

	const control = target.closest<HTMLElement>('[data-dnd-encounter]');
	if (!control) return false;

	const config = parseEncounterInlineData(control.getAttribute('data-dnd-encounter') || '');
	if (!config?.path) return false;

	event.preventDefault();
	event.stopPropagation();
	if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

	void (async () => {
		const encounterFile = resolveEncounterFile(plugin, config.path, '');
		if (!encounterFile) {
			new Notice('Encounter note not found.');
			return;
		}
		control.classList.add('playing');
		try {
			await startEncounterFromFile(plugin, encounterFile);
		} finally {
			setTimeout(() => control.classList.remove('playing'), 400);
		}
	})();

	return true;
}

export function buildEncounterInlineMarkdown(config: InlineEncounterConfig): string {
	const name = config.name || config.path.split('/').pop()?.replace(/\.md$/, '') || 'Encounter';
	const data = escapeHtmlAttribute(encodeEncounterInlineData({ ...config, name }));
	return `<button type="button" class="dnd-encounter-inline-btn" data-dnd-encounter="${data}" aria-label="Run encounter: ${escapeHtmlAttribute(name)}">⚔️ ${escapeHtmlText(name)}</button>`;
}

export function parseEncounterCodeblockMarkdown(markdown: string): InlineEncounterConfig | null {
	const trimmed = markdown.trim();
	const match = trimmed.match(/^```dnd-encounter\s*\n([\s\S]*?)\n?```$/);
	const source = (match?.[1] ?? trimmed).trim();
	if (!source) return null;

	const wiki = source.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/);
	const path = wiki?.[1]?.trim() || source;
	const name = wiki?.[2]?.trim() || path.split('/').pop()?.replace(/\.md$/, '') || 'Encounter';
	return { path, name };
}

export function parseEncounterInlineMarkdown(markdown: string): InlineEncounterConfig | null {
	const htmlData = markdown.trim().match(/data-dnd-encounter=(?:"([^"]+)"|'([^']+)')/);
	const encodedData = htmlData?.[1] ?? htmlData?.[2];
	return encodedData ? parseEncounterInlineData(unescapeHtmlAttribute(encodedData)) : null;
}

function encodeEncounterInlineData(config: InlineEncounterConfig): string {
	return encodeURIComponent(JSON.stringify(config));
}

function parseEncounterInlineData(data: string): InlineEncounterConfig | null {
	try {
		const parsed = JSON.parse(decodeURIComponent(data)) as Partial<InlineEncounterConfig>;
		if (!parsed.path || typeof parsed.path !== 'string') return null;
		return {
			path: parsed.path,
			name: typeof parsed.name === 'string' ? parsed.name : undefined,
		};
	} catch {
		return null;
	}
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

/**
 * Renders the dnd-encounter code block.
 */

export async function renderEncounterView(plugin: DndCampaignHubPlugin, source: string, el: HTMLElement, ctx: any) {
	try {
		// Parse source - either a wikilink to encounter file, or empty to use current file
		const trimmedSource = source.trim();
		let encounterFile: TFile | null = null;

		if (trimmedSource) {
			encounterFile = resolveEncounterFile(plugin, trimmedSource, ctx.sourcePath);
		} else {
			// Use current file
			encounterFile = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile;
		}

		if (!encounterFile) {
			el.createEl('div', {
				text: '\u26a0\ufe0f Encounter file not found',
				cls: 'dnd-encounter-block-error'
			});
			return;
		}

		// Get frontmatter
		const cache = plugin.app.metadataCache.getFileCache(encounterFile);
		const fm = cache?.frontmatter;

		if (!fm || fm.type !== 'encounter') {
			el.createEl('div', {
				text: '\u26a0\ufe0f Not a valid encounter note',
				cls: 'dnd-encounter-block-error'
			});
			return;
		}

		// Create container
		const container = el.createDiv({ cls: 'dnd-encounter-block' });

		// Header with name and link
		const header = container.createDiv({ cls: 'dnd-encounter-block-header' });
		const nameLink = header.createEl('a', {
			text: `\u2694\ufe0f ${fm.name || encounterFile.basename}`,
			cls: 'dnd-encounter-block-name'
		});
		nameLink.addEventListener('click', (e) => {
			e.preventDefault();
			plugin.app.workspace.openLinkText(encounterFile!.path, ctx.sourcePath);
		});

		// Difficulty badge
		const diff = fm.difficulty;
		if (diff) {
			const badge = header.createEl('span', {
				text: `Combat ${diff.rating}`,
				cls: 'dnd-difficulty-badge'
			});
			badge.style.backgroundColor = diff.color || '#888888';
		}

		// Stats row
		if (diff) {
			const statsRow = container.createDiv({ cls: 'dnd-encounter-block-stats' });

			// Party info
			statsRow.createEl('span', {
				text: `\ud83d\udc65 ${diff.party_count} PCs (Lvl ~${Math.round(diff.party_avg_level || 0)})`,
				cls: 'dnd-encounter-stat'
			});

			// Enemy info
			statsRow.createEl('span', {
				text: `\ud83d\udc79 ${diff.enemy_count} enemies`,
				cls: 'dnd-encounter-stat'
			});

			// Rounds estimate
			statsRow.createEl('span', {
				text: `\u23f1\ufe0f ~${diff.rounds_to_defeat} rounds`,
				cls: 'dnd-encounter-stat'
			});

			if (diff.xp_rating) {
				statsRow.createEl('span', {
					text: `DMG XP Budget ${diff.xp_rating}`,
					cls: 'dnd-encounter-stat'
				});
			}
		}

		// Creature summary (collapsed by default)
		const creatures = fm.creatures || [];
		if (creatures.length > 0) {
			const creatureSection = container.createDiv({ cls: 'dnd-encounter-block-creatures' });
			const creatureList = creatures.map((c: any) =>
				`${c.count || 1}\u00d7 ${c.name}${c.cr ? ` (CR ${c.cr})` : ''}`
			).join(', ');
			creatureSection.createEl('span', {
				text: creatureList,
				cls: 'dnd-encounter-creature-list'
			});
		}

		// Action buttons
		const buttonRow = container.createDiv({ cls: 'dnd-encounter-block-actions' });
		const encounterName = fm.name || encounterFile!.basename;

		// Run Encounter → feeds into our Combat Tracker
		const loadBtn = buttonRow.createEl('button', {
			text: '\u2694\ufe0f Run Encounter',
			cls: 'dnd-encounter-btn mod-cta'
		});
		loadBtn.addEventListener('click', async () => {
			await startEncounterFromFile(plugin, encounterFile!);
		});

		if (creatures.length > 0) {
			const addToActiveBtn = buttonRow.createEl('button', {
				text: '\u2795 Add to Active Encounter',
				cls: 'dnd-encounter-btn mod-cta'
			});
			addToActiveBtn.addEventListener('click', async () => {
				const activeCombat = plugin.combatTracker.getState();
				if (!activeCombat) {
					new Notice("No active encounter is loaded in the Initiative Tracker.");
					return;
				}

				if (activeCombat.encounterPath === encounterFile.path) {
					new Notice("This encounter is already active in the Initiative Tracker.");
					return;
				}

				const mappedCreatures = mapEncounterCreatures(fm);
				const added = await plugin.combatTracker.addCreaturesFromEncounter(
					encounterName,
					mappedCreatures,
					fm.use_color_names ?? true,
				);

				if (added > 0) {
					await appendCreaturesToActiveEncounter(plugin, fm.creatures || []);
					await plugin.openCombatTracker();
				}
			});
		}

		// Save Combat button
		const saveBtn = buttonRow.createEl('button', {
			text: '\ud83d\udcbe Save Combat',
			cls: 'dnd-encounter-btn'
		});
		saveBtn.addEventListener('click', async () => {
			await plugin.combatTracker.saveCombat();
			renderSavedStateInfo();
		});

		// Resume Combat button (shown only when saved state exists)
		const resumeBtn = buttonRow.createEl('button', {
			text: '\ud83d\udd04 Resume Combat',
			cls: 'dnd-encounter-btn mod-cta'
		});
		resumeBtn.addEventListener('click', async () => {
			plugin.combatTracker.resumeCombat(encounterName);
			await plugin.openCombatTracker();
		});

		// Edit button (secondary / less prominent)
		const editBtn = buttonRow.createEl('button', {
			text: '\u270f\ufe0f Edit',
			cls: 'dnd-encounter-btn mod-muted'
		});
		editBtn.addEventListener('click', () => {
			plugin.editEncounter(encounterFile!.path);
		});

		// Saved state info bar + clear button
		const stateInfoEl = container.createDiv({ cls: 'dnd-combat-state-info' });

		const renderSavedStateInfo = () => {
			stateInfoEl.empty();
			const info = plugin.combatTracker.getSavedStateInfo(encounterName);
			if (info) {
				resumeBtn.style.display = '';
				stateInfoEl.style.display = '';
				stateInfoEl.createEl('span', {
					text: `\ud83d\udcbe Paused at Round ${info.round}, ${info.combatantCount} combatants (${formatTimeAgo(info.savedAt)})`,
				});
				const clearBtn = stateInfoEl.createEl('button', {
					text: '\u2716 Clear',
					cls: 'dnd-encounter-btn mod-muted',
				});
				clearBtn.addEventListener('click', () => {
					new ConfirmModal(
						plugin.app,
						'Clear Saved Combat State',
						`Are you sure you want to clear the saved combat state for "${encounterName}"?\nThis action cannot be undone.`,
						async (confirmed) => {
							if (confirmed) {
								await plugin.combatTracker.clearSavedState(encounterName);
								renderSavedStateInfo();
							}
						}
					).open();
				});
			} else {
				resumeBtn.style.display = 'none';
				stateInfoEl.style.display = 'none';
			}
		};
		renderSavedStateInfo();

	} catch (error) {
		console.error('Error rendering encounter block:', error);
		el.createEl('div', {
			text: `\u26a0\ufe0f Error: ${(error as Error).message}`,
			cls: 'dnd-encounter-block-error'
		});
	}
}
