# scaffold-tmp

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install
4
```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

### Release

Before building a beta installer, bump the version and update the changelog:

```bash
npm run release
```

This uses [standard-version](https://github.com/absolute-version/commit-and-tag-version) to read conventional commit messages (`feat:`, `fix:`, `chore:`, etc.) since the last tag, bump `package.json`'s version accordingly (plain semver, no prerelease suffix — this project stays under `1.0.0` during beta), prepend a new entry to `CHANGELOG.md`, and create a `chore(release): X.Y.Z` commit with a matching `vX.Y.Z` git tag.

After running it:

```bash
git push --follow-tags
```

Then build the installer as usual (`npm run build:win`, etc.) — the version baked into the app now matches the tag.
