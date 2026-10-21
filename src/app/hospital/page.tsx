import { HospitalMap } from '@/features/home/hospital-map';

export const metadata = { title: 'AI ჰოსპიტალი' };

export default function HospitalPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">AI ჰოსპიტლის საოპერაციო სისტემა</h1>
        <p className="mt-1 text-sm text-slate-400">ყოველ მოდულზე ხილულია: რას აკეთებს AI, რა შედის, რა გამოდის, სად გადის უსაფრთხოების საზღვარი და რომელი აგენტებია ჩართული.</p>
      </header>
      <HospitalMap />
    </div>
  );
}
