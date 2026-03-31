# 1.0.0 (2026-03-31)


### Bug Fixes

* force lodash-es version to 4.17.21 to fix semantic-release ReferenceError ([7a45086](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/7a450865c64bb895578e80cc961a910140d743bc))


### Features

* **adapter:** add GeminiAgentAdapter to sync subagents to Gemini CLI  ([#13](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/13)) ([a623198](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/a623198a71a25c3f3da1d1ee2a4272097934427b))
* **adapter:** add GeminiMcpAdapter for Gemini CLI MCP sync ([#12](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/12)) ([c76a493](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/c76a4939b621da9aefe0dce69d8e1315bc36c747))
* **daemon:** add cross-platform daemon installer for macOS and Linux ([#9](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/9)) ([46502d9](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/46502d938967e4c0cc0662ac68317b21e80e695e))
* **engine:** implement SyncEngine, CLI entry point, and test suite ([#8](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/8)) ([b79f04f](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/b79f04fbd51804f6712a3d3b0e73df4850b8fd80)), closes [#runSync](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/runSync)
* **engine:** load ~/.config/opencode/.env before each sync ([#11](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/11)) ([fa949ce](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/fa949ce250d3d8bd63d7340aff1a069e5697aca6)), closes [#6](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/6)
* initial project scaffolding and core utilities ([9fde534](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/9fde534e9853840c1ff1d0fd95f4681d7e6e36e7))
* integrate daemon management into main CLI and add npm global install support ([#14](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/14)) ([47514bb](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/47514bb754f627b8d98b44ab11212c5ef9b629fe))
* **mcp:** implement ClaudeMcpAdapter for MCP server sync ([#4](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/4)) ([28c7ca5](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/28c7ca536376874cf1b7e96b9f502236a2573ef8))
* **skill-agent:** implement ClaudeAgentAdapter and ClaudeSkill adapter ([#5](https://github.com/vitorbarbosagoncalves/opencode-relay/issues/5)) ([b99ff8a](https://github.com/vitorbarbosagoncalves/opencode-relay/commit/b99ff8a8f02f69a7b647056b1388af9da3a4a15c))
