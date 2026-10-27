import type { ScreeningStatus, VaccineItem } from './types';

export const STATUS_KA: Record<ScreeningStatus, string> = {
  up_to_date: 'ვადაშია',
  overdue: 'ვადა გავიდა',
  due: 'დროა ჩატარდეს',
  discuss: 'ექიმთან გადაწყვეტა',
  needs_data: 'საჭიროა მონაცემი',
  not_needed: 'არ გჭირდებათ',
};

export const VACCINE_STATUS_KA: Record<VaccineItem['status'], string> = {
  recommended: 'რეკომენდებულია',
  up_to_date: 'ვადაშია',
  consider: 'განიხილეთ ექიმთან',
  not_needed: 'არ გჭირდებათ',
};
