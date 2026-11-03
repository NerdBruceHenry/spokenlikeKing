import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, compare, bestCompare, pairCheck, fluency, numberToWords } from '../js/score.js';

test('normalize expands contractions, reductions and numbers', () => {
  assert.deepEqual(normalize("I'm gonna eat 2 tacos!"), ['i', 'am', 'going', 'to', 'eat', 'two', 'tacos']);
  assert.deepEqual(normalize("Don't worry, it's OK."), ['do', 'not', 'worry', "it's", 'okay']);
  assert.deepEqual(normalize('It costs $15'), ['it', 'costs', 'fifteen', 'dollars']);
  assert.equal(numberToWords(1999), 'one thousand nine hundred ninety nine');
});

test('compare perfect and partial', () => {
  assert.equal(compare('Can I have a glass of water?', 'can I have a glass of water').score, 1);
  const r = compare('Can I have a glass of water?', 'can I have a grass of water');
  assert.ok(r.score > 0.8 && r.score < 1);
  assert.equal(r.words.find((w) => w.w === 'glass').status, 'close');
  const r2 = compare('I want to go to the park', 'I go park');
  assert.equal(r2.words.filter((w) => w.status === 'ok').length, 3);
});

test('reduced and full forms are equivalent', () => {
  assert.equal(compare("I'm gonna go", 'I am going to go').score, 1);
  assert.equal(compare('What do you wanna do?', 'what do you want to do').score, 1);
});

test('bestCompare picks the best alternative', () => {
  const r = bestCompare('think', ['sink', 'think', 'thing']);
  assert.equal(r.score, 1);
  assert.equal(r.heard, 'think');
});

test('pairCheck', () => {
  assert.equal(pairCheck('ship', 'sheep', ['ship']), 'ok');
  assert.equal(pairCheck('ship', 'sheep', ['sheep', 'ship']), 'other');
  assert.equal(pairCheck('ship', 'sheep', ['shop']), 'unclear');
});

test('fluency counts words and fillers', () => {
  const f = fluency('um I like pizza because um it is like really good', 30);
  assert.equal(f.words, 11);
  assert.equal(f.fillers, 4);
  assert.equal(f.wpm, 22);
});
