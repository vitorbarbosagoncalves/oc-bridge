/** Shape of ~/.gemini/settings.json */
export interface GeminiConfig {
	mcpServers?: Record<string, GeminiMcpServer>;
	[key: string]: unknown;
}

// ── MCP server variants ───────────────────────────────────────────────────────

/** Stdio (local process) MCP server — transport selected by presence of `command`. */
export interface GeminiStdioMcpServer {
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	timeout?: number;
	trust?: boolean;
	includeTools?: string[];
	excludeTools?: string[];
}

/** SSE endpoint MCP server — transport selected by presence of `url`. */
export interface GeminiSseMcpServer {
	url: string;
	headers?: Record<string, string>;
	timeout?: number;
	trust?: boolean;
	includeTools?: string[];
	excludeTools?: string[];
}

/** HTTP streaming MCP server — transport selected by presence of `httpUrl`. */
export interface GeminiHttpMcpServer {
	httpUrl: string;
	headers?: Record<string, string>;
	timeout?: number;
	trust?: boolean;
	includeTools?: string[];
	excludeTools?: string[];
}

export type GeminiMcpServer =
	| GeminiStdioMcpServer
	| GeminiSseMcpServer
	| GeminiHttpMcpServer;
