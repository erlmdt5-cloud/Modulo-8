// ─────────────────────────────────────────────
// RUNNER MINIMALISTA PARA NODE.JS
// ─────────────────────────────────────────────
const COLORS = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

const results = { passed: 0, failed: 0, suites: [] };
let currentSuite = null;

function describe(name, fn) {
  currentSuite = { name, tests: [] };
  results.suites.push(currentSuite);
  fn();
  currentSuite = null;
}

function it(name, fn) {
  try {
    fn();
    currentSuite.tests.push({ name, ok: true });
    results.passed++;
  } catch (e) {
    currentSuite.tests.push({ name, ok: false, error: e.message });
    results.failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion falló');
}

function assertEqual(a, b) {
  if (a !== b) throw new Error(`Esperado: ${JSON.stringify(b)} | Obtenido: ${JSON.stringify(a)}`);
}

function assertThrows(fn, expectedMsg) {
  let threw = false;
  try { fn(); } catch (e) {
    threw = true;
    if (expectedMsg && !e.message.includes(expectedMsg)) {
      throw new Error(`Error esperado: "${expectedMsg}" | Error real: "${e.message}"`);
    }
  }
  if (!threw) throw new Error('Se esperaba que lanzara un error, pero no lo hizo');
}

function printReport() {
  console.log('\n' + c('bold', c('cyan', '═══════════════════════════════════════════')));
  console.log(c('bold', c('cyan', '  🧪  PRUEBAS UNITARIAS — INVENTARIO        ')));
  console.log(c('bold', c('cyan', '═══════════════════════════════════════════')) + '\n');

  for (const suite of results.suites) {
    const allPass = suite.tests.every(t => t.ok);
    const icon = allPass ? c('green', '●') : c('red', '●');
    console.log(`  ${icon}  ${c('bold', suite.name)}`);

    for (const t of suite.tests) {
      if (t.ok) {
        console.log(`       ${c('green', '✓')} ${c('dim', t.name)}`);
      } else {
        console.log(`       ${c('red', '✗')} ${t.name}`);
        console.log(`         ${c('yellow', '→')} ${c('gray', t.error)}`);
      }
    }
    console.log('');
  }

  const total = results.passed + results.failed;
  const bar = buildBar(results.passed, total);

  console.log(c('bold', c('cyan', '───────────────────────────────────────────')));
  console.log(`  ${bar}`);
  console.log(
    `  ${c('bold', `Total: ${total}`)}   ` +
    `${c('green', `✓ ${results.passed} pasaron`)}   ` +
    (results.failed > 0 ? c('red', `✗ ${results.failed} fallaron`) : c('green', '✗ 0 fallaron'))
  );
  console.log(c('bold', c('cyan', '═══════════════════════════════════════════')) + '\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

function buildBar(passed, total) {
  const width = 30;
  const filled = Math.round((passed / total) * width);
  const bar = c('green', '█'.repeat(filled)) + c('gray', '░'.repeat(width - filled));
  const pct = Math.round((passed / total) * 100);
  return `[${bar}] ${pct}%`;
}

module.exports = { describe, it, assert, assertEqual, assertThrows, printReport };
