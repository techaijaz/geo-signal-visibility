// Run: node frontend/scripts/siteType.check.mjs (Node 22.18+ strips the TypeScript types)
import assert from 'node:assert';
import { pagesWord, sellsAfterTypeChange, sellsPayload } from '../src/utils/siteType.ts';

// Changing the type moves a switch that followed the old type's default to the new type's default
assert.equal(sellsAfterTypeChange('ecommerce', 'service', true), false);
assert.equal(sellsAfterTypeChange('service', 'ecommerce', false), true);
assert.equal(sellsAfterTypeChange('service', 'saas', false), false);
// A switch the owner set against the default stays as they set it
assert.equal(sellsAfterTypeChange('service', 'local_business', true), true);
assert.equal(sellsAfterTypeChange('ecommerce', 'service', false), false);

// Saving: the type's default goes as null, so a later type change still decides
assert.equal(sellsPayload('ecommerce', true), null);
assert.equal(sellsPayload('service', false), null);
assert.equal(sellsPayload('service', true), true);
assert.equal(sellsPayload('ecommerce', false), false);
// The Critical case: shop → service with the switch untouched saves null, not true
assert.equal(sellsPayload('service', sellsAfterTypeChange('ecommerce', 'service', true)), null);

// Copy that names the pages we read: product pages only for sites that sell products
assert.equal(pagesWord(true), 'product pages');
assert.equal(pagesWord(false), 'main pages');
assert.equal(pagesWord(undefined), 'product pages');

console.log('siteType checks: PASS');
