import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postcss from 'postcss';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(projectRoot, 'src');
const focusOwner = 'src/app/form-focus.css';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  }));
  return children.flat();
}

const isTextControl = (selector) => /\b(?:input|textarea|select)\b|\.(?:lune-input|library-search)\b/.test(selector);
const isSlider = (selector) => {
  // Exempt only positively identified sliders, never a mixed or negated target.
  if (/:(?:is|where|has|not)\(/.test(selector)) return false;
  return /^\.(?:transport-volume-slider|transport-progress|m-progress)\s+input:focus(?:-visible)?$/.test(selector.trim())
    || /(?:^|[\s>+~])input\[type\s*=\s*["']?range["']?\]:focus(?:-visible)?$/.test(selector.trim());
};
const isReset = (value) => /^(?:none|0(?:px)?)$/i.test(value.trim());

export function inspectStylesheet(source, relative) {
  const issues = [];
  const root = postcss.parse(source, { from: relative });
  root.walkRules((rule) => {
    for (const selector of postcss.list.comma(rule.selector)) {
      const positiveStates = selector.replace(/:not\(\s*:focus(?:-visible|-within)?\s*\)/g, '');
      if (!/:focus(?:-visible|-within)?\b/.test(positiveStates) || !isTextControl(selector) || isSlider(selector)) continue;
      rule.walkDecls((declaration) => {
        const property = declaration.prop.toLowerCase();
        const drawsBoundary = /^border(?:-(?:color|width|style|block.*|inline.*|top.*|right.*|bottom.*|left.*))?$/.test(property)
          || /^(?:outline(?:-color|-width|-style)?|box-shadow)$/.test(property);
        const forbidden = relative === focusOwner ? /^(?:outline(?:-color|-width|-style)?|box-shadow)$/.test(property) : drawsBoundary;
        if (forbidden && !isReset(declaration.value)) {
          issues.push(`${relative}:${declaration.source.start.line}: ${selector} adds ${property}; move text-field focus boundaries to ${focusOwner}.`);
        }
      });
    }
  });
  return issues;
}

async function main() {
  const findings = [];
  let stylesheets = 0;
  for (const file of await filesIn(sourceRoot)) {
    if (!/\.(?:css|[jt]sx)$/.test(file)) continue;
    const relative = path.relative(projectRoot, file).split(path.sep).join('/');
    const source = await readFile(file, 'utf8');
    if (file.endsWith('.css')) {
      stylesheets++;
      findings.push(...inspectStylesheet(source, relative));
    } else {
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node) => {
        if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
          && ['input', 'textarea', 'select'].includes(node.tagName.getText(tree))) {
          const classes = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'className');
          const values = classes?.initializer?.getText(tree) ?? '';
          if (/focus(?:-visible|-within)?:(?:ring(?!-0\b|-(?:offset|inset))|shadow(?!-none\b)|outline(?!-(?:none|0)\b))/.test(values)
            && !/\btype\s*=\s*["']range["']/.test(node.getText(tree))) {
            const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
            findings.push(`${relative}:${line}: focus decoration utility bypasses ${focusOwner}.`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
  }

  const entry = await readFile(path.join(sourceRoot, 'main.tsx'), 'utf8');
  const imports = [...entry.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].map((match) => match[1]);
  if (imports.at(-1) !== './app/form-focus.css') {
    findings.push('src/main.tsx: import form-focus.css after all theme styles so they cannot override the single focus boundary.');
  }

  if (findings.length) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Input focus checks passed (${stylesheets} stylesheets; single boundary, theme order, no per-page rings).`);
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
