# Development scripts

These scripts are contributor/CI utilities and are excluded from the npm package.

- `npm run audit:release` checks Git publication candidates, or source candidates before Git initialization, for recognizable secrets and private data. It also checks staged content when a Git index exists. Findings identify a file and category without printing the matching value.
- `npm run verify:package` builds the CLI, validates the exact npm file allowlist and contents, installs a local tarball in a disposable OS temporary directory, and exercises the installed executable, library exports, and generated configuration. It removes its temporary files on completion, including failure.

Package installation uses npm's configured cache and may need registry access on a fresh machine. These scripts never commit, push, publish, deploy, or upload anything. Pattern scans supplement manual review; they do not prove that arbitrary content contains no secrets.
