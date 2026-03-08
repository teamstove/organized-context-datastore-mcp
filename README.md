# OCD - Organized Context Datastore (MCP)

> **[日本語版はこちら (README_jp.md)](./README_jp.md)**

**Give your AI persistent, structured memory — and let humans see it too.**

OCD is an [MCP](https://modelcontextprotocol.io/) server that stores project knowledge as Markdown files in a hierarchical tree. LLMs read and write via MCP tools; humans browse and edit via a built-in Web UI or any text editor. Both share the same source of truth.

### Why OCD?

- **No more lost context** — Project knowledge persists across sessions in a Git-backed store
- **Token-efficient** — Fetch only the branches you need with `tree-text` format, not entire documents
- **Human-friendly** — Plain Markdown + frontmatter. Edit in VS Code, review on GitHub, or use the built-in Web UI
- **One command** — `npx github:teamstove/organized-context-datastore-mcp` starts both the MCP server and the Web UI

---

## Quick Start

### One-Liner (stdio + Web UI enabled by default)

```bash
# Cursor connects via stdio + humans browse http://localhost:38291/viewer
npx github:teamstove/organized-context-datastore-mcp

# Read-only mode
npx github:teamstove/organized-context-datastore-mcp --readonly
```

### HTTP Server Mode

```bash
# Local dev mode (with Web UI)
npx github:teamstove/organized-context-datastore-mcp --http --port 38291

# Remote server mode
npx github:teamstove/organized-context-datastore-mcp --http --mode remote-server --config ./config.json
```

---

## How It Works

```
┌──────────────┐   MCP (stdio / HTTP)   ┌─────────────────┐
│  LLM / IDE   │ ◄───────────────────► │   OCD Server    │
│  (Cursor…)   │                        │                 │
└──────────────┘                        │  Markdown files │
                                        │  + frontmatter  │
┌──────────────┐   HTTP + Web UI        │  + Git history  │
│    Human     │ ◄───────────────────► │                 │
│  (Browser)   │                        └─────────────────┘
└──────────────┘
```

| For LLMs | For Humans |
|----------|------------|
| Persistent memory across sessions | Plain Markdown — edit anywhere |
| Hierarchical tree with pattern queries | Built-in Web UI with tree view & search |
| Token-efficient `tree-text` retrieval | Git-backed history & diffs |
| 6 MCP tools: list, get, tree, search, mutate, commit | Review and refine what the AI writes |

---

## CLI Options

| Option | Description |
|--------|-------------|
| *(none)* | stdio mode (default) + Web UI on port 38291 |
| `--http` | HTTP server mode |
| `--readonly` | Disable write tools |
| `--port <port>` | HTTP port number (default: 38291) |
| `--web-ui-port <port>` | Web UI port in stdio mode (default: 38291) |
| `--disable-web-ui` | Disable the Web UI |
| `--mode <mode>` | HTTP only: `local-dev` / `remote-server` |
| `--config <path>` | Config file for `remote-server` mode |

**Duplicate launch behavior**: If OCD is already running on the same port, subsequent launches log "OCD is already running on this port" and exit cleanly (exit 0). An error exit only occurs when the port is occupied by a different process. The server identity check uses **GET /whois** — if the response is `OCD`, it is recognized as an existing OCD instance.

---

## Cursor / IDE Configuration

### One-Liner (stdio + Web UI)

```json
{
  "mcpServers": {
    "ocd-mcp": {
      "command": "npx",
      "args": [
        "--package", "github:teamstove/organized-context-datastore-mcp",
        "tsx", "src/cli.ts"
      ]
    }
  }
}
```

- **Cursor** connects via stdio
- **Humans** browse `http://localhost:38291/viewer`

### stdio Only (Web UI disabled)

```json
"args": [
  "--package", "github:teamstove/organized-context-datastore-mcp",
  "tsx", "src/cli.ts",
  "--disable-web-ui"
]
```

### Via bin Entry (after package install)

```json
{
  "mcpServers": {
    "ocd-mcp": {
      "command": "npx",
      "args": ["github:teamstove/organized-context-datastore-mcp"]
    }
  }
}
```

### HTTP Mode

```bash
# Start the server in a terminal
npx github:teamstove/organized-context-datastore-mcp --http --port 38291
```

```json
{
  "mcpServers": {
    "ocd-mcp": {
      "url": "http://localhost:38291/api/mcp"
    }
  }
}
```

Web UI is available at `http://localhost:38291/viewer`.

### Context Roots Filtering (HTTP Mode)

```json
{
  "mcpServers": {
    "ocd-pj-alpha": {
      "url": "http://localhost:38291/api/mcp?roots=project-alpha,core-docs"
    },
    "ocd-pj-beta-readonly": {
      "url": "http://localhost:38291/api/mcp?roots=project-beta,shared&readonly=shared"
    }
  }
}
```

| Parameter | Description | Example |
|-----------|-------------|---------|
| `roots` | Context Root IDs to include (comma-separated) | `?roots=A,B,C` |
| `readonly` | Context Root IDs to make read-only | `?readonly=C` |

---

## Configuration

### Local Config (`.ocd.config.js`)

Place in the project root. OCD searches upward from cwd automatically.

```javascript
export default {
  contextRoots: [
    {
      path: './organized-context',
      git: 'auto-commit'
    },
    {
      path: './CORE/docs',
      name: 'CORE Docs',
      readOnly: true
    }
  ],
  inheritGlobal: true
}
```

### Global Config (`~/.ocd/config.js`)

Define Context Roots shared across all projects.

### Git Modes

| Value | Description |
|-------|-------------|
| `'auto-commit'` | Automatically commit after each operation |
| `'manual'` | Commit explicitly via the `ocd_commit` tool (**default**) |
| `'none'` | Do not use Git |

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `ocd_list_context_roots` | List all Context Roots |
| `ocd_get_contexts` | Retrieve contexts by pattern and filters |
| `ocd_get_context_tree` | Get the context tree (table of contents) |
| `ocd_search_contexts` | Search contexts by keyword |
| `ocd_mutate_context` | Mutate a context (create / update / delete / move) |
| `ocd_commit` | Commit changes (for `git: 'manual'` mode) |

### ocd_mutate_context — Performance Notes

- **Serialization**: Within the same Context Root (same cwd), `ocd_mutate_context` and `ocd_commit` execute **one at a time**. When called in rapid succession, subsequent calls wait for the previous one to complete — this is a queue, not a freeze. This prevents Git operation conflicts.
- **Move cost**: A `move` operation scans all `.md` files under the Context Root to update internal links and prevent broken references. If the root contains many files, a single move may take noticeable time.

---

## Directory Structure Example

```
my-context-store/
├── .ocd.config.js
├── project-a/
│   ├── index.md
│   ├── features/
│   │   ├── feature-1.md
│   │   └── feature-2.md
│   └── decisions/
│       └── adr-001.md
└── project-b/
    └── ...
```

---

## Markdown Format

```markdown
---
title: Feature Specification
status: draft
priority: high
---

# User Authentication

## Overview

Details about the user authentication implementation...
```

All frontmatter fields other than `title` are treated as `attrs`.

---

## Installation

```bash
git clone https://github.com/teamstove/organized-context-datastore-mcp.git
cd organized-context-datastore-mcp
npm install
```

The Web UI is built automatically on first launch. To build manually: `npm run build:web-ui`.

---

## For Developers

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for local development, testing, and build instructions.

---

## License

MIT
