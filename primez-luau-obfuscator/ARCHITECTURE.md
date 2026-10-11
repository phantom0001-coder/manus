

# Roblox Luau Compatibility Addendum

## Revised primary target

The primary target is **Roblox Luau**, not generic Lua 5.4. The obfuscator must preserve Luau syntax, semantics, library behavior, and common UI-framework patterns before aggressive protection is enabled.

“Every Roblox script works” should be treated as a compatibility goal, not a promise made before testing. Some scripts depend on exploit-specific globals, executor APIs, undocumented engine behavior, native closures, or runtime-generated code. Those cases need explicit detection and a compatibility result rather than silent corruption.

The build target should therefore be:

```text
Luau source
  → Luau parser/AST
  → Luau-aware semantic analysis
  → compatibility classification
  → conservative transforms
  → optional VM lowering for supported regions
  → generated Luau artifact
  → Roblox/Luau differential tests
```

## Luau-specific frontend

Replace the generic Lua parser adapter with a Luau frontend that understands and preserves:

- type annotations and type declarations;
- compound assignment;
- generalized iteration and Luau loop behavior;
- string interpolation where supported by the selected Luau version;
- `continue`;
- `if` expressions and other Luau syntax extensions;
- `table.freeze`, `table.clone`, `buffer`, `task`, and other Luau/Roblox-facing APIs as ordinary calls;
- `--!strict`, `--!nonstrict`, and related file directives;
- comments and formatting directives needed by the source toolchain;
- multiple returns, varargs, closures, upvalues, metatables, coroutines, and protected calls.

The frontend should preserve type annotations in a development output mode and optionally strip them only when the target runtime does not require them.

## Compatibility tiers

### Tier 0 — source-preserving

- Parse and re-emit Luau without semantic transforms.
- Preserve directives, API calls, types, and module structure.
- Used as the baseline to prove parser/generator correctness.

### Tier 1 — production-safe obfuscation

- Scope-aware local/upvalue renaming.
- Safe string/constant encoding.
- Literal normalization.
- Conservative formatting/minification.
- No VM conversion of functions containing unsupported features.

This should be the default for UI libraries and large application scripts.

### Tier 2 — selective control-flow protection

- Flatten only verified basic-block regions.
- Keep event callbacks, metatable-heavy code, coroutine bodies, and dynamic-loading boundaries in safe mode unless tests pass.
- Allow per-function exclusions and generated compatibility reports.

### Tier 3 — selective VM protection

- Lower only a proven Luau subset into the VM.
- Use ordinary Luau calls for Roblox services and engine objects at the boundary.
- Keep the VM small and compatible instead of trying to emulate the entire Roblox runtime.

The VM should not attempt to replace Roblox’s object model, scheduler, signals, userdata, instances, services, or native engine behavior. It should protect script-owned computation while delegating engine interaction to a narrow generated boundary.

## UI library compatibility requirements

UI libraries often rely on patterns that aggressive source rewriting can break. The compatibility suite must include representative patterns such as:

- `require`-based module graphs;
- `ReplicatedStorage` and service lookups;
- `Instance.new`, parenting, attributes, and property assignment;
- `RBXScriptSignal:Connect`, `Once`, and callback closures;
- `UDim2`, `Color3`, `Vector2`, `Enum`, `CFrame`, and constructor-style APIs;
- table-driven component factories;
- metatable-based class systems;
- fluent APIs and method chaining;
- render/update loops using `RunService` and `task`;
- cleanup patterns and connection registries;
- TweenService and animation callbacks;
- theme/config tables with nested defaults;
- lazy module initialization and cyclic module dependencies;
- protected calls around optional services or features.

For these scripts, preserve call order, callback identity, table key behavior, colon-call semantics, and multiple-return behavior. Do not rename externally inspected fields or module exports unless the renaming pass can prove they are private.

## Dynamic and executor-specific compatibility

The analyzer should classify dynamic constructs before transforming them:

- `loadstring`, `load`, dynamic source generation, or runtime compilation;
- `getfenv`, `setfenv`, `debug`, or environment mutation;
- reflection through `rawget`, `rawset`, `getmetatable`, and `setmetatable`;
- `getgenv`, ` getrenv`, `getrenv`, `identifyexecutor`, or other nonstandard globals;
- `hookfunction`, `hookmetamethod`, `newcclosure`, `clonefunction`, or similar executor-specific APIs;
- filesystem, HTTP, clipboard, input, drawing, or process APIs supplied by an executor;
- code that inspects `debug.info`, function names, source paths, or bytecode details.

These should produce a clear compatibility classification:

```text
SUPPORTED          safe to transform under selected profile
SUPPORTED-SAFE     only Tier 1 transforms allowed
DYNAMIC            requires exclusion or runtime test
UNSUPPORTED        emitted unchanged or rejected by policy
```

The tool must never claim full Roblox compatibility merely because a script parses.

## Module and bundle handling

A single-file transformer is not enough for real Roblox UI projects. The standalone tool should support a bundle manifest:

```json
{
  "entry": "src/init.luau",
  "modules": "src",
  "target": "roblox-luau",
  "profile": "balanced",
  "preserveExports": true,
  "exclude": ["src/vendor/legacy-ui.luau"]
}
```

The module linker should:

1. discover the module graph without executing user code;
2. assign stable private identities to internal modules;
3. preserve public module exports and expected `require` behavior;
4. avoid flattening module boundaries unless explicitly enabled;
5. emit a compatibility report for dynamic or unresolved imports;
6. support either a protected bundle or per-module protected outputs.

## New required test matrix

The test suite must run at least these categories:

| Category | Examples |
|---|---|
| Luau syntax | types, `continue`, compound assignment, directives |
| Core semantics | closures, upvalues, varargs, multiple returns, errors |
| Roblox values | `Vector2`, `UDim2`, `Color3`, `Enum`, `CFrame` adapters |
| UI behavior | component creation, signals, themes, tweens, cleanup |
| Module graph | nested requires, cyclic modules, exported tables/functions |
| Scheduling | `task`, heartbeat/render callbacks, cancellation |
| Metaprogramming | metatables, `__index`, `__newindex`, `__call` |
| Dynamic behavior | reflection, environment access, optional loading |
| Performance | startup time, callback latency, memory, output size |
| Compatibility | untouched/excluded functions and mixed protected output |

The most valuable test is not just “does it run once?” but repeated event-driven behavior: create UI, update state, fire signals, destroy components, and verify that callbacks and resources behave identically.

## What “better than Luraph” can mean

Do not use that as an unmeasured claim. Define measurable targets:

- higher pass rate on the Luau/UI compatibility corpus;
- fewer unsupported constructs in the compatibility report;
- lower or equal startup overhead at the same protection level;
- smaller output for equivalent protection;
- deterministic builds with reproducible seeds;
- clearer per-function fallback behavior;
- stronger server-side release signing and leak attribution;
- reliable rollback and protected-build verification.

The first benchmark should compare PRIMEz profiles against a fixed corpus and report compatibility, runtime cost, output size, and transform coverage. It should not attempt to defeat or reverse-engineer another commercial product.

## Revised implementation priority

1. Luau parser/frontend and round-trip generator.
2. Roblox compatibility classifier.
3. Module graph and bundle manifest.
4. Tier 0/Tier 1 transformations.
5. UI-library regression corpus.
6. Selective CFG flattening with automatic fallback.
7. Selective VM lowering for script-owned pure computation.
8. Roblox-like host adapters and differential runner.
9. Hardening benchmarks and profiles.
10. PRIMEz Studio integration.
