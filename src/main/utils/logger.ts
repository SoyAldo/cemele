import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// ─────────────────────────────────────────────────────────────
//  Tipos
// ─────────────────────────────────────────────────────────────

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

// ─────────────────────────────────────────────────────────────
//  Estado interno del logger
// ─────────────────────────────────────────────────────────────

let logFilePath: string | null = null;
let writeStream: fs.WriteStream | null = null;
let sessionStart: Date = new Date();

// Referencia a los métodos nativos de console (antes de interceptar)
const nativeConsole = {
  log:   console.log.bind(console),
  warn:  console.warn.bind(console),
  error: console.error.bind(console),
};

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function getLogsDir(): string {
  const gameDir = path.join(os.homedir(), 'AppData', 'Roaming', '.cemele-modpack');
  return path.join(gameDir, 'internal_logs');
}

function buildFileName(): string {
  const d = sessionStart;
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${date}_${time}.txt`;
}

function formatLine(level: LogLevel, tag: string, message: string): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const timestamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.` +
    `${String(now.getMilliseconds()).padStart(3, '0')}`;

  return `[${timestamp}] [${level.padEnd(5)}] [${tag}] ${message}`;
}

function writeLine(line: string): void {
  // Siempre a la consola nativa (sin interceptar)
  if (line.includes('[ERROR]') || line.includes('[WARN ]')) {
    nativeConsole.error(line);
  } else {
    nativeConsole.log(line);
  }

  // Al archivo
  if (writeStream && !writeStream.destroyed) {
    writeStream.write(line + '\n');
  }
}

// ─────────────────────────────────────────────────────────────
//  Inicialización
// ─────────────────────────────────────────────────────────────

/**
 * Inicializar el logger. Debe llamarse lo antes posible en el proceso main.
 * También intercepta console.log / console.warn / console.error globalmente.
 */
export async function initLogger(): Promise<void> {
  sessionStart = new Date();
  const logsDir = getLogsDir();
  await fs.ensureDir(logsDir);

  logFilePath = path.join(logsDir, buildFileName());
  writeStream = fs.createWriteStream(logFilePath, { encoding: 'utf-8', flags: 'a' });

  writeStream.on('error', (err) => {
    nativeConsole.error(`[Logger] Error escribiendo al archivo de log: ${err.message}`);
  });

  // Guardar referencias nativas ya están en nativeConsole (declarado arriba)

  // Interceptar console.log
  console.log = (...args: any[]) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    writeLine(formatLine('INFO', 'console', msg));
  };

  // Interceptar console.warn
  console.warn = (...args: any[]) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    writeLine(formatLine('WARN', 'console', msg));
  };

  // Interceptar console.error
  console.error = (...args: any[]) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    writeLine(formatLine('ERROR', 'console', msg));
  };

  // Capturar excepciones no manejadas
  process.on('uncaughtException', (err) => {
    log.error('process', `UncaughtException: ${err.message}\n${err.stack}`);
    // Dejar que Electron maneje el cierre
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error
      ? `${reason.message}\n${reason.stack}`
      : String(reason);
    log.error('process', `UnhandledRejection: ${msg}`);
  });

  const header = [
    '═'.repeat(72),
    `  CEMELE LAUNCHER — Sesión iniciada: ${sessionStart.toISOString()}`,
    `  Archivo: ${logFilePath}`,
    `  Node: ${process.version}  |  Plataforma: ${process.platform} ${process.arch}`,
    '═'.repeat(72),
  ].join('\n');

  writeStream.write(header + '\n');
  log.info('logger', `Sistema de logs inicializado → ${logFilePath}`);
}

/**
 * Cerrar el stream del archivo de log de forma limpia.
 */
export function closeLogger(): void {
  if (writeStream && !writeStream.destroyed) {
    log.info('logger', 'Cerrando logger.');
    writeStream.end();
    writeStream = null;
  }
}

/**
 * Devuelve la ruta del archivo de log de la sesión actual.
 */
export function getLogFilePath(): string | null {
  return logFilePath;
}

// ─────────────────────────────────────────────────────────────
//  API pública — log.*
// ─────────────────────────────────────────────────────────────

export const log = {
  info(tag: string, message: string): void {
    writeLine(formatLine('INFO', tag, message));
  },

  warn(tag: string, message: string): void {
    writeLine(formatLine('WARN', tag, message));
  },

  error(tag: string, message: string, err?: Error): void {
    const detail = err ? `\n  → ${err.message}${err.stack ? '\n' + err.stack : ''}` : '';
    writeLine(formatLine('ERROR', tag, message + detail));
  },

  debug(tag: string, message: string): void {
    // Solo escribe en modo desarrollo para no saturar logs de producción
    if (process.env.NODE_ENV === 'development') {
      writeLine(formatLine('DEBUG', tag, message));
    }
  },

  /** Registra inicio de una etapa importante con separador visual */
  stage(name: string): void {
    writeLine('');
    writeLine(`${'─'.repeat(60)}`);
    writeLine(formatLine('INFO', 'stage', `▶ ${name}`));
    writeLine(`${'─'.repeat(60)}`);
  },
};
