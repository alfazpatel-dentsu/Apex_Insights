import { NextRequest, NextResponse } from 'next/server';
import { getFreshdeskTickets, type FreshdeskTicketFilter } from '@/lib/freshdesk';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VIEWS: FreshdeskTicketFilter[] = [
  'all',
  'open',
  'overdue',
  'sla_violated',
  'pending',
  'resolved',
  'closed',
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const viewParam = (searchParams.get('view') || 'all').toLowerCase();
    const view = (VIEWS.includes(viewParam as FreshdeskTicketFilter)
      ? viewParam
      : 'all') as FreshdeskTicketFilter;
    const team = searchParams.get('team') || undefined;
    const type = searchParams.get('type') || undefined;
    const limitRaw = Number(searchParams.get('limit') || 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    const result = await getFreshdeskTickets({ view, team, type, limit });
    const status = result.error && !result.configured ? 503 : 200;
    return NextResponse.json(result, { status });
  } catch (err: any) {
    return NextResponse.json(
      {
        configured: false,
        tickets: [],
        error: err?.message || 'Freshdesk tickets failed',
      },
      { status: 500 }
    );
  }
}
