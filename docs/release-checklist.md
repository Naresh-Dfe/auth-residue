# Release checklist

- Run npm ci with the committed lockfile and install the separate demo dependencies.
- Install Chromium and run npm run check:release, the same validation command used by CI. It includes build, typecheck, lint, format:check, all tests, demo typecheck, privacy auditing, npm pack --dry-run, and verify:package.
- Confirm corrected fixtures produce no verified failures and every deliberate failure is still detected. Inspect INCONCLUSIVE/NOT_TESTED separately.
- Review sanitized results and package allowlist; no credentials, .env, fixtures, browser binaries, reports, or demo dependencies may ship.
- Run npm run audit:release and inspect the actual npm pack file list. Review staged Git files too: ignored files that were already tracked can still be committed. Tests, scripts, and the demo belong only in the repository; local reports, implementation notes, caches, editor settings, and private configuration belong in neither publication.
- Run the six-job Node 22/24 × Windows/macOS/Linux CI matrix on the real repository. Local Windows checks do not establish other-platform compatibility.
- Set the repository, homepage, bugs metadata, maintainer ownership, private security reporting, and private moderation contact through the hosting account. Do not include personal filesystem paths or unpublished contact details.
- Check npm name availability and package ownership before publication. If taken, retain the product name and choose an owned scoped alternative such as @your-actual-scope/authresidue.
- Review MIT notices and runtime dependency licenses. Keep the lockfile reproducible. Evaluate security updates before merging Dependabot changes.
- Reconcile tool/schema versions, package metadata, changelog, limitations, and actual validation notes.
- When changing the package version, update the CLI version, emitted toolVersion, result-version schema, and version assertions together. verify:package compares the installed executable with package.json and rejects mismatches; npm version alone does not update these source constants.
- Obtain explicit user authorization before publishing, deploying, pushing, committing, or creating a release. No workflow performs these actions.
