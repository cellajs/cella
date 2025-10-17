## Releases

We use GitHub Actions to automatically create releases when version tags are pushed.

1. Make sure your changes are merged.
2. Bump the version with pnpm (this also creates a Git tag):  

```sh
  pnpm version patch   # or minor / major
```
3. Push the commit and the tag:
```sh
  git push origin --follow-tags
```
Thats it, the workflow will generate RELEASE_NOTES.md from commit messages and publish a GitHub Release automatically.

Release notes are grouped by commit type. The following prefixes are supported:
- `feat:`, `fix:`, `perf:`, `refactor:`, `revert:`, `chore:`, `ci:`, `docs:` `style:`, `test:`, `build:`

<br />
<br />
