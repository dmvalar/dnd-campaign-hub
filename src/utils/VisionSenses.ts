export interface VisionSenses {
	darkvision?: number;
	blindsight?: number;
	tremorsense?: number;
	truesight?: number;
}

const VISION_REGEX = /^(darkvision|blindsight|truesight|tremorsense)\b/i;

export function parseVisionSenses(senses: string | null | undefined): VisionSenses {
	const result: VisionSenses = {
		darkvision: 0,
		blindsight: 0,
		tremorsense: 0,
		truesight: 0,
	};
	if (!senses || !senses.trim()) {
		return result;
	}

	const parts = senses.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
	for (const part of parts) {
		const match = part.match(/^(darkvision|blindsight|truesight|tremorsense)\s+(\d+)\s*ft/i);
		if (match) {
			const rawKey = match[1]!;
			const rawValue = match[2]!;
			const key = rawKey.toLowerCase();
			const value = parseInt(rawValue, 10) || 0;
			if (value > 0) {
				if (key === 'darkvision') result.darkvision = value;
				if (key === 'blindsight') result.blindsight = value;
				if (key === 'tremorsense') result.tremorsense = value;
				if (key === 'truesight') result.truesight = value;
			}
		}
	}

	return result;
}

export function getVisionRange(vision: VisionSenses): number {
	return Math.max(
		vision.darkvision || 0,
		vision.blindsight || 0,
		vision.tremorsense || 0,
		vision.truesight || 0
	);
}

export function buildVisionSensesLine(rawSenses: string | null | undefined, vision: VisionSenses): string {
	const additionalParts: string[] = [];
	if (vision.darkvision && vision.darkvision > 0) {
		additionalParts.push(`darkvision ${vision.darkvision} ft.`);
	}
	if (vision.blindsight && vision.blindsight > 0) {
		additionalParts.push(`blindsight ${vision.blindsight} ft.`);
	}
	if (vision.tremorsense && vision.tremorsense > 0) {
		additionalParts.push(`tremorsense ${vision.tremorsense} ft.`);
	}
	if (vision.truesight && vision.truesight > 0) {
		additionalParts.push(`truesight ${vision.truesight} ft.`);
	}

	const preservedParts = (rawSenses || '')
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.filter((part) => !VISION_REGEX.test(part));

	return [...additionalParts, ...preservedParts].join(', ');
}

export function applyVisionFieldsToMarker(marker: any, vision: VisionSenses): void {
	if (vision.darkvision && vision.darkvision > 0) {
		marker.darkvision = vision.darkvision;
	} else {
		delete marker.darkvision;
	}

	if (vision.blindsight && vision.blindsight > 0) {
		marker.blindsight = vision.blindsight;
	} else {
		delete marker.blindsight;
	}

	if (vision.tremorsense && vision.tremorsense > 0) {
		marker.tremorsense = vision.tremorsense;
	} else {
		delete marker.tremorsense;
	}

	if (vision.truesight && vision.truesight > 0) {
		marker.truesight = vision.truesight;
	} else {
		delete marker.truesight;
	}
}
