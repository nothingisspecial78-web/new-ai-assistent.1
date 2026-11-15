import { ALL_GUIDES, GuideDefSchema } from '../packages/core/src/index.ts';

console.log('--- SEEDING & VALIDATING GUIDE TEST FIXTURES ---');

let passed = 0;
let failed = 0;

ALL_GUIDES.forEach((guide) => {
  const result = GuideDefSchema.safeParse(guide);
  if (!result.success) {
    console.error(`FAIL: Guide ${guide.guideId} failed schema validation:`, result.error.format());
    failed++;
  } else {
    passed++;
  }
});

console.log(`Validated ${passed} guide definitions with ${failed} failures.`);

const rolesFound = new Set(ALL_GUIDES.flatMap((g) => (Array.isArray(g.roles) ? g.roles : [g.roles])));
console.log('Roles covered:', Array.from(rolesFound).join(', '));

const hasSensitive = ALL_GUIDES.some((g) => g.steps.some((s) => s.sensitive));
console.log('Has privacy sensitive steps configured:', hasSensitive);

if (failed === 0) {
  console.log('Guide test fixtures ready.');
  process.exit(0);
} else {
  console.error('Guide validation failed.');
  process.exit(1);
}
