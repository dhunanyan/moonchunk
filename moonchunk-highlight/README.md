# MoonChunk Language Support

Production-ready VS Code extension for the MoonChunk language (`.mncnk`).

## Features

- Syntax highlighting for `*.mncnk` and `Moonfile`
- Extensive TextMate grammar coverage:
  - shebang
  - line and block comments
  - doc comments with TODO/FIXME/NOTE tags
  - annotations (`@annotation`)
  - imports (`use`, `import`, `include`)
  - declarations (`chunk`, `stream`, `module`, `let`, `var`, `const`)
  - function definitions and calls
  - single, double, and triple quoted strings
  - string interpolation (`${...}`)
  - regex literals
  - numeric literals (binary, octal, hex, decimal, exponent, separators)
  - constants, booleans, built-in and user types
  - assignment/comparison/logical/arithmetic/bitwise/nullish/arrow operators
- Language configuration:
  - line/block comments
  - bracket matching
  - auto-closing/surrounding pairs
  - indentation rules
  - folding markers (`#region` / `#endregion`)
  - doc comment enter rules
- Snippets for common MoonChunk patterns
- In-editor Home Dashboard (`MoonChunk: Open Home Dashboard`)
- Guided walkthrough onboarding (`MoonChunk: Open Getting Started Walkthrough`)
- Post-install behavior controls via extension settings

## File Structure

- `package.json` - extension manifest and marketplace metadata
- `syntaxes/moonchunk.tmLanguage.json` - TextMate grammar
- `language-configuration.json` - editor behavior
- `snippets/moonchunk.json` - snippet definitions
- `ui/*` - dashboard webview UI
- `docs/*` - onboarding and troubleshooting docs
- `src/extension.ts` - extension entry source
- `dist/extension.js` - built entry used by VS Code
- `images/logo.png` - marketplace icon

## Dashboard & Walkthrough

- Command: `MoonChunk: Open Home Dashboard`
- Command: `MoonChunk: Open Getting Started Walkthrough`
- Command: `MoonChunk: Open Documentation Index`
- Settings:
  - `moonchunk.postInstallExperience` (`home` | `walkthrough` | `none`)
  - `moonchunk.showWalkthroughOnInstallOrUpdate`
  - `moonchunk.openDocsInEditor`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Build once:

```bash
npm run build
```

3. Run extension development host:

- Open this folder in VS Code
- Press `F5`

4. Test with sample files under `examples/`.

## Package for Marketplace

```bash
npm run package
```

The command generates a `.vsix` package.

## Publish

1. Set correct values in `package.json`:

- `publisher`
- `repository.url`
- `bugs.url`
- `homepage`

2. Login to VS Code Marketplace via `vsce` if needed.
3. Publish:

```bash
npm run publish
```

## Pre-Go-Live Checklist

- [ ] Replace placeholder org/URLs with real project values
- [ ] Bump `version` according to release strategy
- [ ] Verify icon branding in light and dark themes
- [ ] Validate highlighting with real MoonChunk codebase
- [ ] Confirm snippets and indentation behaviors
- [ ] Generate `.vsix` and install-test locally
- [ ] Publish and smoke test after install from marketplace

## License

MIT. See [LICENSE](./LICENSE).
