const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const entrypoint = fs.readFileSync(path.resolve(__dirname, '../docker-entrypoint.sh'), 'utf8');
const helper = entrypoint.match(/apply_pickup_request_trigger\(\) \{[\s\S]*?\n\}/)[0];
const migration = path.resolve(__dirname, '../migrations/20261021_pickup_request_trigger.sql');
const definition = fs.readFileSync(migration, 'utf8').match(/^BEGIN\n[\s\S]*?^END\$\$/m)[0].replace(/\$\$$/, '');

function startup(installed, fail = false) {
  return spawnSync('bash', [], {
    encoding: 'utf8',
    env: { ...process.env, INSTALLED_TRIGGER: installed, MIGRATION_FILE: migration, FAIL_APPLY: fail ? '1' : '0' },
    input: `set -e
mysql() {
  [[ "$*" == *--default-character-set=utf8mb4* ]] || return 2
  if [[ "$*" == *information_schema.TRIGGERS* ]]; then
    printf '%s\\n' "$INSTALLED_TRIGGER"
  else
    cat >/dev/null
    echo __APPLIED__
    if [ "$FAIL_APPLY" = 1 ]; then return 1; fi
  fi
}
${helper}
apply_pickup_request_trigger "$MIGRATION_FILE"
`,
  });
}

test('startup skips trigger creation when the installed definition matches the migration', () => {
  const result = startup(definition);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes('__APPLIED__'));
});

test('missing or outdated triggers still run the actual migration', () => {
  for (const installed of ['', 'BEGIN SELECT 1; END']) {
    const result = startup(installed);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('__APPLIED__'));
  }
});

test('startup fails visibly if a required trigger migration cannot be applied', () => {
  assert.notEqual(startup('', true).status, 0);
});
