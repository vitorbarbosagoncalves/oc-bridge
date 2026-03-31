process.title = "oc-bridge";

import { ClaudeAgentAdapter } from "./adapters/ClaudeAgentAdapter.js";
import { ClaudeMcpAdapter } from "./adapters/ClaudeMcpAdapter.js";
import { ClaudeSkillAdapter } from "./adapters/ClaudeSkillAdapter.js";
import { GeminiAgentAdapter } from "./adapters/GeminiAgentAdapter.js";
import { GeminiMcpAdapter } from "./adapters/GeminiMcpAdapter.js";
import { GeminiSkillAdapter } from "./adapters/GeminiSkillAdapter.js";
import { installDaemon, uninstallDaemon } from "./daemon.js";
import { SyncEngine } from "./engine/SyncEngine.js";

async function runDaemon(): Promise<void> {
	const engine = new SyncEngine([
		new ClaudeMcpAdapter(),
		new ClaudeAgentAdapter(),
		new ClaudeSkillAdapter(),
		new GeminiMcpAdapter(),
		new GeminiSkillAdapter(),
		new GeminiAgentAdapter(),
	]);

	console.info("[bridge] Starting oc-bridge…");

	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => {
			console.info(`\n[bridge] ${signal} received — shutting down`);
			engine
				.stop()
				.then(() => process.exit(0))
				.catch((err: unknown) => {
					console.error("[bridge] Error during shutdown:", err);
					process.exit(1);
				});
		});
	}

	await engine.start();
	console.info("[bridge] Watching for changes. Press Ctrl+C to stop.");
}

async function main(): Promise<void> {
	const [, , command, subcommand] = process.argv;

	if (command === "daemon") {
		if (subcommand === "install") {
			installDaemon();
			return;
		}
		if (subcommand === "uninstall") {
			uninstallDaemon();
			return;
		}
		console.error(`[bridge] Unknown daemon subcommand: ${subcommand}`);
		process.exit(1);
	}

	await runDaemon();
}

main().catch((err: unknown) => {
	console.error("[bridge] Fatal error:", err);
	process.exit(1);
});
