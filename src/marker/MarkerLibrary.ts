import { App } from 'obsidian';
import { MarkerDefinition, MarkerLibraryData } from './MarkerTypes';

export class MarkerLibrary {
	private app: App;
	private markers: Map<string, MarkerDefinition>;
	private filePath: string;
	private legacyFilePath: string;
	private writes: Promise<void> = Promise.resolve();
	private persistedJson: string | undefined;

	constructor(app: App, pluginId: string) {
		this.app = app;
		this.markers = new Map();
		this.filePath = `${app.vault.configDir || '.obsidian'}/plugins/${pluginId}/markers.json`;
		this.legacyFilePath = `.obsidian/plugins/${pluginId}/markers.json`;
	}

	/**
	 * Load markers from the markers.json file
	 */
	load(): Promise<void> {
		return this.enqueue(async () => {
			this.persistedJson = undefined;
			try {
				const adapter = this.app.vault.adapter;
				const currentExists = await adapter.exists(this.filePath);
				const legacyExists = !currentExists && this.filePath !== this.legacyFilePath && await adapter.exists(this.legacyFilePath);
				if (currentExists || legacyExists) {
					const content = await adapter.read(currentExists ? this.filePath : this.legacyFilePath);
					const data: MarkerLibraryData = JSON.parse(content);
					this.markers = new Map(data.markers.map(marker => [marker.id, marker]));
					if (currentExists) this.persistedJson = content;
					else await this.saveBestEffort();
				} else {
					await this.saveBestEffort();
				}
			} catch (error) {
				console.error('Failed to load marker library:', error);
				this.markers.clear();
			}
		});
	}

	/**
	 * Save markers to the markers.json file
	 */
	save(): Promise<void> {
		return this.enqueue(() => this.saveBestEffort());
	}

	private enqueue(task: () => Promise<void>): Promise<void> {
		const result = this.writes.then(task);
		this.writes = result.catch(() => {});
		return result;
	}

	private serialize(markers: Map<string, MarkerDefinition>): string {
		const data: MarkerLibraryData = {
			markers: Array.from(markers.values()),
			version: '1.0.0'
		};
		return JSON.stringify(data, null, 2);
	}

	private async saveBestEffort(): Promise<void> {
		try {
			const json = this.serialize(this.markers);
			await this.app.vault.adapter.write(this.filePath, json);
			this.persistedJson = json;
		} catch (error) {
			console.error('Failed to save marker library:', error);
		}
	}

	private async saveStrict(markers: Map<string, MarkerDefinition>): Promise<void> {
		const adapter = this.app.vault.adapter;
		const previous = this.persistedJson;
		const json = this.serialize(markers);
		const changed = () => new Error('Marker library changed on disk. Reload the plugin before editing it.');
		let attempted = false;
		try {
			if (previous !== undefined) {
				await adapter.process(this.filePath, current => {
					if (current !== previous) throw changed();
					attempted = true;
					return json;
				});
			} else {
				if (await adapter.exists(this.filePath)) throw changed();
				attempted = true;
				await adapter.write(this.filePath, json);
			}
		} catch (error) {
			// Some adapters can reject after writing. Confirm bytes before treating
			// that as either success or an unowned failed write.
			const persisted = attempted ? await adapter.read(this.filePath).catch(() => undefined) : undefined;
			if (persisted !== json) throw error;
		}
		this.persistedJson = json;
	}

	/** Stage a create-only write and roll back only the unchanged marker it created. */
	prepareMarkerCreate(definition: MarkerDefinition): { commit(): Promise<void>; rollback(): Promise<void> } {
		const marker = { ...definition };
		const snapshot = JSON.stringify(marker);
		let committed = false;
		return {
			commit: () => this.enqueue(async () => {
				if (this.hasMarker(marker.id)) throw new Error(`Marker ID already exists: ${marker.id}`);
				const next = new Map(this.markers).set(marker.id, marker);
				await this.saveStrict(next);
				this.markers.set(marker.id, marker);
				committed = true;
			}),
			rollback: () => this.enqueue(async () => {
				if (!committed) return;
				const current = this.getMarker(marker.id);
				const saved = (JSON.parse(this.persistedJson!) as MarkerLibraryData).markers.find(item => item.id === marker.id);
				if ((current && JSON.stringify(current) !== snapshot) || (saved && JSON.stringify(saved) !== snapshot)) {
					throw new Error(`Marker changed after creation: ${marker.id}`);
				}
				if (current || saved) {
					const next = new Map(this.markers);
					next.delete(marker.id);
					await this.saveStrict(next);
					this.markers.delete(marker.id);
				}
				committed = false;
			}),
		};
	}

	/**
	 * Get a marker by ID
	 */
	getMarker(id: string): MarkerDefinition | undefined {
		return this.markers.get(id);
	}

	/**
	 * Get all markers
	 */
	getAllMarkers(): MarkerDefinition[] {
		return Array.from(this.markers.values());
	}

	/**
	 * Add or update a marker
	 */
	setMarker(marker: MarkerDefinition): Promise<void> {
		return this.enqueue(async () => {
			const now = Date.now();
			if (this.markers.has(marker.id)) {
				marker.updatedAt = now;
			} else {
				marker.createdAt = marker.createdAt || now;
				marker.updatedAt = marker.updatedAt || now;
			}
			this.markers.set(marker.id, marker);
			await this.saveBestEffort();
		});
	}

	/**
	 * Delete a marker
	 */
	deleteMarker(id: string): Promise<void> {
		return this.enqueue(async () => {
			this.markers.delete(id);
			await this.saveBestEffort();
		});
	}

	/**
	 * Check if a marker exists
	 */
	hasMarker(id: string): boolean {
		return this.markers.has(id);
	}

	/**
	 * Find markers by name, optionally scoped to a campaign.
	 * Returns all matches sorted by most recently updated.
	 */
	findMarkersByName(name: string, opts?: { type?: string; campaign?: string }): MarkerDefinition[] {
		const results: MarkerDefinition[] = [];
		const lowerName = name.toLowerCase();
		for (const marker of this.markers.values()) {
			if (marker.name.toLowerCase() !== lowerName) continue;
			if (opts?.type && marker.type !== opts.type) continue;
			if (opts?.campaign && marker.campaign && marker.campaign !== opts.campaign) continue;
			results.push(marker);
		}
		// Prefer campaign-specific matches first, then most recently updated
		results.sort((a, b) => {
			if (opts?.campaign) {
				const aMatch = a.campaign === opts.campaign ? 1 : 0;
				const bMatch = b.campaign === opts.campaign ? 1 : 0;
				if (aMatch !== bMatch) return bMatch - aMatch;
			}
			return (b.updatedAt || 0) - (a.updatedAt || 0);
		});
		return results;
	}

	/**
	 * Generate a unique marker ID
	 */
	generateId(): string {
		return `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}
