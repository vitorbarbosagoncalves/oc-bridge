import { describe, expect, it } from "vitest";

import {
	GeminiSkillAdapter,
	geminiSkillPath,
	openCodeSkillPath,
} from "../../src/adapters/GeminiSkillAdapter.js";

// ── path helpers ──────────────────────────────────────────────────────────────

describe(openCodeSkillPath, () => {
	it("points to SKILL.md inside the OpenCode skills source dir", () => {
		const p = openCodeSkillPath("git-release");
		expect(p).toMatch(/\.config\/opencode\/skills\/git-release\/SKILL\.md$/);
	});
});

describe(geminiSkillPath, () => {
	it("points to SKILL.md inside the Gemini skills target dir", () => {
		const p = geminiSkillPath("git-release");
		expect(p).toMatch(/\.gemini\/skills\/git-release\/SKILL\.md$/);
	});
});

// ── GeminiSkillAdapter ────────────────────────────────────────────────────────

describe(GeminiSkillAdapter, () => {
	const adapter = new GeminiSkillAdapter();

	it("readTarget returns empty string when no name is given", async () => {
		expect(await adapter.readTarget()).toBe("");
	});

	it("readTarget returns empty string for a non-existent skill", async () => {
		expect(await adapter.readTarget("__nonexistent_skill_xyz__")).toBe("");
	});

	it("transform returns the target string unchanged", () => {
		const content = "---\nname: foo\n---\n\nbody\n";
		expect(adapter.transform({}, content)).toBe(content);
	});

	it("writeTarget is a no-op and resolves without error", async () => {
		await expect(adapter.writeTarget("anything")).resolves.toBeUndefined();
	});
});
