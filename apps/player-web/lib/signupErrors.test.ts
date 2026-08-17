import { describe, expect, test } from 'bun:test';
import { AuthRefusal } from './api';
import {
  NETWORK_FAILURE,
  TECHNICAL_FAILURE,
  signupErrorMessage,
} from './signupErrors';

/** Exactly what the backend tags a refusal with, and what it returns as text. */
function refusal(status: number, code: string | null, serverMessage: string | null) {
  return new AuthRefusal(status, code, serverMessage);
}

describe('signupErrorMessage — a player is told what to change', () => {
  test('a taken address names the address and offers the way out', () => {
    const msg = signupErrorMessage(refusal(409, 'email_taken', 'Email already registered'));
    expect(msg).toContain('адрес');
    expect(msg).not.toContain('Email already registered');
  });

  test('an undelivered code says the letter did not go, not «ошибка»', () => {
    const msg = signupErrorMessage(
      refusal(502, 'undeliverable', 'Could not deliver a code to this address'),
    );
    expect(msg).toContain('код');
    expect(msg).not.toContain('Could not');
  });

  test('a wrong or expired code says so and points at asking again', () => {
    expect(signupErrorMessage(refusal(401, 'invalid_code', 'Invalid or expired code'))).toContain(
      'Код',
    );
  });

  test('a taken nickname keeps the server wording, which names the rule broken', () => {
    expect(
      signupErrorMessage(refusal(409, 'nickname_taken', 'Этот никнейм уже занят')),
    ).toBe('Этот никнейм уже занят');
    expect(
      signupErrorMessage(refusal(400, 'bad_nickname', 'Никнейм должен быть от 3 до 20 символов')),
    ).toBe('Никнейм должен быть от 3 до 20 символов');
  });

  test('every user-facing refusal answers in Russian', () => {
    const codes = [
      'email_taken',
      'weak_password',
      'undeliverable',
      'rate_limited',
      'invalid_code',
      'consent_required',
    ];
    for (const code of codes) {
      const msg = signupErrorMessage(refusal(400, code, 'something in English'));
      expect(msg).toMatch(/[а-яА-ЯёЁ]/);
      expect(msg).not.toBe(TECHNICAL_FAILURE);
    }
  });
});

describe('signupErrorMessage — technical failures stay ours', () => {
  test('an untagged 500 never shows the server text', () => {
    expect(signupErrorMessage(refusal(500, null, 'Registration failed'))).toBe(TECHNICAL_FAILURE);
  });

  test('an unknown code — an older or newer server — falls back too', () => {
    expect(signupErrorMessage(refusal(400, 'something_new', 'Invalid body'))).toBe(
      TECHNICAL_FAILURE,
    );
  });

  test('a bad content type or malformed body says nothing about either', () => {
    expect(signupErrorMessage(refusal(415, null, 'Content-Type must be application/json'))).toBe(
      TECHNICAL_FAILURE,
    );
    expect(signupErrorMessage(refusal(400, null, 'Invalid JSON'))).toBe(TECHNICAL_FAILURE);
  });

  test('a throw that is not a refusal at all reads as no connection', () => {
    expect(signupErrorMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_FAILURE);
    expect(signupErrorMessage(undefined)).toBe(NETWORK_FAILURE);
  });
});
