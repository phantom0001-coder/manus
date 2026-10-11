export interface SecretFinding {
  kind: string;
  line: number;
}

const PATTERNS: Array<[string, RegExp]> = [
  ['private-key-material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ['openai-key', /\bsk-[A-Za-z0-9]{20,}\b/],
  ['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['credential-assignment', /\b(?:api[_-]?key|secret|auth[_-]?token|access[_-]?token|client[_-]?secret)\s*=\s*['"][^'"]{16,}['"]/i],
];

export function scanForSecrets(source: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [kind, pattern] of PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ kind, line: index + 1 });
        break;
      }
    }
  });
  return findings;
}
