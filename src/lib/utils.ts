import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ka-GE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const severityTone = (s: string) =>
  s === 'critical'
    ? 'text-clinical-critical border-clinical-critical/40 bg-clinical-critical/10'
    : s === 'high'
      ? 'text-clinical-high border-clinical-high/40 bg-clinical-high/10'
      : s === 'moderate'
        ? 'text-clinical-moderate border-clinical-moderate/40 bg-clinical-moderate/10'
        : s === 'low'
          ? 'text-clinical-low border-clinical-low/40 bg-clinical-low/10'
          : 'text-clinical-info border-clinical-info/40 bg-clinical-info/10';

export const downloadText = (filename: string, content: string, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const copyText = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
};
