#!/usr/bin/env node
/**
 * tests/e2e_runner.js
 * Test Runner Integral E2E para "Lista de Compra | PRO".
 * Ejecuta Tiers 1-4 de forma automatizada, determinística y sin dependencias externas.
 * 
 * Uso:
 *   node tests/e2e_runner.js
 *   node tests/e2e_runner.js --tier=1
 *   node tests/e2e_runner.js --tier=2
 *   node tests/e2e_runner.js --tier=3
 *   node tests/e2e_runner.js --tier=4
 *   node tests/e2e_runner.js --filter="F01"
 *   node tests/e2e_runner.js --bail
 *   node tests/e2e_runner.js --json
 */

const fs = require('node:fs');
const path = require('node:path');

// Colores ANSI para terminal
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m'
};

// Assertion Library
const assert = {
  strictEqual(actual, expected, msg) {
    if (actual !== expected) {
      const err = new Error(msg || `Expected ${JSON.stringify(actual)} to strictly equal ${JSON.stringify(expected)}`);
      err.actual = actual;
      err.expected = expected;
      throw err;
    }
  },

  notStrictEqual(actual, expected, msg) {
    if (actual === expected) {
      const err = new Error(msg || `Expected ${JSON.stringify(actual)} not to equal ${JSON.stringify(expected)}`);
      throw err;
    }
  },

  deepStrictEqual(actual, expected, msg) {
    const actStr = JSON.stringify(actual);
    const expStr = JSON.stringify(expected);
    if (actStr !== expStr) {
      const err = new Error(msg || `Deep equality assertion failed.\nActual:   ${actStr}\nExpected: ${expStr}`);
      err.actual = actual;
      err.expected = expected;
      throw err;
    }
  },

  ok(value, msg) {
    if (!value) {
      const err = new Error(msg || `Expected value to be truthy, got ${JSON.stringify(value)}`);
      throw err;
    }
  },

  throws(fn, expectedRegexOrMessage, msg) {
    let threw = false;
    let caughtErr = null;
    try {
      fn();
    } catch (e) {
      threw = true;
      caughtErr = e;
    }
    if (!threw) {
      throw new Error(msg || 'Expected function to throw an error, but it did not throw.');
    }
    if (expectedRegexOrMessage) {
      const errMessage = caughtErr ? caughtErr.message : String(caughtErr);
      if (expectedRegexOrMessage instanceof RegExp) {
        if (!expectedRegexOrMessage.test(errMessage)) {
          throw new Error(msg || `Expected error message to match ${expectedRegexOrMessage}, got "${errMessage}"`);
        }
      } else if (typeof expectedRegexOrMessage === 'string') {
        if (!errMessage.includes(expectedRegexOrMessage)) {
          throw new Error(msg || `Expected error message to include "${expectedRegexOrMessage}", got "${errMessage}"`);
        }
      }
    }
  },

  doesNotThrow(fn, msg) {
    try {
      fn();
    } catch (e) {
      throw new Error((msg ? msg + ': ' : '') + `Expected function not to throw, but threw: ${e.message}`);
    }
  },

  match(str, regex, msg) {
    if (!regex.test(str)) {
      throw new Error(msg || `Expected "${str}" to match ${regex}`);
    }
  },

  closeTo(actual, expected, delta = 0.01, msg) {
    if (Math.abs(actual - expected) > delta) {
      throw new Error(msg || `Expected ${actual} to be close to ${expected} within delta ${delta} (diff: ${Math.abs(actual - expected)})`);
    }
  },

  includes(collection, item, msg) {
    let inc = false;
    if (typeof collection === 'string') {
      inc = collection.includes(item);
    } else if (Array.isArray(collection)) {
      inc = collection.includes(item);
    } else if (collection instanceof Set || collection instanceof Map) {
      inc = collection.has(item);
    }
    if (!inc) {
      throw new Error(msg || `Expected collection to include ${JSON.stringify(item)}`);
    }
  }
};

// Runner State
class TestRunner {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      tierStats: {
        1: { total: 0, passed: 0, failed: 0 },
        2: { total: 0, passed: 0, failed: 0 },
        3: { total: 0, passed: 0, failed: 0 },
        4: { total: 0, passed: 0, failed: 0 },
        other: { total: 0, passed: 0, failed: 0 }
      }
    };
    this.options = this.parseArgs();
  }

  parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
      tier: null,
      filter: null,
      bail: false,
      json: false
    };

    for (const arg of args) {
      if (arg.startsWith('--tier=')) {
        opts.tier = parseInt(arg.split('=')[1], 10);
      } else if (arg.startsWith('--filter=')) {
        opts.filter = arg.split('=')[1].toLowerCase();
      } else if (arg === '--bail') {
        opts.bail = true;
      } else if (arg === '--json') {
        opts.json = true;
      }
    }
    return opts;
  }

  describe(name, fn, meta = {}) {
    const suite = {
      name,
      tier: meta.tier || this.detectTierFromName(name),
      tests: [],
      beforeEachHooks: [],
      afterEachHooks: []
    };

    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    this.suites.push(suite);

    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  detectTierFromName(name) {
    if (name.includes('Tier 1') || name.startsWith('T1')) return 1;
    if (name.includes('Tier 2') || name.startsWith('T2')) return 2;
    if (name.includes('Tier 3') || name.startsWith('T3')) return 3;
    if (name.includes('Tier 4') || name.startsWith('T4')) return 4;
    return 'other';
  }

  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEachHooks.push(fn);
    }
  }

  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEachHooks.push(fn);
    }
  }

  test(name, fn) {
    if (!this.currentSuite) {
      this.describe('Default Suite', () => {
        this.test(name, fn);
      });
      return;
    }
    this.currentSuite.tests.push({ name, fn });
  }

  async run() {
    const startTime = Date.now();
    const results = [];

    if (!this.options.json) {
      console.log(`\n${c.bright}${c.cyan}======================================================================${c.reset}`);
      console.log(`${c.bright}${c.cyan}       🚀 LISTA DE COMPRA | PRO — E2E TEST RUNNER INTEGRAL             ${c.reset}`);
      console.log(`${c.bright}${c.cyan}======================================================================${c.reset}\n`);
      if (this.options.tier) console.log(`${c.yellow}Filtro activo por Tier: Tier ${this.options.tier}${c.reset}`);
      if (this.options.filter) console.log(`${c.yellow}Filtro activo por texto: "${this.options.filter}"${c.reset}`);
    }

    for (const suite of this.suites) {
      if (this.options.tier && suite.tier !== this.options.tier) {
        continue;
      }

      const suiteMatchingTests = suite.tests.filter(t => {
        if (!this.options.filter) return true;
        const full = `${suite.name} ${t.name}`.toLowerCase();
        return full.includes(this.options.filter);
      });

      if (suiteMatchingTests.length === 0) continue;

      if (!this.options.json) {
        console.log(`\n${c.bright}${c.blue}▶ Suite: ${suite.name}${c.reset} ${c.dim}(Tier ${suite.tier})${c.reset}`);
      }

      for (const t of suiteMatchingTests) {
        this.stats.total++;
        const tierKey = this.stats.tierStats[suite.tier] ? suite.tier : 'other';
        this.stats.tierStats[tierKey].total++;

        const testRecord = {
          suite: suite.name,
          tier: suite.tier,
          name: t.name,
          status: 'pending',
          error: null,
          durationMs: 0
        };

        const tStart = Date.now();

        try {
          // Ejecutar beforeEach hooks
          for (const hook of suite.beforeEachHooks) {
            await hook();
          }

          // Ejecutar prueba (soporta síncrono o retornos de Promesa)
          await t.fn({ assert });

          // Ejecutar afterEach hooks
          for (const hook of suite.afterEachHooks) {
            await hook();
          }

          testRecord.durationMs = Date.now() - tStart;
          testRecord.status = 'passed';
          this.stats.passed++;
          this.stats.tierStats[tierKey].passed++;

          if (!this.options.json) {
            console.log(`  ${c.green}✔${c.reset} ${t.name} ${c.dim}(${testRecord.durationMs}ms)${c.reset}`);
          }
        } catch (err) {
          testRecord.durationMs = Date.now() - tStart;
          testRecord.status = 'failed';
          testRecord.error = {
            message: err.message,
            stack: err.stack,
            actual: err.actual,
            expected: err.expected
          };
          this.stats.failed++;
          this.stats.tierStats[tierKey].failed++;

          if (!this.options.json) {
            console.log(`  ${c.red}✖ ${t.name}${c.reset} ${c.dim}(${testRecord.durationMs}ms)${c.reset}`);
            console.log(`    ${c.red}${err.message}${c.reset}`);
          }

          if (this.options.bail) {
            if (!this.options.json) console.log(`\n${c.red}[BAIL] Deteniendo ejecución debido a fallo en prueba.${c.reset}`);
            break;
          }
        }

        results.push(testRecord);
      }

      if (this.options.bail && this.stats.failed > 0) break;
    }

    this.stats.durationMs = Date.now() - startTime;

    if (this.options.json) {
      console.log(JSON.stringify({ stats: this.stats, results }, null, 2));
    } else {
      this.printSummary();
    }

    return this.stats.failed === 0 ? 0 : 1;
  }

  printSummary() {
    console.log(`\n${c.bright}${c.cyan}----------------------------------------------------------------------${c.reset}`);
    console.log(`${c.bright}RESUMEN DE EJECUCIÓN POR TIERS:${c.reset}`);
    console.log(`${c.cyan}----------------------------------------------------------------------${c.reset}`);

    const printTierRow = (label, tierObj) => {
      const color = tierObj.failed > 0 ? c.red : (tierObj.passed > 0 ? c.green : c.dim);
      const icon = tierObj.failed > 0 ? '✖' : (tierObj.total > 0 ? '✔' : '○');
      console.log(`  ${color}${icon} ${label.padEnd(35)}: ${tierObj.passed} pasados, ${tierObj.failed} fallados, ${tierObj.total} total${c.reset}`);
    };

    printTierRow('Tier 1 (Cobertura F01-F20)', this.stats.tierStats[1]);
    printTierRow('Tier 2 (Límites y Casos Esquina)', this.stats.tierStats[2]);
    printTierRow('Tier 3 (Combinaciones Cruzadas)', this.stats.tierStats[3]);
    printTierRow('Tier 4 (Escenarios de Usuario)', this.stats.tierStats[4]);

    console.log(`${c.cyan}----------------------------------------------------------------------${c.reset}`);
    const overallColor = this.stats.failed > 0 ? c.red : c.green;
    console.log(`${c.bright}${overallColor}TOTAL: ${this.stats.passed} / ${this.stats.total} pruebas superadas (${this.stats.failed} fallos) en ${this.stats.durationMs}ms${c.reset}`);
    console.log(`${c.bright}${c.cyan}======================================================================${c.reset}\n`);
  }
}

// Instancia global del runner y exports DSL
const runner = new TestRunner();

const describe = (name, fn, meta) => runner.describe(name, fn, meta);
const test = (name, fn) => runner.test(name, fn);
const it = test;
const beforeEach = (fn) => runner.beforeEach(fn);
const afterEach = (fn) => runner.afterEach(fn);

// Exportar DSL para uso en archivos de test
module.exports = {
  describe,
  test,
  it,
  beforeEach,
  afterEach,
  assert,
  runner
};

// Si se ejecuta directamente vía CLI: cargar suites y ejecutar
if (require.main === module) {
  const testDir = __dirname;
  const testFiles = [
    'tier1_features.test.js',
    'tier2_boundaries.test.js',
    'tier3_pairwise.test.js',
    'tier4_scenarios.test.js'
  ];

  for (const file of testFiles) {
    const fullPath = path.join(testDir, file);
    if (fs.existsSync(fullPath)) {
      try {
        require(fullPath);
      } catch (err) {
        console.error(`${c.red}Error cargando archivo de pruebas ${file}:${c.reset}`, err);
        process.exit(1);
      }
    }
  }

  runner.run().then(exitCode => {
    process.exit(exitCode);
  }).catch(err => {
    console.error('Error no controlado en Test Runner:', err);
    process.exit(1);
  });
}
