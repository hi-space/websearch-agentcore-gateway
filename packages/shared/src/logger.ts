type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  with(fields: Record<string, unknown>): Logger;
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  const emit = (level: LogLevel, message: string, fields: Record<string, unknown> = {}) => {
    const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...base, ...fields });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    with: (fields) => createLogger({ ...base, ...fields }),
    log: emit,
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f)
  };
}
