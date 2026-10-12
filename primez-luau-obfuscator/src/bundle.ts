import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { classifyCompatibility, extractDirectives, parseLuau, renderLuau } from './frontend.js';
import { applySafeTransforms } from './transforms.js';
import { scanForSecrets } from './secrets.js';
import type { CompatibilityReport, TransformProfile } from './types.js';

export interface BundleManifest {
  entry: string;
  modules: string;
  target?: 'roblox-luau';
  profile?: TransformProfile;
  seed?: number;
  preserveExports?: boolean;
  exclude?: string[];
}

export interface BundleModuleReport {
  source: string;
  output: string;
  compatibility: CompatibilityReport;
  staticRequires: string[];
  unresolvedRequires: string[];
  excluded: boolean;
}

export interface BundleReport {
  entry: string;
  outputDir: string;
  modules: BundleModuleReport[];
  unresolvedModules: string[];
}

function normalizeModulePath(path: string): string {
  return path.split(sep).join('/');
}

function sourceCandidates(root: string, specifier: string): string[] {
  const clean = specifier.replace(/^\.\//, '');
  const absolute = resolve(root, clean);
  const extension = extname(absolute);
  if (extension) return [absolute];
  return [absolute, `${absolute}.luau`, `${absolute}.lua`, join(absolute, 'init.luau'), join(absolute, 'init.lua')];
}

function staticRequires(source: string): { resolved: string[]; unresolved: string[] } {
  const resolved: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  const requireCall = /\brequire\s*\(\s*([\s\S]*?)\s*\)/g;
  for (const match of source.matchAll(requireCall)) {
    const argument = match[1]?.trim() ?? '';
    const literal = argument.match(/^(?:['"])([^'"]+)(?:['"])$/)?.[1];
    if (literal && !seen.has(literal)) {
      seen.add(literal);
      resolved.push(literal);
    } else if (!literal && argument && !seen.has(argument)) {
      seen.add(argument);
      unresolved.push(argument);
    }
  }
  return { resolved, unresolved };
}

async function firstExisting(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      const file = await readFile(candidate, 'utf8');
      void file;
      return candidate;
    } catch {
      // Continue through supported Luau module extensions.
    }
  }
  return undefined;
}

function isExcluded(relativePath: string, excluded: string[]): boolean {
  const normalized = normalizeModulePath(relativePath);
  return excluded.some((pattern) => normalized === normalizeModulePath(pattern));
}

export async function buildBundle(manifest: BundleManifest, manifestPath: string, outputDir: string): Promise<BundleReport> {
  if (manifest.target && manifest.target !== 'roblox-luau') throw new Error(`unsupported bundle target: ${manifest.target}`);
  if (!manifest.entry || !manifest.modules) throw new Error('bundle manifest requires entry and modules');
  const projectRoot = resolve(dirname(manifestPath));
  const modulesRoot = resolve(projectRoot, manifest.modules);
  const entryPath = (await firstExisting(sourceCandidates(modulesRoot, manifest.entry))) ?? resolve(modulesRoot, manifest.entry);
  const profile = manifest.profile ?? 'balanced';
  const seed = manifest.seed ?? 1337;
  if (!Number.isSafeInteger(seed)) throw new Error('bundle seed must be a safe integer');
  const excluded = manifest.exclude ?? [];
  const outputRoot = resolve(outputDir);
  const pending = [entryPath];
  const visited = new Set<string>();
  const reports: BundleModuleReport[] = [];
  const unresolvedModules = new Set<string>();

  while (pending.length) {
    const sourcePath = pending.shift() as string;
    const normalizedSource = resolve(sourcePath);
    if (visited.has(normalizedSource)) continue;
    visited.add(normalizedSource);
    const relativePath = normalizeModulePath(relative(modulesRoot, normalizedSource));
    const outputPath = join(outputRoot, relativePath);
    const excludedModule = isExcluded(relativePath, excluded);
    let source: string;
    try {
      source = await readFile(normalizedSource, 'utf8');
    } catch {
      unresolvedModules.add(relativePath);
      continue;
    }
    const parsed = parseLuau(source);
    const requirements = staticRequires(source);
    for (const specifier of requirements.unresolved) unresolvedModules.add(`${relativePath}: ${specifier}`);
    for (const specifier of requirements.resolved) {
      const child = await firstExisting(sourceCandidates(dirname(normalizedSource), specifier));
      if (child) pending.push(child);
      else unresolvedModules.add(`${relativePath}: ${specifier}`);
    }
    const compatibility = classifyCompatibility(source, parsed);
    if (excludedModule) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, source, 'utf8');
    } else {
      const secrets = scanForSecrets(source);
      if (secrets.length && profile === 'maximum') {
        throw new Error(`bundle module ${relativePath} contains credential-like material; remove it or exclude the module`);
      }
      const result = applySafeTransforms(parsed, seed, profile);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, renderLuau(result.program, extractDirectives(source), result.prelude), 'utf8');
    }
    reports.push({
      source: relativePath,
      output: normalizeModulePath(relative(outputRoot, outputPath)),
      compatibility,
      staticRequires: requirements.resolved,
      unresolvedRequires: requirements.unresolved,
      excluded: excludedModule,
    });
  }

  const report: BundleReport = {
    entry: normalizeModulePath(relative(modulesRoot, entryPath)),
    outputDir: outputRoot,
    modules: reports,
    unresolvedModules: [...unresolvedModules].sort(),
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, 'compatibility-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}
