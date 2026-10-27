import { PreventionApp } from '@/features/prevention/prevention-app';

export const metadata = {
  title: 'ჩემი პრევენცია',
  description: 'პირადი პრევენციის გეგმა 2 წუთში: რა კვლევა და ვაქცინა გჭირდებათ, როდის და რატომ — და რაზე არ ღირს ფულის დახარჯვა.',
};

export default function PreventionPage() {
  return <PreventionApp />;
}
