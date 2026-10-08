import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('offline setup generates distinct 256-bit hex secrets without network calls', async () => {
  const html = await readFile(new URL('../setup-tools/generate-secret.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../setup-tools/generate-secret.js', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {url: 'file:///setup-tools/generate-secret.html', runScripts: 'outside-only'});
  try {
    dom.window.fetch = () => {throw new Error('No network calls permitted.');};
    dom.window.eval(script);
    const field = dom.window.document.getElementById('secret');
    dom.window.document.getElementById('generate').click(); const first = field.value;
    assert.match(first, /^[a-f0-9]{64}$/); assert.equal(field.selectionEnd, 64);
    dom.window.document.getElementById('generate').click();
    assert.match(field.value, /^[a-f0-9]{64}$/); assert.notEqual(field.value, first);
  } finally {dom.window.close();}
});
