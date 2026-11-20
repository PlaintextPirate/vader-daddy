import { copy } from '../copy.ts';

/**
 * The one error type the app throws. `code` says what kind of failure it is (so the UI can react: flip to
 * "disconnected", show the encode error in the save bar, …); `message` is the text the user sees, always from
 * copy.ts. Whatever raw text came with the failure (service errors, exceptions) is kept in `detail` for the log.
 */
export type AppErrorCode = 'no_device' | 'service_down' | 'timeout' | 'verify_failed' | 'too_long' | 'too_many' | 'bad_reply' | 'controller' | 'unsupported' | 'no_helper' | 'unknown';

export class AppError extends Error {
  code: AppErrorCode;
  detail?: unknown;
  constructor(code: AppErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Wraps anything thrown into an AppError with a message from copy.ts; the original goes in `detail`. The one
 * place that turns failures into words for the user.
 */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError'))
    return new AppError('timeout', copy.errors.timeout, e);
  const text = e instanceof Error ? e.message : String(e);
  // Messages from the codecs that mean "this does not fit on the controller".
  if (/macros at most|At most \d+ macros/i.test(text)) return new AppError('too_many', copy.script.tooMany, e);
  if (/too long to fit/i.test(text)) return new AppError('too_long', copy.script.tooLong, e);
  return new AppError('unknown', copy.errors.unexpected, e);
}

/** The raw text behind an error, for the debug log (never for the user). */
export function rawText(e: AppError): string {
  const d = e.detail as { error?: unknown; message?: unknown } | undefined;
  const raw = d instanceof Error ? d.message : typeof d?.error === 'string' ? d.error : typeof d?.message === 'string' ? d.message : '';
  return raw && raw !== e.message ? `${e.message} (${raw})` : e.message;
}
