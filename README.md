# OCD - Organized Context Datastore (MCP)

An MCP server that lets **LLMs and humans** collaboratively read and write hierarchically structured contexts.

---

## Why OCD — A UX-First Approach

OCD is designed to optimize both **LLM UX** and **Human UX**.

### LLM UX — Making AI More Effective

| Challenge | OCD's Approach |
|-----------|----------------|
| **Context loss** | Persist project knowledge in a durable store. Maintain consistent context across sessions |
| **Inefficient token usage** | Retrieve only the nodes you need with `ocd_get_context_tree`. Maximize token efficiency via the `tree-text` format |
| **Knowledge fragmentation** | Fetch related contexts together using hierarchical structure and pattern-based queries |
| **Consistency** | Single source of truth. LLMs and humans read and edit the same Markdown files |

LLMs interact via MCP tools — search, retrieve, update, and commit — in a natural workflow.

### Human UX — Making Humans Comfortable

| Need | OCD's Approach |
|------|----------------|
| **Readability** | Markdown-based. Edit directly in your favorite editor or on GitHub |
| **Visualization** | Web UI (`/viewer`) with tree view, search, and editing. Accessible from any browser |
| **History tracking** | Git integration. Track changes and review diffs |
| **Collaboration** | Humans review and refine what LLMs write, and vice versa |

In stdio mode, **Cursor connects via stdio** while **humans access the browser** — a single configuration serves both.

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
