import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { AGENTS_DIR } from "../constants/gemini.js";
import type { ProviderAdapter } from "../interfaces/ProviderAdapter.js";
import type { OpenCodeAgent, OpenCodeConfig } from "../types/opencode.js";
import { isFileRef, resolveFileRef } from "../utils/fileRefResolver.js";
import { fromHome } from "../utils/pathResolver.js";
import {
	parseFrontmatter,
	serializeFrontmatter,
	toKebabCase,
} from "./ClaudeAgentAdapter.js";

// ── Paths ─────────────────────────────────────────────────────────────────────

const OPENCODE_CONFIG_PATH = fromHome(".config/opencode/opencode.jsonc");
const OPENCODE_AGENTS_DIR = fromHome(".config/opencode/agents");
const AGENTS_TARGET_DIR = fromHome(AGENTS_DIR);
const MANIFEST_PATH = join(AGENTS_TARGET_DIR, ".relay-manifest.json");

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Map an OpenCode provider-prefixed model id to a Gemini model id.
 *
 * - `anthropic/claude-*`          → omit (not a Gemini model) + warn
 * - `openrouter/google/gemini-*`  → strip prefix, extract model id
 * - `google/gemini-*`             → strip `google/` prefix
 * - bare `gemini-*`               → pass through
 * - anything else                 → omit + warn
 */
export function mapGeminiModel(model: string | undefined): {
	value: string | undefined;
	warning: string | null;
} {
	if (!model) return { value: undefined, warning: null };

	if (model.startsWith("anthropic/")) {
		return {
			value: undefined,
			warning: `Model "${model}" is not a Gemini model — omitted`,
		};
	}

	if (model.startsWith("openrouter/google/")) {
		return { value: model.slice("openrouter/google/".length), warning: null };
	}

	if (model.startsWith("google/")) {
		return { value: model.slice("google/".length), warning: null };
	}

	if (model.startsWith("gemini-")) {
		return { value: model, warning: null };
	}

	return {
		value: undefined,
		warning: `Model "${model}" is not a Gemini model — omitted`,
	};
}

/**
 * Clamp a temperature value to the Gemini-supported range [0, 2].
 * Returns the clamped value and a warning when clamping was applied.
 */
export function clampTemperature(temperature: number): {
	value: number;
	warning: string | null;
} {
	if (temperature < 0) {
		return {
			value: 0,
			warning: `Temperature ${temperature} is below 0 — clamped to 0`,
		};
	}
	if (temperature > 2) {
		return {
			value: 2,
			warning: `Temperature ${temperature} is above 2 — clamped to 2`,
		};
	}
	return { value: temperature, warning: null };
}

type GeminiAgentSource = {
	description?: string;
	model?: string;
	tools?: Record<string, boolean>;
	temperature?: number;
};

/**
 * Build the Gemini agent frontmatter from a normalized source shape.
 *
 * Tools: always omitted from Gemini output. Warns once when the source
 * has a non-trivial tools restriction (i.e. not all-absent / all-true).
 */
export function buildGeminiAgentFrontmatter(
	name: string,
	source: GeminiAgentSource,
): { frontmatter: Record<string, unknown>; warnings: string[] } {
	const warnings: string[] = [];

	const { value: model, warning: modelWarning } = mapGeminiModel(source.model);
	if (modelWarning) warnings.push(modelWarning);

	const description = source.description ?? "";
	if (!source.description) {
		warnings.push(`Agent "${name}" has no description — using empty string`);
	}

	// Detect non-trivial tools restriction and warn, then omit.
	if (source.tools) {
		const entries = Object.entries(source.tools);
		const hasRestriction = entries.length > 0 && entries.some(([, v]) => !v);
		if (hasRestriction) {
			warnings.push(
				`Agent "${name}" has tool restrictions — tool filtering is not supported for Gemini agents, tools field omitted`,
			);
		}
	}

	let temperature: number | undefined;
	if (source.temperature !== undefined) {
		const { value, warning: tempWarning } = clampTemperature(
			source.temperature,
		);
		temperature = value;
		if (tempWarning) warnings.push(tempWarning);
	}

	return {
		frontmatter: {
			name,
			description,
			...(model !== undefined && { model }),
			...(temperature !== undefined && { temperature }),
		},
		warnings,
	};
}

/**
 * Render a Gemini agent markdown file from frontmatter + body.
 */
export function renderGeminiAgentMd(
	frontmatter: Record<string, unknown>,
	body: string,
): string {
	return `---\n${serializeFrontmatter(frontmatter)}\n---\n\n${body.trim()}\n`;
}

// ── Per-agent async transforms ────────────────────────────────────────────────

async function processJsonAgent(
	rawName: string,
	agent: OpenCodeAgent,
): Promise<{
	name: string;
	content: string;
	warnings: string[];
}> {
	const name = toKebabCase(rawName);
	const warnings: string[] = [];

	let body = "";
	if (agent.prompt) {
		if (isFileRef(agent.prompt)) {
			const { data, error } = await resolveFileRef(
				agent.prompt,
				OPENCODE_CONFIG_PATH,
			);
			if (error) {
				warnings.push(
					`Agent "${name}" prompt file could not be read: ${error}`,
				);
			} else {
				body = data ?? "";
			}
		} else {
			body = agent.prompt;
		}
	}

	const { frontmatter, warnings: fmWarnings } = buildGeminiAgentFrontmatter(
		name,
		{
			description: agent.description,
			model: agent.model,
			tools: agent.tools,
			temperature: agent.temperature,
		},
	);

	return {
		name,
		content: renderGeminiAgentMd(frontmatter, body),
		warnings: [...fmWarnings, ...warnings],
	};
}

async function processMdAgent(
	rawName: string,
	sourceContent: string,
): Promise<{
	name: string;
	content: string;
	warnings: string[];
}> {
	const { frontmatter: sourceFm, body } = parseFrontmatter(sourceContent);
	const name = toKebabCase((sourceFm.name as string | undefined) ?? rawName);

	const { frontmatter, warnings } = buildGeminiAgentFrontmatter(name, {
		description: sourceFm.description as string | undefined,
		model: sourceFm.model as string | undefined,
		tools: sourceFm.tools as Record<string, boolean> | undefined,
		temperature: sourceFm.temperature as number | undefined,
	});

	return { name, content: renderGeminiAgentMd(frontmatter, body), warnings };
}

// ── I/O helpers ───────────────────────────────────────────────────────────────

async function readManifest(): Promise<string[]> {
	try {
		const raw = await readFile(MANIFEST_PATH, "utf8");
		return JSON.parse(raw) as string[];
	} catch {
		return [];
	}
}

async function writeManifest(agents: string[]): Promise<void> {
	await mkdir(AGENTS_TARGET_DIR, { recursive: true });
	await writeFile(
		MANIFEST_PATH,
		`${JSON.stringify(agents, null, 2)}\n`,
		"utf8",
	);
}

async function readOpenCodeMdAgents(): Promise<
	{ name: string; content: string }[]
> {
	try {
		const files = await readdir(OPENCODE_AGENTS_DIR);
		return Promise.all(
			files
				.filter((f) => f.endsWith(".md"))
				.map(async (file) => ({
					name: basename(file, ".md"),
					content: await readFile(join(OPENCODE_AGENTS_DIR, file), "utf8"),
				})),
		);
	} catch {
		return [];
	}
}

async function writeAgentFile(name: string, content: string): Promise<void> {
	await mkdir(AGENTS_TARGET_DIR, { recursive: true });
	await writeFile(join(AGENTS_TARGET_DIR, `${name}.md`), content, {
		encoding: "utf8",
		mode: 0o644,
	});
}

async function deleteAgentFile(name: string): Promise<void> {
	await rm(join(AGENTS_TARGET_DIR, `${name}.md`), { force: true });
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class GeminiAgentAdapter implements ProviderAdapter<string> {
	/**
	 * Read the current content of `~/.gemini/agents/<targetName>.md`.
	 * Returns an empty string when the file does not exist.
	 */
	async readTarget(targetName?: string): Promise<string> {
		if (!targetName) return "";
		try {
			return await readFile(
				join(AGENTS_TARGET_DIR, `${targetName}.md`),
				"utf8",
			);
		} catch {
			return "";
		}
	}

	/**
	 * Not applicable for the agent adapter — agents are multi-file.
	 * Use `sync()` as the primary entry point.
	 */
	transform(_source: OpenCodeConfig, target: string): string {
		return target;
	}

	/**
	 * Not applicable for the agent adapter — use `sync()` instead.
	 */
	async writeTarget(_content: string): Promise<void> {}

	/**
	 * Full sync pipeline:
	 * 1. Process JSON agents from `opencode.jsonc` (`agent` key).
	 * 2. Process MD agents from `~/.config/opencode/agents/`.
	 * 3. Delete previously synced agent files that are no longer in any source.
	 * 4. Update the relay manifest.
	 */
	async sync(source: OpenCodeConfig): Promise<void> {
		const manifest = await readManifest();
		const newAgents: string[] = [];
		const processedNames = new Set<string>();

		// ── JSON agents ───────────────────────────────────────────────────────────
		for (const [rawName, agent] of Object.entries(source.agent ?? {})) {
			const result = await processJsonAgent(rawName, agent);

			for (const w of result.warnings)
				console.warn(`[relay:gemini:agent] ${w}`);

			await writeAgentFile(result.name, result.content);
			newAgents.push(result.name);
			processedNames.add(result.name);
		}

		// ── MD agents ─────────────────────────────────────────────────────────────
		const mdAgents = await readOpenCodeMdAgents();

		for (const { name: rawName, content: sourceContent } of mdAgents) {
			const { frontmatter: sourceFm } = parseFrontmatter(sourceContent);
			const outputName = toKebabCase(
				(sourceFm.name as string | undefined) ?? rawName,
			);

			if (processedNames.has(outputName)) {
				console.warn(
					`[relay:gemini:agent] Agent "${outputName}" defined in both opencode.jsonc and MD file — JSON entry takes precedence`,
				);
				continue;
			}

			const result = await processMdAgent(rawName, sourceContent);

			for (const w of result.warnings)
				console.warn(`[relay:gemini:agent] ${w}`);

			await writeAgentFile(result.name, result.content);
			newAgents.push(result.name);
			processedNames.add(result.name);
		}

		// ── Deletion ──────────────────────────────────────────────────────────────
		const removed = manifest.filter((n) => !newAgents.includes(n));
		await Promise.all(removed.map(deleteAgentFile));

		await writeManifest(newAgents);
	}
}
