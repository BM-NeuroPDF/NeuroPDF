import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, 'frontend');

function toFrontendRelative(files) {
  return files.map((f) => path.relative(frontendDir, path.resolve(__dirname, f)));
}

function shellQuote(p) {
  if (!/[\s'"\\$`]/.test(p)) return p;
  return `'${p.replace(/'/g, `'\\''`)}'\``;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default {
  'frontend/**/*.{js,jsx,ts,tsx}': (filenames) => {
    if (filenames.length === 0) return [];
    const rel = toFrontendRelative(filenames);
    const prettierArgs = filenames.map((f) => shellQuote(path.resolve(__dirname, f))).join(' ');
    
    // ESLint'i 50'şer dosyalık chunk'lara böl
    const eslintRel = rel.filter(f => !f.includes("vitest.config") && !f.includes("next.config") && !f.includes("playwright.config"));
    const chunks = chunkArray(eslintRel, 50);
    const eslintCmds = chunks.map((chunk) => {
      const args = chunk.map(shellQuote).join(' ');
      return `sh -c 'cd ${shellQuote(frontendDir)} && npx eslint --fix --max-warnings=0 ${args}'`;
    });
    
    return [...eslintCmds, `npx prettier --write ${prettierArgs}`];
  },
  'frontend/**/*.{css,json,md}': (filenames) => {
    if (filenames.length === 0) return [];
    const args = filenames.map((f) => shellQuote(path.resolve(__dirname, f))).join(' ');
    return [`npx prettier --write ${args}`];
  },
  'backend/**/*.py': (filenames) => {
    if (filenames.length === 0) return [];
    const args = filenames.map((f) => shellQuote(path.resolve(__dirname, f))).join(' ');
    return [`python -m ruff check --fix ${args}`, `python -m ruff format ${args}`];
  },
  'aiService/**/*.py': (filenames) => {
    if (filenames.length === 0) return [];
    const args = filenames.map((f) => shellQuote(path.resolve(__dirname, f))).join(' ');
    return [`python -m ruff check --fix ${args}`, `python -m ruff format ${args}`];
  },
};
