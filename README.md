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
| `HUDU_MAX_RETRIES=3` | Retries on HTTP 429; honors `Retry-After` |
| `HUDU_MAX_RESPONSE_BYTES=1500000` | Response body truncation guard (prevents MCP context blow-up) |
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

## File uploads (Photos, Uploads, Public Photos)

Tools that take a `file` form-data param accept three source formats:

- **Absolute path**: `/Users/me/Pictures/server.png`
- **Home-relative**: `~/Downloads/rack.jpg`
- **Inline base64**: `base64:image/png|server.png;iVBORw0KG...` (mime+filename optional: `base64:<data>`)

Server reads the file, detects mime by extension, and uploads as multipart.

## Binary downloads (Exports, Photos, Uploads)

Tools with a `download=true` query param return file bytes encoded as base64 in `binary.data` on the response. Cloud-storage redirects (302 to S3) return the redirect URL in `body.redirect` — fetch it directly to download large files.

## Hudu API documentation

- **Interactive API docs (admin login required)**: `https://[your-domain].huducloud.com/`
  → in-app: **Admin → API → Hudu API Documentation**
- **Raw Swagger / OpenAPI spec (admin session cookie required)**: `https://[your-domain].huducloud.com/api-docs.json`
- **Public REST API guide**: https://support.hudu.com/hc/en-us/articles/11422780787735-REST-API

## Updating the Hudu spec

`swagger.json` is bundled in the repo and drives all tool generation. To refresh from your instance:

**Option A — save from browser (simplest)**:
1. Log into Hudu as admin in your browser.
2. Open `https://[your-domain].huducloud.com/api-docs.json`
3. Save the JSON response as `swagger.json` in this repo (overwrites bundled copy).
4. `npm run build` — new endpoints become tools automatically on next server start.

**Option B — `scripts/fetch-swagger.sh` with session cookie**:
1. Log into Hudu as admin in your browser.
2. DevTools → Application → Cookies → `[your-domain].huducloud.com` → copy `_hudu_session` value.
3. Run:
   ```bash
   HUDU_SESSION_COOKIE='_hudu_session=<paste>' \
   HUDU_BASE_URL=https://[your-domain].huducloud.com/api/v1 \
   ./scripts/fetch-swagger.sh
   ```

**Option C — `HUDU_SWAGGER_PATH`**: point the server at a swagger file anywhere on disk without overwriting the bundled one.

> Hudu does **not** accept the `x-api-key` header on `/api-docs.json`; admin session auth is the only path.

## Safety notes

- API keys can be scoped in Hudu's admin UI: passwords, destructive actions, exports, IP allowlist, company restrictions. Scope your key as tightly as possible.
- For agents that should never delete, set `HUDU_READONLY=true`.
- For agents that need only read access to specific resource groups, use `HUDU_DISABLED_OPERATIONS` to block writes.
- The server logs to stderr only; tool responses include HTTP status, OK flag, content-type, and parsed body.

## License

MIT
