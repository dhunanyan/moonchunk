# Troubleshooting

## File not highlighted

- Ensure file extension is `.mncnk`
- Set language mode manually to `MoonChunk`
- Reload window after installing/reinstalling extension

## Walkthrough/dashboard not opening

- Check setting `moonchunk.postInstallExperience`
- Set to `home` or `walkthrough`
- Run command: `MoonChunk: Open Home Dashboard`

## Scope mismatch

- Inspect token scopes via developer command
- adjust regex patterns in `syntaxes/moonchunk.tmLanguage.json`
