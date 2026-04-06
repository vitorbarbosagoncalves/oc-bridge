import { afterEach, describe, expect, it, vi } from "vitest";

// Mock must be declared before any import that uses node:fs/promises.
vi.mock("node:fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	readdir: vi.fn().mockResolvedValue([]),
	readFile: vi
		.fn()
		.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
	rm: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import {
	buildGeminiAgentFrontmatter,
	clampTemperature,
	detectGeminiTemplateVars,
	escapeGeminiTemplateVars,
	GeminiAgentAdapter,
	mapGeminiModel,
	renderGeminiAgentMd,
} from "../../src/adapters/GeminiAgentAdapter.js";

// ── mapGeminiModel ────────────────────────────────────────────────────────────

describe(mapGeminiModel, () => {
	it("returns undefined with no warning when model is absent", () => {
		expect(mapGeminiModel(undefined)).toEqual({
			value: undefined,
			warning: null,
		});
	});

	it("omits anthropic models with a warning", () => {
		const result = mapGeminiModel("anthropic/claude-sonnet-4-6");
		expect(result.value).toBeUndefined();
		expect(result.warning).toMatch(/not a Gemini model/);
		expect(result.warning).toMatch(/anthropic\/claude-sonnet-4-6/);
	});

	it("strips openrouter/google/ prefix and returns the gemini model id", () => {
		expect(mapGeminiModel("openrouter/google/gemini-2.0-flash")).toEqual({
			value: "gemini-2.0-flash",
			warning: null,
		});
	});

	it("strips google/ prefix", () => {
		expect(mapGeminiModel("google/gemini-1.5-pro")).toEqual({
			value: "gemini-1.5-pro",
			warning: null,
		});
	});

	it("passes through bare gemini-* model names", () => {
		expect(mapGeminiModel("gemini-2.0-flash")).toEqual({
			value: "gemini-2.0-flash",
			warning: null,
		});
	});

	it("omits unknown model prefixes with a warning", () => {
		const result = mapGeminiModel("openrouter/meta/llama-3");
		expect(result.value).toBeUndefined();
		expect(result.warning).toMatch(/not a Gemini model/);
		expect(result.warning).toMatch(/openrouter\/meta\/llama-3/);
	});
});

// ── clampTemperature ──────────────────────────────────────────────────────────

describe(clampTemperature, () => {
	it("returns value unchanged and no warning when within range", () => {
		expect(clampTemperature(0.7)).toEqual({ value: 0.7, warning: null });
	});

	it("returns 0 for in-range lower bound", () => {
		expect(clampTemperature(0)).toEqual({ value: 0, warning: null });
	});

	it("returns 2 for in-range upper bound", () => {
		expect(clampTemperature(2)).toEqual({ value: 2, warning: null });
	});

	it("clamps below 0 to 0 with a warning", () => {
		const result = clampTemperature(-0.5);
		expect(result.value).toBe(0);
		expect(result.warning).toMatch(/clamped to 0/);
	});

	it("clamps above 2 to 2 with a warning", () => {
		const result = clampTemperature(3);
		expect(result.value).toBe(2);
		expect(result.warning).toMatch(/clamped to 2/);
	});
});

// ── buildGeminiAgentFrontmatter ───────────────────────────────────────────────

describe(buildGeminiAgentFrontmatter, () => {
	it("builds minimal frontmatter for a simple agent", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("my-agent", {
			description: "A helpful agent",
		});
		expect(frontmatter.name).toBe("my-agent");
		expect(frontmatter.description).toBe("A helpful agent");
		expect(warnings).toHaveLength(0);
	});

	it("warns and uses empty description when missing", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("bot", {});
		expect(frontmatter.description).toBe("");
		expect(warnings.some((w) => w.includes("no description"))).toBe(true);
	});

	it("includes model when it resolves to a Gemini model", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("bot", {
			description: "x",
			model: "google/gemini-1.5-pro",
		});
		expect(frontmatter.model).toBe("gemini-1.5-pro");
		expect(warnings).toHaveLength(0);
	});

	it("omits model and warns for anthropic models", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("bot", {
			description: "x",
			model: "anthropic/claude-sonnet-4-6",
		});
		expect(frontmatter.model).toBeUndefined();
		expect(warnings.some((w) => w.includes("not a Gemini model"))).toBe(true);
	});

	it("keeps temperature within range as-is", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("bot", {
			description: "x",
			temperature: 1.2,
		});
		expect(frontmatter.temperature).toBe(1.2);
		expect(warnings).toHaveLength(0);
	});

	it("clamps out-of-range temperature and warns", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("bot", {
			description: "x",
			temperature: 5,
		});
		expect(frontmatter.temperature).toBe(2);
		expect(warnings.some((w) => w.includes("clamped to 2"))).toBe(true);
	});

	it("omits tools field and warns when source has a non-trivial restriction", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("bot", {
			description: "x",
			tools: { read: true, write: false, bash: false },
		});
		expect(frontmatter.tools).toBeUndefined();
		expect(
			warnings.some((w) => w.includes("tool filtering is not supported")),
		).toBe(true);
	});

	it("omits tools field without warning when all tools are enabled", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("bot", {
			description: "x",
			tools: { read: true, write: true, bash: true },
		});
		expect(frontmatter.tools).toBeUndefined();
		expect(warnings.some((w) => w.includes("tool filtering"))).toBe(false);
	});

	it("omits tools field without warning when tools is absent", () => {
		const { frontmatter, warnings } = buildGeminiAgentFrontmatter("bot", {
			description: "x",
		});
		expect(frontmatter.tools).toBeUndefined();
		expect(warnings.some((w) => w.includes("tool"))).toBe(false);
	});
});

// ── renderGeminiAgentMd ───────────────────────────────────────────────────────

describe(renderGeminiAgentMd, () => {
	it("wraps frontmatter in --- fences with a blank line before body", () => {
		const result = renderGeminiAgentMd(
			{ name: "bot", description: "A bot" },
			"body text",
		);
		expect(result).toMatch(/^---\n/);
		expect(result).toContain("\n---\n\nbody text\n");
	});

	it("trims trailing whitespace from body", () => {
		const result = renderGeminiAgentMd(
			{ name: "x", description: "" },
			"  body  \n\n",
		);
		expect(result.endsWith("body\n")).toBe(true);
	});
});

// ── GeminiAgentAdapter.sync ───────────────────────────────────────────────────

describe(GeminiAgentAdapter, () => {
	afterEach(() => vi.clearAllMocks());

	it("writes a JSON agent to ~/.gemini/agents/", async () => {
		const adapter = new GeminiAgentAdapter();
		await adapter.sync({
			agent: { myAgent: { description: "A test agent" } },
		} as never);

		const writtenPaths = vi
			.mocked(writeFile)
			.mock.calls.map((c) => String(c[0]));
		expect(writtenPaths.some((p) => p.match(/agents\/my-agent\.md$/))).toBe(
			true,
		);
	});

	it("writes an MD agent from ~/.config/opencode/agents/ to ~/.gemini/agents/", async () => {
		vi.mocked(readdir).mockResolvedValue(["helper.md"] as never);
		vi.mocked(readFile).mockImplementation(async (path) => {
			if (String(path).endsWith("helper.md")) {
				return "---\nname: helper\ndescription: A helper\n---\nbody";
			}
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		const adapter = new GeminiAgentAdapter();
		await adapter.sync({} as never);

		const writtenPaths = vi
			.mocked(writeFile)
			.mock.calls.map((c) => String(c[0]));
		expect(writtenPaths.some((p) => p.match(/agents\/helper\.md$/))).toBe(true);
	});

	it("skips MD agent whose frontmatter name: collides with a JSON-defined agent", async () => {
		vi.mocked(readdir).mockResolvedValue(["reviewer.md"] as never);
		vi.mocked(readFile).mockImplementation(async (path) => {
			if (String(path).endsWith("reviewer.md")) {
				return "---\nname: code-reviewer\ndescription: from md\n---\nbody";
			}
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		const adapter = new GeminiAgentAdapter();
		await adapter.sync({
			agent: { code_reviewer: { description: "from json" } },
		} as never);

		const writtenPaths = vi
			.mocked(writeFile)
			.mock.calls.map((c) => String(c[0]));
		const agentWrites = writtenPaths.filter((p) => p.endsWith(".md"));
		expect(agentWrites).toHaveLength(1);
		expect(agentWrites[0]).toMatch(/code-reviewer\.md$/);
	});

	it("deletes a manifest agent when it is no longer in any source", async () => {
		vi.mocked(readdir).mockResolvedValue([] as never);
		vi.mocked(readFile).mockImplementation(async (path) => {
			if (String(path).endsWith(".relay-manifest.json")) {
				return JSON.stringify(["old-agent"]);
			}
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		const adapter = new GeminiAgentAdapter();
		await adapter.sync({} as never);

		expect(vi.mocked(rm)).toHaveBeenCalledWith(
			expect.stringMatching(/old-agent\.md$/),
			expect.anything(),
		);
	});

	it("does not delete a manifest agent that is still present in the source", async () => {
		vi.mocked(readdir).mockResolvedValue([] as never);
		vi.mocked(readFile).mockImplementation(async (path) => {
			if (String(path).endsWith(".relay-manifest.json")) {
				return JSON.stringify(["my-agent"]);
			}
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		const adapter = new GeminiAgentAdapter();
		await adapter.sync({
			agent: { my_agent: { description: "still here" } },
		} as never);

		expect(vi.mocked(rm)).not.toHaveBeenCalledWith(
			expect.stringMatching(/my-agent\.md$/),
			expect.anything(),
		);
	});

	it("routes space-separated acronym MD agent to api-tester.md", async () => {
		vi.mocked(readdir).mockResolvedValue(["api-tester.md"] as never);
		vi.mocked(readFile).mockImplementation(async (path) => {
			if (String(path).endsWith("api-tester.md")) {
				return "---\nname: API Tester\ndescription: Tests APIs\n---\nbody";
			}
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		const adapter = new GeminiAgentAdapter();
		await adapter.sync({} as never);

		const writtenPaths = vi
			.mocked(writeFile)
			.mock.calls.map((c) => String(c[0]));
		expect(writtenPaths.some((p) => p.match(/agents\/api-tester\.md$/))).toBe(
			true,
		);
	});

	it("writes agent with missing description and emits warning", async () => {
		vi.mocked(readdir).mockResolvedValue([] as never);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const adapter = new GeminiAgentAdapter();
		await adapter.sync({
			agent: { no_desc: {} },
		} as never);

		const writtenPaths = vi
			.mocked(writeFile)
			.mock.calls.map((c) => String(c[0]));
		expect(writtenPaths.some((p) => p.match(/agents\/no-desc\.md$/))).toBe(
			true,
		);
		expect(
			warnSpy.mock.calls.some((args) =>
				String(args[0]).includes("no description"),
			),
		).toBe(true);

		warnSpy.mockRestore();
	});

	it("escapes ${…} template expressions in MD agent body and warns", async () => {
		vi.mocked(readdir).mockResolvedValue(["my-agent.md"] as never);
		vi.mocked(readFile).mockImplementation(async (path) => {
			if (String(path).endsWith("my-agent.md")) {
				return "---\nname: my-agent\ndescription: x\n---\nfetch(`${baseURL}/api`)";
			}
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const adapter = new GeminiAgentAdapter();
		await adapter.sync({} as never);

		expect(
			warnSpy.mock.calls.some((args) => String(args[0]).includes("baseURL")),
		).toBe(true);

		const writtenContent = String(
			vi
				.mocked(writeFile)
				.mock.calls.find((c) => String(c[0]).endsWith("my-agent.md"))?.[1],
		);
		expect(writtenContent).toContain("\\${baseURL}");
		expect(writtenContent).not.toMatch(/(?<!\\)\$\{baseURL\}/);

		warnSpy.mockRestore();
	});
});

// ── detectGeminiTemplateVars ──────────────────────────────────────────────────

describe(detectGeminiTemplateVars, () => {
	it("returns empty array when no template vars present", () => {
		expect(detectGeminiTemplateVars("hello world")).toEqual([]);
	});

	it("detects a single template var", () => {
		expect(detectGeminiTemplateVars("fetch(`${baseURL}/api`)")).toEqual([
			"baseURL",
		]);
	});

	it("detects multiple distinct template vars", () => {
		expect(
			detectGeminiTemplateVars(
				"fetch(`${baseURL}`, { headers: { auth: ${authToken} } })",
			),
		).toEqual(["baseURL", "authToken"]);
	});

	it("deduplicates repeated vars", () => {
		expect(detectGeminiTemplateVars("${foo} and ${foo} again")).toEqual([
			"foo",
		]);
	});

	it("ignores vars starting with a digit", () => {
		expect(detectGeminiTemplateVars("${1foo}")).toEqual([]);
	});
});

// ── escapeGeminiTemplateVars ──────────────────────────────────────────────────

describe(escapeGeminiTemplateVars, () => {
	it("escapes a single template var", () => {
		expect(escapeGeminiTemplateVars("fetch(`${baseURL}/api`)")).toBe(
			"fetch(`\\${baseURL}/api`)",
		);
	});

	it("escapes multiple distinct vars", () => {
		expect(escapeGeminiTemplateVars("`${baseURL}` and `${authToken}`")).toBe(
			"`\\${baseURL}` and `\\${authToken}`",
		);
	});

	it("returns body unchanged when no vars present", () => {
		expect(escapeGeminiTemplateVars("no vars here")).toBe("no vars here");
	});

	it("escapes vars with underscores", () => {
		expect(escapeGeminiTemplateVars("${my_var}")).toBe("\\${my_var}");
	});
});
