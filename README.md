# hudu-mcp-all

Full-coverage [Model Context Protocol](https://modelcontextprotocol.io) server for [Hudu](https://www.hudu.com/) — every documented REST endpoint exposed as an MCP tool, read **and** write.

Unlike existing community Hudu MCPs, `hudu-mcp-all` is generated directly from Hudu's official Swagger spec at startup. New API resources show up automatically when the spec is updated. No hand-maintained tool list.

## Coverage

All 33 documented Hudu API resource groups, full CRUD where the API supports it:

Activity Logs · API Info · Articles · Asset Layouts · Asset Passwords · Assets · Cards · Companies · Expirations · Exports · S3 Exports · Flag Types · Flags · Folders · Groups · IP Addresses · Lists · Magic Dash · Matchers · Networks · Password Folders · Photos · Procedure Tasks · Procedures · Public Photos · Rack Storage Items · Rack Storages · Relations · Uploads · Users · VLAN Zones · VLANs · Websites

Tool names map 1:1 to Hudu Swagger `operationId`s (e.g. `get_companies`, `post_companies`, `put_companies_id`, `delete_companies_id`, `createVlan`, `getIpAddresses`).

## Install

```bash
git clone https://github.com/peetinc/hudu-mcp-all.git
cd hudu-mcp-all
npm install
npm run build
```

## Configure

Set required env vars (either inline, in a `.env` file in CWD, or in your MCP client's server config):

```bash
HUDU_BASE_URL=https://yourorg.huducloud.com/api/v1
HUDU_API_KEY=your-api-key-here
```

Alternative key source — put the key in `~/.hudukey` (default) or any file referenced by `HUDU_API_KEY_FILE`.

### Optional knobs

| Variable | Purpose |
|---|---|
| `HUDU_READONLY=true` | Block all `DELETE` operations |
| `HUDU_DISABLED_OPERATIONS=delete_companies_id,delete_articles_id` | Disable specific tools by name |
| `HUDU_TIMEOUT_MS=30000` | HTTP request timeout |
| `HUDU_SWAGGER_PATH=/path/to/swagger.json` | Override bundled spec |

## Use with Claude Code

```bash
claude mcp add hudu node /absolute/path/to/hudu-mcp-all/dist/index.js \
  --env HUDU_BASE_URL=https://yourorg.huducloud.com/api/v1 \
  --env HUDU_API_KEY=...
```

Or in `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "hudu": {
      "command": "node",
      "args": ["/absolute/path/to/hudu-mcp-all/dist/index.js"],
      "env": {
        "HUDU_BASE_URL": "https://yourorg.huducloud.com/api/v1",
        "HUDU_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Use with Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hudu": {
      "command": "node",
      "args": ["/absolute/path/to/hudu-mcp-all/dist/index.js"],
      "env": {
        "HUDU_BASE_URL": "https://yourorg.huducloud.com/api/v1",
        "HUDU_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Inspect available tools

```bash
npm run list-tools
```

Prints `METHOD  tool_name  /api/path` for every generated tool.

## Updating the Hudu spec

`swagger.json` is bundled in the repo. To refresh:

1. Log in to your Hudu instance as admin → **Admin → API → Hudu API Documentation**
2. Grab the OpenAPI / Swagger JSON
3. Drop it in at `swagger.json` (or point `HUDU_SWAGGER_PATH` at it)
4. Restart the server — new endpoints become tools automatically

## Safety notes

- API keys can be scoped in Hudu's admin UI: passwords, destructive actions, exports, IP allowlist, company restrictions. Scope your key as tightly as possible.
- For agents that should never delete, set `HUDU_READONLY=true`.
- For agents that need only read access to specific resource groups, use `HUDU_DISABLED_OPERATIONS` to block writes.
- The server logs to stderr only; tool responses include HTTP status, OK flag, content-type, and parsed body.

## License

MIT
