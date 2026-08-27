# dsh-github-manager

[中文](README.md) | **English**

A [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness) plugin that gives AI agents a **GitHub repository auto-management channel**. It registers a suite of tools so an agent can manage repositories, issues, pull requests, branches, files, labels, topics, tags, releases, and search through the GitHub REST API.

> Distributed per the **DSH community plugin spec**: bundle (`dsh.bundle.patch`) + Web settings card (`dsh.client`). The repository is tagged with the `dsh-plugin` topic so the community can find it.

## Tools

| Tool | Scope | Description |
| --- | --- | --- |
| `github_ping` | Connectivity | Verify the channel and token; reports the current user and remaining quota |
| `github_list_repos` | Repos | List repos for the authenticated user or a named owner |
| `github_get_repo` | Repos | Detailed metadata for one repository |
| `github_create_repo` | Repos | Create a new repository (user or organization) |
| `github_list_issues` | Issues | List issues, filtered by state / labels / assignee |
| `github_create_issue` | Issues | Open a new issue |
| `github_update_issue` | Issues | Update an issue (title / body / state / labels / assignees) |
| `github_comment_issue` | Issues | Comment on an issue or pull request |
| `github_list_pulls` | PRs | List pull requests |
| `github_get_pull` | PRs | Full metadata for one pull request |
| `github_create_pull` | PRs | Open a pull request |
| `github_merge_pull` | PRs | Merge a pull request (merge / squash / rebase) |
| `github_list_branches` | Branches | List branches |
| `github_read_file` | Files | Read a text file from a repository |
| `github_write_file` | Files | Create or update a file (versioned via the commits API) |
| `github_delete_file` | Files | Delete a file |
| `github_list_labels` | Labels | List repository labels |
| `github_create_label` | Labels | Create a label |
| `github_get_topics` | Topics | Get the repository topic list |
| `github_update_topics` | Topics | Replace all repository topics in one write |
| `github_list_tags` | Tags | List git tags with their commit SHAs |
| `github_list_releases` | Releases | List releases, newest first |
| `github_get_latest_release` | Releases | Get the latest published release |
| `github_create_release` | Releases | Create a release (creates the tag when missing) |
| `github_update_release` | Releases | Update a release (title / notes / draft / prerelease) |
| `github_search_code` | Search | Code search across GitHub |
| `github_search_issues` | Search | Search issues and pull requests |

All mutating tools describe the action instead of performing it when `dryRun: true` — safe for reviewing or staging agent workflows.

## Installation

The plugin ships as a **bundle**. Install it into a DSH profile:

```sh
# from a local directory
dsh plugin --profile demo add ./dsh-github-manager

# from GitHub (pinning a commit is safer)
dsh plugin --profile demo add github:yuan-source-666/dsh-github-manager#<sha>
```

> Installing from git pulls sources and the `prepare` script compiles `lib/`. pnpm >= 10 requires explicitly allowing builds in the profile's `pnpm-workspace.yaml`:
>
> ```yaml
> allowBuilds:
>   dsh-github-manager: true
> ```
>
> Only authorize packages whose sources you trust. See the [DSH packaging & installation docs](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish/).

Verify the installation:

```sh
dsh --profile demo --dump-config   # shows the "# == dsh-github-manager" layer
dsh --profile demo
```

## Web settings

After installing, open http://127.0.0.1:3080 -> **Settings -> Plugins -> Configurable** and you will find the "GitHub repository management" card:

- **Master switch**: turning it off **instantly unregisters** all 27 GitHub tools from the model's tool surface; turning it back on restores them — **no restart**.
- **Access token**: a write-only password field; the stored value never travels back over the wire and never appears in read results. Leave it empty to fall back to the `GH_TOKEN` / `GITHUB_TOKEN` environment variables.
- API / web roots, request timeout, dry-run: edit and save per field; "overridden" markers show which fields live in your user layer, and "reset" makes a field inherit the bundle layer again.

Saves go through the DSH settings namespace `dsh-github-manager` (revision-fenced writes); the token is registered with the `secret` role and redacted on reads. Changes take effect immediately: the next tool call uses the new token / timeout / dry-run state.

### Getting a GitHub token (quick guide)

1. Open https://github.com/settings/tokens (for Enterprise, use your site root — the card's "open token page" link follows the web root you set in the card).
2. **Generate new token** -> **fine-grained** recommended (permissions can be locked to specific repos), or classic.
3. Grant what you need on the target repos: `Contents` (file read/write), `Issues`, `Pull requests`; creating repos additionally needs `Administration`; read-only search/metadata only needs `Metadata`.
4. Copy the token, paste it into the card's token field and save — written once, never echoed. Remove the entry any time and the plugin falls back to `GH_TOKEN` / `GITHUB_TOKEN`.

## Configuration (headless deployments)

CLI or headless setups can override defaults directly in the profile's `cordis.patch.yml` (no need to touch the package):

```yaml
- id: dsh-github-manager
  name: dsh-github-manager
  config:
    enabled: true          # master switch: false registers no tools at all
    # do NOT put the token in a file - use the settings card or environment
    baseUrl: 'https://api.github.com'
    webUrl: 'https://github.com'
    timeoutMs: 30000
    dryRun: false
```

| Field | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Master switch; off unregisters all 27 tools from the model surface |
| `token` | (none) | Personal access token; settings-card value wins, empty reads `GH_TOKEN` / `GITHUB_TOKEN` |
| `baseUrl` | `https://api.github.com` | REST API root (change for GitHub Enterprise) |
| `webUrl` | `https://github.com` | Web root for human-facing links |
| `timeoutMs` | `30000` | Per-request timeout in milliseconds |
| `dryRun` | `false` | When true, mutating tools describe actions instead of executing |

### Required GitHub permissions

For a fine-grained token, grant as needed:

- Repo metadata: `Contents: read` (all read tools)
- Repositories: `Administration: write` (`github_create_repo`)
- Issues: `Issues: write` (`github_create_issue`, `github_update_issue`, `github_comment_issue`)
- PRs: `Pull requests: write` (`github_create_pull`, `github_merge_pull`)
- Files: `Contents: write` (`github_write_file`, `github_delete_file`)
- Labels: `Issues: write`, or `Metadata: read` + repo admin (`github_create_label`)
- Topics: `Topics: write` (`github_update_topics`; reading needs only `Metadata: read`)
- Releases: `Contents: write` (`github_create_release`, `github_update_release`; listing tags/releases needs only `Metadata: read`)

## Development

```sh
# 1) typecheck + build (emits lib/*.js and lib/types/*.d.ts)
pnpm install
pnpm run build

# 2) runtime smoke tests (stub ctx + mocked fetch; no network, no keys; path-independent)
node tests/smoke-test.mjs
node tests/client-smoke.mjs
# or: pnpm run test

# 3) load from TypeScript source inside DeepSeek Harness (absolute-path patch, no build)
cd /path/to/deepseek-harness
pnpm dsh web --patch <this-dir>/load.dev.patch.yml
```

Once http://127.0.0.1:3080 is up, try telling the model:
"use github_ping to check the GitHub channel" or
"list open issues of deepseek-harness/deepseek-harness and comment Triage on each unassigned bug-labeled one".

## Architecture

The plugin follows DSH conventions:

- **Function-form plugin**; `inject = ['tools']` declares the dependency on the tools registry; the settings namespace binds via `installSettingsSection` and pairs with the browser card half by the same namespace.
- **Settings card pair (Web)**: the host half registers the namespace `dsh-github-manager`; the browser half registers the card into the `settings.plugin.item` keyed slot (key = the same namespace string), and the settings UI pairs them automatically. The switch is **live**: flipping `enabled` triggers unregister/re-register without restarting the process.
- **Config defined as a Schemastery schema** — every tunable is a config field with its default in the schema, never hardcoded; the token carries the `secret` role (redacted on read, write-only).
- **Every tool uses `defineTool`**: `parameters` is derived from the DSL and validates `args`; `execute` returns the canonical value declared by `output.schema`; `output.render` turns it into model-facing text.
- **Everything registered through `ctx` is cleaned up automatically on unload** (HMR friendly).
- A single shared GitHub REST client under the hood: unified auth, pagination, and error normalization; settings commits update its identity **in place**, so token rotation takes effect on the very next request.

## License

MIT
