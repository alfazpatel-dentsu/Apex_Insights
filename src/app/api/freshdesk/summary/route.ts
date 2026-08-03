import { NextResponse } from 'next/server';
import { getFreshdeskSummary } from '@/lib/freshdesk';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const summary = await getFreshdeskSummary();
    const status = summary.error && !summary.configured ? 503 : 200;
    return NextResponse.json(summary, { status });
  } catch (err: any) {
    return NextResponse.json(
      {
        configured: false,
        error: err?.message || 'Freshdesk summary failed',
      },
      { status: 500 }
    );
  }
}
