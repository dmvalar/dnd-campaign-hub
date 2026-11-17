# Development and release workflow

Use `dev` as the integration branch for all development. Keep `main` as the stable release branch.

## Features and fixes

1. Update `dev` with `git switch dev` and `git pull --ff-only origin dev`.
2. Create a branch from `dev`, for example `git switch -c feature/your-feature-name`.
3. Implement the change and run `npm run check`, `npm run test`, then `npm run build`.
4. Open pull requests against `dev`; merge completed features and fixes into `dev`.
5. Validate the combined changes on `dev` before testing a development build or publishing a beta.

Stage only files belonging to the change. Preserve unrelated local edits.

## Beta and stable releases

- Publish beta/unstable tags from validated commits on `dev`, with a prerelease version such as `0.15.0-beta.2`.
- Keep the version in `manifest.json`, `package.json`, the root package-lock entries, and `versions.json` synchronized. Package `main.js`, `manifest.json`, and `styles.css` from the same validated commit.
- Publish betas with `gh release create ... --verify-tag --prerelease --latest=false`, using release notes for that version and an explicit `--target dev`.
- Complete beta acceptance testing before promoting `dev` into `main` for a requested stable release. Validate the resulting stable version before tagging and publishing it.
- Push only the intended branch and tag. Retain published release tags and assets.
- While testers use a published beta, keep their installed build aligned with its tag; switching the test vault to a newer development build is a separate testing step.

## Branch and worktree cleanup

After a feature is integrated into `dev`, remove its branch and worktree once all commits and useful uncommitted work are preserved. Check both tracked/untracked changes and ignored files before removing worktrees. Keep `dev`, `main`, and release tags. Explicitly abandoned features may be dropped.
