import { NextResponse } from 'next/server';
import { pricingTable, usageSummary } from '@/services/metering';
import { kbExists } from '@/kb/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!kbExists()) {
    return NextResponse.json({ available: false, messageKa: 'გამოყენების აღრიცხვა ინახება ცოდნის ბაზის ფაილში, რომელიც ჯერ არ არის შექმნილი.' });
  }
  return NextResponse.json({ available: true, summary: usageSummary(), pricing: pricingTable() });
}
