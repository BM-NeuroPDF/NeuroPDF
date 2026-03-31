import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, 'frontend');

/**
 * Paths relative to `frontend/` for ESLint (cwd = frontend).
 * @param {string[]} files - staged paths from repo root, e.g. frontend/src/app/page.tsx
 */
function toFrontendRelative(files) {
  return files.map((f) => path.relative(frontendDir, path.resolve(__dirname, f)));
}

/** Minimal shell quoting for paths with spaces/special chars */
function shellQuote(p) {
  if (!/[\s'"\\$`]/.test(p)) return p;
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

export default {
  'frontend/**/*.{js,jsx,ts,tsx}': (filenames) => {
    if (filenames.length === 0) return [];
    const rel = toFrontendRelative(filenames);
    const eslintArgs = rel.map(shellQuote).join(' ');
    const prettierArgs = filenames.map((f) => shellQuote(path.resolve(__dirname, f))).join(' ');
    return [
      `sh -c 'cd ${shellQuote(frontendDir)} && npx eslint --fix ${eslintArgs}'`,
      `npx prettier --write ${prettierArgs}`,
    ];
  },
  'frontend/**/*.{css,json}': (filenames) => {
    if (filenames.length === 0) return [];
    const args = filenames.map((f) => shellQuote(path.resolve(__dirname, f))).join(' ');
    return [`npx prettier --write ${args}`];
  },
  'backend/**/*.py': (filenames) => {
    if (filenames.length === 0) return [];
    const args = filenames.map((f) => shellQuote(path.resolve(__dirname, f))).join(' ');
    return [`npx ruff check --fix ${args}`, `npx ruff format ${args}`];
  },
  'aiService/**/*.py': (filenames) => {
    if (filenames.length === 0) return [];
    const args = filenames.map((f) => shellQuote(path.resolve(__dirname, f))).join(' ');
    return [`npx ruff check --fix ${args}`, `npx ruff format ${args}`];
  },
};
