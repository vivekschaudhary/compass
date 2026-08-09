<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Adding a dependency? Rebuild the lockfile, don't just install

`npm install <pkg>` on macOS **corrupts the lockfile for Linux**. `sharp` (via `next`) ships
per-platform optional variants; npm on darwin/arm64 installs only the darwin one, and an
incremental install prunes the *transitive* deps of the variants it skipped — `@img/sharp-wasm32`
stays in the lock while its `@emnapi/*` dependencies are dropped.

Nothing local notices. `npm ci` on a Linux CI runner reads the wasm32 entry, looks for its deps,
and refuses the whole install. This has bitten twice.

After changing dependencies, run:

    npm run lockfile:rebuild

A resolve with no existing tree to fall back on is what restores the full set. Verify the actual
CI condition before pushing — not just that `npm install` succeeded:

    rm -rf node_modules && npm ci
