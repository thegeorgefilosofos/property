import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext, HOME } from './redirect';

test('δεκτή μόνο σχετική διαδρομή', () => {
  assert.equal(safeNext('/tameio?plan=owner&cycle=annual'), '/tameio?plan=owner&cycle=annual');
  assert.equal(safeNext('/dashboard'), '/dashboard');
  assert.equal(safeNext('/'), '/');
});

test('η διεύθυνση άλλου τόπου γυρίζει στο σπίτι', () => {
  assert.equal(safeNext('https://kako.gr'), HOME);
  assert.equal(safeNext('http://kako.gr'), HOME);
  // Χωρίς πρωτόκολλο: ο περιηγητής βάζει το δικό μας και φεύγει.
  assert.equal(safeNext('//kako.gr'), HOME);
  // Η ανάποδη κάθετος κανονικοποιείται σε δεύτερη κάθετο.
  assert.equal(safeNext('/\\kako.gr'), HOME);
  assert.equal(safeNext('javascript:alert(1)'), HOME);
  assert.equal(safeNext('tameio'), HOME);
});

test('κενό, κενό κείμενο και τίποτα', () => {
  assert.equal(safeNext(null), HOME);
  assert.equal(safeNext(undefined), HOME);
  assert.equal(safeNext(''), HOME);
  assert.equal(safeNext('   '), HOME);
});

test('χαρακτήρας ελέγχου δεν μπαίνει σε κεφαλίδα', () => {
  assert.equal(safeNext('/dashboard\nLocation: https://kako.gr'), HOME);
  assert.equal(safeNext('/dashboard\r\nSet-Cookie: a=b'), HOME);
});

test('η εναλλακτική δίνεται από τον καλούντα', () => {
  assert.equal(safeNext('https://kako.gr', '/login'), '/login');
});
