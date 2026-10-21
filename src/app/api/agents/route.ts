import { NextResponse } from 'next/server';
import { AGENTS } from '@/agents/registry';
import { AGENT_IMPLEMENTATIONS } from '@/agents/implementations';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    agents: AGENTS.map((a) => ({ ...a, implemented: a.id === 'A00' || a.id === 'A19' || a.id === 'A20' ? true : Boolean(AGENT_IMPLEMENTATIONS[a.id]) })),
    total: AGENTS.length,
  });
}
