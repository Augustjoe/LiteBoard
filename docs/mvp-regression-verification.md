# LiteBoard MVP Regression Verification

This document records the repeatable checks for the current MVP browser flow.

## Code checks

- Frontend: run `npm.cmd run build` in `schemav-frontend`.
- Server: run `npm.cmd run typecheck` in `schemav-server`.

## Browser flow

Start the server, frontend, and Chrome with DevTools port `9224`, then run from the repository root:

```bash
npm.cmd run verify:mvp
```

The script creates a temporary `[AUDIT]` task, opens the dataset manager, sends the remote probe to the mock API, writes JS cleaning code into the filter editor, imports the cleaned current dataset, repeats the same import to verify overwrite confirmation, then clicks through chart/text/table/metric-card creation, canvas drag and resize editing, save, reload restore, clean preview, direct `?preview=1`, and Vue export. The exported Vue code is parsed and template-compiled with Vue's SFC compiler. The script deletes the temporary task at the end.
