# 🔄 OpenCode Sync

OpenCode Sync is a lightweight background daemon that synchronizes your **OpenCode** configurations across multiple AI CLI tools, starting with **Claude Code**. 

It acts as a bridge, allowing you to maintain a single "source of truth" for your MCP servers, custom agents, and skills, while automatically translating and deploying them to provider-specific configuration files.

## ✨ Features

- **Hub-and-Spoke Architecture**: Centrally managed configuration relayed to multiple targets.
- **MCP Server Sync**: Automatically maps OpenCode MCP definitions to `~/.claude.json`.
- **Agent Synchronization**: Syncs custom agents defined in JSON or Markdown to `~/.claude/agents/`.
- **Skill Portability**: Copies OpenCode skills to `~/.claude/skills/` while maintaining compatibility.
- **Smart Transformations**:
  - Resolves `{env:VAR}` templates at sync time.
  - Handles model aliasing (e.g., `anthropic/claude-sonnet-4-6` → `sonnet`).
  - Translates tool permission objects to Claude's PascalCase strings.
- **Non-Destructive**: Merges changes into existing configuration files without overwriting unrelated user settings.
- **Live Watching**: Debounced file watcher (chokidar) reacts instantly to changes in your OpenCode config.

---

## 🚀 Getting Started

### Installation

**Global Install (Recommended):**
```bash
npm install -g opencode-sync
```

**From Source:**
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/opencode-sync.git
   cd opencode-sync
   ```
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

---

## 🛠️ Running as a Daemon

OpenCode Sync includes a built-in installer to run as a background service.

### Quick Install (Global)

If you installed globally, simply run:
```bash
opencode-sync daemon install
```

### Manual Install (From Source)

```bash
npm run install-daemon
```

### Platform Support

- **macOS (launchd)**: Installs a User Launch Agent. Logs are in `~/Library/Logs/opencode-sync.log`.
- **Linux (systemd)**: Installs a Systemd User Unit. Logs are in `journalctl --user -u opencode-sync -f`.

### Uninstallation

To stop and remove the daemon:
```bash
opencode-sync daemon uninstall
```

---

## ⚙️ Configuration Guide

### Source of Truth

The relay watches the following paths:
- **Config File**: `~/.config/opencode/opencode.jsonc` (JSON with comments)
- **Agents Folder**: `~/.config/opencode/agents/`
- **Skills Folder**: `~/.config/opencode/skills/`

### 1. MCP Servers

Define your servers in `opencode.jsonc` under the `mcp` key:

```jsonc
{
  "mcp": {
    "my-tool": {
      "type": "local",
      "command": ["npx", "-y", "some-tool"],
      "environment": {
        "API_KEY": "{env:MY_API_KEY}"
      }
    }
  }
}
```

**Transformations for Claude Code:**
- `type: "local"` → `type: "stdio"`
- `command` array → split into `command` string and `args` array.
- `environment` → `env`.
- `{env:VAR}` → resolved to the actual environment variable value.

### 2. Agents

Agents can be defined in `opencode.jsonc` or as Markdown files in `~/.config/opencode/agents/`.

**JSON Format:**
```jsonc
{
  "agent": {
    "developer": {
      "description": "Expert developer agent",
      "model": "anthropic/claude-sonnet-4-6",
      "prompt": "{file:./prompts/dev.txt}",
      "tools": { "write": true, "bash": true }
    }
  }
}
```

**Markdown Format (`developer.md`):**
```markdown
---
description: Expert developer agent
model: anthropic/claude-sonnet-4-6
tools:
  write: true
  bash: true
---
You are an expert developer...
```

The relay automatically maps tools to Claude's format (`tools: "Write, Bash"`) and writes to `~/.claude/agents/developer.md`.

### 3. Skills

Place your skills in `~/.config/opencode/skills/<name>/SKILL.md`. These are copied directly to `~/.claude/skills/`.

*Note: Skills already located in `~/.claude/skills/` are natively detected by both OpenCode and Claude Code, so they are not processed by the relay to avoid circular updates.*

---

## 🧪 Development & Testing

Run the relay in development mode (watches source files and syncs immediately):
```bash
npm run dev
```

Run unit tests:
```bash
npm test
```

## 📄 License

MIT © Jose Goncalves
