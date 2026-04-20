import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml'
]);
const SKIP_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules', 'playwright-report', 'test-results']);
const RISKY_LOCAL_FILES = ['.env', '.env.local', '.env.production', 'swipe-to-clean.db', 'swipe-to-clean.db-shm', 'swipe-to-clean.db-wal'];
const CONTENT_PATTERNS = [
  {
    label: 'absolute local filesystem path',
    regex: /\/Users\/|\/home\/|C:\\Users\\/g
  },
  {
    label: 'private key material',
    regex: /BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY/g
  }
];

const problems = [];

for (const relativePath of RISKY_LOCAL_FILES) {
  if (existsSync(path.join(ROOT, relativePath))) {
    problems.push(`${relativePath}: local-only runtime or secret file is present in the repo root`);
  }
}

walk(ROOT);

if (problems.length > 0) {
  console.error('Publish audit failed:\n');
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log('Publish audit passed.');

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(ROOT, absolutePath);

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }

      walk(absolutePath);
      continue;
    }

    if (!shouldScan(relativePath)) {
      continue;
    }

    const content = readText(absolutePath);
    if (content === null) {
      continue;
    }

    for (const pattern of CONTENT_PATTERNS) {
      if (pattern.regex.test(content)) {
        problems.push(`${relativePath}: contains ${pattern.label}`);
        pattern.regex.lastIndex = 0;
      }
    }
  }
}

function shouldScan(relativePath) {
  const extension = path.extname(relativePath);
  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  const basename = path.basename(relativePath);
  return basename === 'Dockerfile' || basename === 'Caddyfile' || basename === '.gitignore' || basename === '.dockerignore';
}

function readText(filePath) {
  const stats = statSync(filePath);
  if (stats.size > 512 * 1024) {
    return null;
  }

  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}
