import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CONFIG } from "../constants/gemini.js";
import type { ProviderAdapter } from "../interfaces/ProviderAdapter.js";
import type {
	GeminiConfig,
	GeminiHttpMcpServer,
	GeminiMcpServer,
	GeminiSseMcpServer,
	GeminiStdioMcpServer,
} from "../types/gemini.js";
import type {
	OpenCodeConfig,
	OpenCodeLocalMcpServer,
	OpenCodeMcpServer,
	OpenCodeRemoteMcpServer,
} from "../types/opencode.js";
import { resolveEnvRefs } from "../utils/envResolver.js";
import { fromHome } from "../utils/pathResolver.js";

const TARGET_PATH = fromHome(CONFIG);

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve all `{env:VAR}` references in every value of a string record.
 * Returns the resolved record and the names of any missing variables.
 */
export function resolveEnvRecord(record: Record<string, string>): {
	resolved: Record<string, string>;
	missing: string[];
} {
	const entries = Object.entries(record).map(([key, value]) => {
		const { resolved, missing } = resolveEnvRefs(value);
		return { key, resolved, missing };
	});

	return {
		resolved: Object.fromEntries(
			entries.map(({ key, resolved }) => [key, resolved]),
		),
		missing: entries.flatMap(({ missing }) => missing),
	};
}

/**
 * Transform a local (stdio) OpenCode MCP server to Gemini CLI schema.
 * Returns null when the server is disabled or the command array is empty.
 */
export function transformLocalServer(
	server: OpenCodeLocalMcpServer,
): { server: GeminiStdioMcpServer; warnings: string[] } | null {
	if (server.enabled === false) return null;

	const [command, ...args] = server.command;
	if (!command) return null;

	const { resolved: env, missing } = server.environment
		? resolveEnvRecord(server.environment)
		: { resolved: {} as Record<string, string>, missing: [] as string[] };

	return {
		server: {
			command,
			...(args.length > 0 && { args }),
			...(Object.keys(env).length > 0 && { env }),
		},
		warnings: missing.map((v) => `Undefined env variable: ${v}`),
	};
}

/**
 * Transform a remote OpenCode MCP server to Gemini CLI schema.
 *
 * Gemini CLI uses `url` for SSE endpoints and `httpUrl` for HTTP streaming.
 * Because OpenCode has no distinction between the two, we default to `url`
 * (SSE). OAuth fields are dropped — Gemini manages auth separately.
 * Returns null when the server is disabled.
 */
export function transformRemoteServer(server: OpenCodeRemoteMcpServer): {
	server: GeminiSseMcpServer | GeminiHttpMcpServer;
	warnings: string[];
} | null {
	if (server.enabled === false) return null;

	const { resolved: headers, missing } = server.headers
		? resolveEnvRecord(server.headers)
		: { resolved: {} as Record<string, string>, missing: [] as string[] };

	return {
		server: {
			url: server.url,
			...(Object.keys(headers).length > 0 && { headers }),
		} as GeminiSseMcpServer,
		warnings: missing.map((v) => `Undefined env variable: ${v}`),
	};
}

/**
 * Transform all MCP servers from OpenCode schema to Gemini CLI schema.
 * Returns the translated server map and any warnings collected along the way.
 */
export function transformMcpServers(mcp: Record<string, OpenCodeMcpServer>): {
	servers: Record<string, GeminiMcpServer>;
	warnings: string[];
} {
	return Object.entries(mcp).reduce<{
		servers: Record<string, GeminiMcpServer>;
		warnings: string[];
	}>(
		(acc, [name, server]) => {
			if (server.type === "local") {
				const result = transformLocalServer(server);
				if (!result) return acc;
				return {
					servers: { ...acc.servers, [name]: result.server },
					warnings: [...acc.warnings, ...result.warnings],
				};
			}

			// remote
			const result = transformRemoteServer(server);
			if (!result) return acc;
			return {
				servers: { ...acc.servers, [name]: result.server },
				warnings: [...acc.warnings, ...result.warnings],
			};
		},
		{ servers: {}, warnings: [] },
	);
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class GeminiMcpAdapter implements ProviderAdapter<GeminiConfig> {
	/**
	 * Read the current `~/.gemini/settings.json`, returning an empty config on
	 * missing or unparseable file.
	 */
	async readTarget(): Promise<GeminiConfig> {
		try {
			const content = await readFile(TARGET_PATH, "utf8");
			return (JSON.parse(content) as GeminiConfig) ?? {};
		} catch {
			return {};
		}
	}

	/**
	 * Pure: translate the MCP slice of the OpenCode config and merge it into
	 * the existing Gemini config without touching any other keys.
	 */
	transform(source: OpenCodeConfig, target: GeminiConfig): GeminiConfig {
		if (!source.mcp) return target;
		const { servers } = transformMcpServers(source.mcp);
		return { ...target, mcpServers: servers };
	}

	/**
	 * Write `config` back to `~/.gemini/settings.json` with restricted permissions.
	 */
	async writeTarget(config: GeminiConfig): Promise<void> {
		await mkdir(dirname(TARGET_PATH), { recursive: true });
		await writeFile(TARGET_PATH, `${JSON.stringify(config, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
	}

	/**
	 * Full pipeline: read → transform (with warning emission) → write.
	 */
	async sync(source: OpenCodeConfig): Promise<void> {
		const target = await this.readTarget();
		if (!source.mcp) return;

		const { servers, warnings } = transformMcpServers(source.mcp);

		for (const warning of warnings) {
			console.warn(`[relay:gemini:mcp] ${warning}`);
		}

		await this.writeTarget({ ...target, mcpServers: servers });
	}
}
