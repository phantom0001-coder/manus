# PRIMEz Luau Obfuscator Prototype

Luau-first standalone source protection prototype. This first milestone focuses on a safe frontend, compatibility reporting, and scope-aware identifier mangling before VM lowering or aggressive control-flow transforms.

## Run

```bash
npm install
npm test
npm run build
node dist/cli.js inspect examples/ui-sample.luau
node dist/cli.js build examples/ui-sample.luau dist/protected.luau --profile balanced --seed 1337
```

## Compatibility policy

The tool targets Roblox Luau and deliberately falls back instead of rewriting code it cannot prove safe. The repository's real `fixed_vlib.lua` UI library is used as a regression input. This prototype does **not** claim production-grade VM, string, or control-flow protection yet.

The `strong` and `maximum` profiles fail closed until their transforms are implemented and pass differential and deobfuscation audits; the CLI will not silently downgrade those profiles. VM lowering and control-flow flattening remain disabled until the corpus covers UI patterns, signals, module graphs, metatables, and scheduling behavior.
