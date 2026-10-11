import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { classifyCompatibility, extractDirectives, parseLuau, renderLuau } from './frontend.js';
import { applySafeTransforms } from './transforms.js';
const cli = new Command();
cli.name('primez-obfuscate').description('Luau-first, compatibility-aware source protection prototype').version('0.1.0');
async function load(path) {
    const source = await readFile(path, 'utf8');
    const program = parseLuau(source);
    return { source, program, directives: extractDirectives(source) };
}
function printReport(report) {
    console.log(`compatibility: ${report.status}`);
    for (const finding of report.findings) {
        console.log(`- ${finding.status}: ${finding.feature}${finding.line ? ` (line ${finding.line})` : ''} — ${finding.message}`);
    }
    console.log(`supported: ${report.supportedTransforms.join(', ')}`);
    console.log(`skipped: ${report.skippedTransforms.join(', ')}`);
}
cli.command('inspect <input>')
    .description('Parse a Luau file and emit a compatibility report')
    .action(async (input) => {
    const { source, program } = await load(input);
    printReport(classifyCompatibility(source, program));
});
cli.command('build <input> <output>')
    .description('Build a safe first-pass protected Luau artifact')
    .option('--profile <profile>', 'safe, balanced, strong, or maximum', 'balanced')
    .option('--seed <seed>', 'deterministic numeric seed', '1337')
    .action(async (input, output, options) => {
    if (options.profile === 'strong' || options.profile === 'maximum') {
        throw new Error(`${options.profile} profile is not enabled yet; refusing to silently produce a weaker artifact`);
    }
    const { source, program, directives } = await load(input);
    const report = classifyCompatibility(source, program);
    const seed = Number.parseInt(options.seed, 10);
    if (!Number.isSafeInteger(seed))
        throw new Error('seed must be a safe integer');
    const result = applySafeTransforms(program, seed, options.profile);
    await writeFile(output, renderLuau(result.program, directives, result.prelude), 'utf8');
    console.log(`built ${output}`);
    console.log(`profile: ${options.profile}; renamed bindings: ${result.renamed}; encoded strings: ${result.encodedStrings}`);
    printReport({ ...report, skippedTransforms: result.skipped });
});
cli.parseAsync().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
