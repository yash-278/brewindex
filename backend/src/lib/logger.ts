const BASE = {
  service: 'brewsync',
  version: process.env.npm_package_version ?? 'unknown',
  env: process.env.RAILWAY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
};

function emit(level: 'info' | 'error', fields: Record<string, unknown>) {
  const line = JSON.stringify({ ...BASE, level, ts: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => emit('info', { event, ...fields }),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', { event, ...fields }),
};
