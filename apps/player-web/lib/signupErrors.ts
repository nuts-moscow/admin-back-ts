import { AuthRefusal } from './api';

/**
 * What a player is told when a signup does not go through.
 *
 * Two rules shape this whole file. A refusal the player can act on says
 * exactly what to change — a taken address, a taken nickname, an undelivered
 * code — because «Registration failed» sends them to the club's desk for
 * something they could have fixed themselves. And a refusal they cannot act
 * on says one neutral thing: a 500, a parse error or a shape we did not expect
 * is our problem, and repeating our internals at them helps nobody and tells
 * an attacker how the inside is built.
 *
 * The wording lives here rather than on the server so it can be changed
 * without touching a contract; the codes are the contract.
 */
const BY_CODE: Record<string, string> = {
  email_taken: 'Этот адрес уже зарегистрирован. Войдите или восстановите пароль',
  weak_password: 'Пароль — минимум 8 символов, обязательно буква и цифра',
  undeliverable: 'Не получилось отправить письмо с кодом на этот адрес. Проверьте его или укажите другой',
  rate_limited: 'Слишком много попыток. Попробуйте через 15 минут',
  invalid_code: 'Код неверный или истёк. Запросите новый',
  consent_required: 'Для регистрации необходимо согласиться с обоими документами',
};

/** The neutral line for everything that is not the player's to fix. */
export const TECHNICAL_FAILURE = 'Не удалось завершить регистрацию. Попробуйте ещё раз';

/** The neutral line when the request never reached us. */
export const NETWORK_FAILURE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз';

/**
 * Codes whose message the server phrases better than we can: it knows *which*
 * nickname rule was broken — empty, too short, too long, reserved, taken — and
 * says so in the player's language already.
 */
const SERVER_PHRASES_IT = new Set(['bad_nickname', 'nickname_taken']);

export function signupErrorMessage(err: unknown): string {
  if (!(err instanceof AuthRefusal)) {
    // Not a refusal at all: fetch threw, so nothing was decided about this
    // signup and the honest thing to say is that we could not ask.
    return NETWORK_FAILURE;
  }

  if (err.code && SERVER_PHRASES_IT.has(err.code) && err.serverMessage) {
    return err.serverMessage;
  }

  const known = err.code ? BY_CODE[err.code] : undefined;
  if (known) return known;

  // Untagged. Either an old server that predates the codes, or something
  // technical. Both get the neutral line — never `serverMessage`, which is
  // English and written for us, not for the player.
  return TECHNICAL_FAILURE;
}
