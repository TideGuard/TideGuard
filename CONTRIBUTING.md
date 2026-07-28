# Contributing to TideGuard

Thanks for helping improve TideGuard. This project aims to stay small, readable, and interview-explainable.

## Docs first

If you are new to the codebase, skim:

1. [README](README.md) (why it exists)
2. [docs/getting-started.md](docs/getting-started.md)
3. [docs/architecture.md](docs/architecture.md)

Update docs in the same PR when you change user-facing behavior.

## Development setup

1. Fork and clone the repository.
2. Install dependencies with `npm install`.
3. Generate Worker types with `npm run types`.
4. Copy `.dev.vars.example` to `.dev.vars` and set `TOKEN_SECRET`.
5. Run `npm run dev` for the local Worker.
6. Run `npm run ci` before opening a pull request.

## Guidelines

- Prefer clear TypeScript over clever abstractions.
- Keep modules small: HTTP adapters stay thin; domain logic lives in `src/core` and `src/queue`.
- Add or update tests for behavior changes.
- Document user-facing changes in `CHANGELOG.md` and the matching guide under `docs/`.
- Do not commit secrets, `.dev.vars`, or account-specific resource IDs.

## Pull requests

1. Create a focused branch.
2. Keep the diff reviewable: one concern per PR when practical.
3. Fill out the pull request template.
4. Ensure CI is green.

## Reporting issues

Use the GitHub issue templates for bugs and feature requests. Include reproduction steps and expected vs actual behavior for bugs.

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
