# Pi Extensio

Personal Pi extensions packaged for installation across workstations.

## Development

- Read Pi's extension and package documentation before changing extension APIs or package metadata.
- Keep each extension focused and independently testable.
- Keep policy configuration separate from interception logic.
- Prefer narrow, explicit safety rules over broad command classification.
- Add tests for every guarded and unguarded behavior change.
- Run `npm test` before handing off changes.
- Never commit credentials, tokens, `.env` files, or workstation-specific settings.

## Layout

- `extensions/` — Pi extensions loaded by the package manifest.
- `tests/` — Node test-runner coverage for extension logic and event behavior.
