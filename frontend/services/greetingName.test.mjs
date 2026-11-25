import assert from 'node:assert/strict';
import test from 'node:test';
import { greetingFirstName, helloGreeting, ownerGreetingName } from './greetingName.ts';

test('greetings use the first name only', () => {
  assert.equal(greetingFirstName('Jubeth Santos'), 'Jubeth');
  assert.equal(greetingFirstName('  Anna   Marie Cruz '), 'Anna');
  assert.equal(greetingFirstName('Mark'), 'Mark');
  assert.equal(helloGreeting('Jubeth'), 'Hello, Jubeth!');
});

test('an account without a name is not greeted by its e-mail address', () => {
  assert.equal(greetingFirstName(''), '');
  assert.equal(greetingFirstName(null), '');
  assert.equal(greetingFirstName('owner@example.com'), '');
  assert.equal(helloGreeting(''), 'Hello!');
});

test('the owner is Angelo unless the account has its own name', () => {
  assert.equal(ownerGreetingName(''), 'Angelo');
  assert.equal(ownerGreetingName('owner@example.com'), 'Angelo');
  assert.equal(ownerGreetingName('Angelo Reyes'), 'Angelo');
  assert.equal(ownerGreetingName('Isabel San Esteban'), 'Isabel');
});

test('an account saved with its username as the name is greeted by the name inside it', () => {
  assert.equal(greetingFirstName('bien_staff'), 'Bien');
  assert.equal(greetingFirstName('mark_staff'), 'Mark');
  assert.equal(greetingFirstName('anna.reyes_staff'), 'Anna');
  assert.equal(greetingFirstName('McKay_staff'), 'McKay');
  assert.equal(greetingFirstName('_staff'), '');
  assert.equal(helloGreeting(greetingFirstName('jubeth_staff')), 'Hello, Jubeth!');
});
