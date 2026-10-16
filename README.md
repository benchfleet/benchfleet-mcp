# benchfleet-mcp

[![npm](https://img.shields.io/npm/v/benchfleet-mcp)](https://www.npmjs.com/package/benchfleet-mcp)

**Let AI agents use your real Android phones, safely.** `benchfleet-mcp` connects Claude Code, Codex, Cursor, Claude
Desktop and any other [MCP](https://modelcontextprotocol.io) client to [BenchFleet](https://benchfleet.com), the
self-hosted control hub for real Android phones. The agent can list your phones, look at their screens, read the
elements on them, tap, type, open apps and run your published workflows — only on the phones and with the actions
you allow, with approvals for anything sensitive and every step in BenchFleet's audit log.

It is a thin connector: it forwards MCP messages to the BenchFleet app running on the same computer and reaches
nothing else. The tools, the permissions and the phones are all in the app.

## Set up

1. Install BenchFleet from https://benchfleet.com/download and connect your phones (or use its demo phones).
2. In BenchFleet: **Settings → AI clients → Connect an AI client…**, choose what the client may do (*Look only*,
   *Look and operate*, or chosen capabilities) and on which phones, and copy the token it shows once.
3. Add the server to your client:

   **Claude Code**

   ```bash
   claude mcp add benchfleet --env BENCHFLEET_TOKEN=<token> -- npx -y benchfleet-mcp
   ```

   **Codex** (`~/.codex/config.toml`)

   ```toml
   [mcp_servers.benchfleet]
   command = "npx"
   args = ["-y", "benchfleet-mcp"]
   env = { BENCHFLEET_TOKEN = "<token>" }
   ```

   **Claude Desktop, Cursor and other clients** (`mcpServers`)

   ```json
   {
     "mcpServers": {
       "benchfleet": {
         "command": "npx",
         "args": ["-y", "benchfleet-mcp"],
         "env": { "BENCHFLEET_TOKEN": "<token>" }
       }
     }
   }
   ```

The app must be running. *Disconnect* in BenchFleet stops the token at once.

## Tools

`list_devices`, `get_device`, `get_screen`, `get_ui_tree`, `find_element`, `read_text`, `wait_for`, `tap_element`,
`long_press_element`, `type_text`, `type_secret` (a password from BenchFleet's vault, never its value), `swipe`,
`scroll_to`, `press_key`, `launch_app`, `stop_app`, `take_screenshot`, `get_device_logs`, `list_workflows`,
`run_workflow`, `queue_task` (a workflow, or a goal in plain words for the phones' AI agents), `get_task_status`,
`pause_device`, `resume_device`, `request_manual_control`. A client sees only the tools its access allows. There is
no shell, file transfer or install tool. A phone a person is controlling, a paused phone and a phone without
*Automation allowed* refuse every action; CAPTCHAs and other human-only checks stop the agent and ask a person.

## Settings

| Variable | Meaning |
|---|---|
| `BENCHFLEET_TOKEN` | Required: the client's token from the app (`CONTROLHUB_TOKEN` also works) |
| `BENCHFLEET_URL` | Optional: the app's address, when it is not found in its data folder |
| `CONTROLHUB_HOME` | Optional: the app's data folder, when it is not the default one |

Plans: AI clients need BenchFleet Pro or Team (https://benchfleet.com/pricing); the personal edition has no limits.
Support: support@benchfleet.com.

## Use it in Claude Code as a plugin

```
/plugin marketplace add benchfleet/benchfleet-mcp
/plugin install benchfleet@benchfleet-plugins
```

Set `BENCHFLEET_TOKEN` in your environment first (the token from BenchFleet: **Settings → AI clients**).

## Use it in Gemini CLI

```bash
gemini extensions install https://github.com/benchfleet/benchfleet-mcp
```
