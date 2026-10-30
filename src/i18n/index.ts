import { es, type MessageKey } from './es';

const messages: Record<MessageKey, string> = es;

/** Traduce una clave e interpola {variables}. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = messages[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export type { MessageKey };
