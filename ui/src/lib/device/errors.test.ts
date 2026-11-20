import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, toAppError, rawText } from './errors.ts';
import { copy } from '../copy.ts';

test('raw exception text never becomes the message; it stays in detail for the log', () => {
  const e = toAppError(new TypeError("Cannot read properties of undefined (reading 'x')"));
  assert.equal(e.code, 'unknown');
  assert.equal(e.message, copy.errors.unexpected);
  assert.match(rawText(e), /Cannot read properties/);
  assert.equal(toAppError('boom').message, copy.errors.unexpected);
});

test('codec errors map to the script copy', () => {
  assert.equal(toAppError(new Error('The controller holds 5 macros at most. Free one up first.')).message, copy.script.tooMany);
  assert.equal(toAppError(new Error('At most 5 macros.')).code, 'too_many');
  assert.equal(toAppError(new Error('The macros are too long to fit on the controller.')).message, copy.script.tooLong);
});

test('AppErrors pass through; service text shows in the log only', () => {
  const e = new AppError('controller', copy.errors.controller, { error: 'hid write failed: -1' });
  assert.equal(toAppError(e), e);
  assert.equal(rawText(e), `${copy.errors.controller} (hid write failed: -1)`);
});
