'use server';

import { ai, assertGoogleAiConfigured, z } from '@/ai/genkit';
import type { ExecutiveClientHealthAccount } from '@/lib/types';

const KpiSchema = z.object({
  id: z.string(),
  channel: z.string(),
  name: z.string(),
  lob: z.string(),
  kpiType: z.enum(['PRIMARY', 'NON-PRIMARY']),
  direction: z.enum(['ASC', 'DESC']),
  target: z.number(),
  achieved: z.number(),
  unit: z.string().optional(),
});

const WeekSchema = z.object({
  weekStartDate: z.string(),
  weekEndDate: z.string(),
  label: z.string(),
  spendsByChannel: z.array(z.object({ channel: z.string(), amount: z.number() })),
  kpis: z.array(KpiSchema),
});

const ActionSchema = z.object({
  id: z.string(),
  taskName: z.string(),
  description: z.string(),
  status: z.enum(['Work-In Progress', 'On-Hold', 'Observation', 'Overdue', 'Completed']),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  assignedTo: z.string(),
  dueDate: z.string().optional(),
  latestComment: z.string(),
  latestCommentAt: z.string().optional(),
});

const RiskAccountSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  cluster: z.string(),
  performanceRag: z.enum(['Green', 'Amber', 'Red', 'N/A']),
  engagementRag: z.enum(['Green', 'Amber', 'Red', 'N/A']),
  contractStatus: z.string(),
  csmComments: z.string(),
  performanceSummary: z.string(),
  executiveSummary: z.string(),
  challenges: z.array(z.string()),
  previousWeek: WeekSchema,
  currentWeek: WeekSchema,
  pendingActions: z.array(ActionSchema),
});

const ExecutiveClientHealthInputSchema = z.object({
  cycleDate: z.string(),
  previousWeekDate: z.string(),
  portfolio: z.object({
    clientCount: z.number(),
    performance: z.object({ green: z.number(), amber: z.number(), red: z.number() }),
    engagement: z.object({ green: z.number(), amber: z.number(), red: z.number() }),
  }),
  riskAccounts: z.array(RiskAccountSchema),
});

const AccountBulletSchema = z.object({ clientId: z.string(), bullet: z.string() });

const ExecutiveClientHealthOutputSchema = z.object({
  executiveSummary: z.string(),
  portfolioReadout: z.array(AccountBulletSchema),
  performanceReadout: z.array(AccountBulletSchema),
  engagementReadout: z.array(AccountBulletSchema),
});

export type ExecutiveClientHealthInput = z.infer<typeof ExecutiveClientHealthInputSchema>;
export type ExecutiveClientHealthOutput = z.infer<typeof ExecutiveClientHealthOutputSchema>;

const executiveClientHealthPrompt = ai.definePrompt({
  name: 'executiveClientHealthPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: ExecutiveClientHealthInputSchema },
  output: { schema: ExecutiveClientHealthOutputSchema },
  config: { temperature: 0.1 },
  prompt: `Prepare an evidence-led CEO briefing for Aztec Control Center for WBR cycle {{cycleDate}}. Compare the current week with the immediately preceding week {{previousWeekDate}}.

PORTFOLIO RAG COUNTS (unique clients; do not recalculate):
- Clients reviewed: {{portfolio.clientCount}}
- Performance: {{portfolio.performance.red}} Red, {{portfolio.performance.amber}} Amber, {{portfolio.performance.green}} Green.
- Engagement: {{portfolio.engagement.red}} Red, {{portfolio.engagement.amber}} Amber, {{portfolio.engagement.green}} Green.

RED / AMBER ACCOUNTS
{{#each riskAccounts}}
CLIENT_ID={{this.clientId}} | NAME={{this.clientName}} | CLUSTER={{this.cluster}}
PERFORMANCE_RAG={{this.performanceRag}} | ENGAGEMENT_RAG={{this.engagementRag}} | CONTRACT={{this.contractStatus}}
CSM_COMMENTS={{this.csmComments}}
PERFORMANCE_SUMMARY={{this.performanceSummary}}
EXECUTIVE_SUMMARY_AND_CHALLENGES={{this.executiveSummary}} {{#each this.challenges}}{{this}}; {{/each}}
LAST_WEEK={{this.previousWeek.label}}; SPEND_BY_CHANNEL={{#each this.previousWeek.spendsByChannel}}{{this.channel}} ₹{{this.amount}}; {{/each}}
LAST_WEEK_KPIS={{#each this.previousWeek.kpis}}{{this.channel}} / {{this.name}} ({{this.kpiType}}; {{this.lob}}): target {{this.target}}, achieved {{this.achieved}} {{this.unit}}; {{/each}}
CURRENT_WEEK={{this.currentWeek.label}}; SPEND_BY_CHANNEL={{#each this.currentWeek.spendsByChannel}}{{this.channel}} ₹{{this.amount}}; {{/each}}
CURRENT_WEEK_KPIS={{#each this.currentWeek.kpis}}{{this.channel}} / {{this.name}} ({{this.kpiType}}; {{this.lob}}): target {{this.target}}, achieved {{this.achieved}} {{this.unit}}; {{/each}}
PENDING_ACTIONS={{#each this.pendingActions}}{{this.taskName}} [{{this.status}}, {{this.priority}}], owner={{this.assignedTo}}, latest comment={{this.latestComment}}; {{/each}}
{{/each}}

Write concise, client-by-client bullets for senior leadership:
- executiveSummary: briefly state portfolio exposure and what is driving it. Do not list or recalculate the RAG totals here; the UI presents exact, deterministic RAG client lists.
- portfolioReadout: exactly one bullet for EVERY risk client, keyed by its exact CLIENT_ID. Combine that client's CSM comments, performance summary, executive summary, and challenges. Preserve material reasons and action plans.
- performanceReadout: exactly one bullet for EVERY risk client, keyed by exact CLIENT_ID. Use week-by-week KPI target and achievement, channel and primary/non-primary classification. State which targets are missed (honor DESC means lower is better), and mention action plans from the account notes. Do not add KPI rows or aggregate incomparable metrics.
- engagementReadout: exactly one bullet for EVERY risk client, keyed by exact CLIENT_ID. Summarize that account's CSM comments, executive summary/challenges, and contract status where relevant.
- Do not omit any risk client. Do not invent causes, sentiment, commitments, owners, actions, or results. Treat empty comments, missing KPIs, and missing spends as unavailable, not zero.
- Keep each bullet to one or two sentences. Use only evidence belonging to the matching client. Return arrays keyed to the supplied client IDs.`,
});

function fallbackAccountBullet(account: ExecutiveClientHealthAccount, section: 'portfolio' | 'performance' | 'engagement'): string {
  if (section === 'portfolio') {
    const notes = [account.csmComments, account.performanceSummary, account.executiveSummary, ...account.challenges]
      .map((value) => value.trim())
      .filter(Boolean);
    return notes.length ? notes.join(' ') : 'No CSM comments, performance summary, executive summary, or challenge notes were recorded.';
  }

  if (section === 'engagement') {
    const notes = [account.csmComments, account.executiveSummary, ...account.challenges]
      .map((value) => value.trim())
      .filter(Boolean);
    if (account.contractStatus && account.contractStatus !== 'Valid') notes.push(`Contract status: ${account.contractStatus}.`);
    return notes.length ? notes.join(' ') : 'No engagement comments or challenges were recorded.';
  }

  const metrics = [account.previousWeek, account.currentWeek].flatMap((week) =>
    week.kpis.map((kpi) => {
      const missed = kpi.direction === 'DESC' ? kpi.achieved > kpi.target : kpi.achieved < kpi.target;
      return `${week.label}: ${kpi.channel} ${kpi.name} (${kpi.kpiType}) achieved ${kpi.achieved} against ${kpi.target}${missed ? ' (target missed)' : ''}`;
    })
  );
  const plan = [account.performanceSummary, account.executiveSummary, ...account.challenges]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...metrics, ...plan].join('. ') || 'No weekly KPI records or performance action plan were recorded.';
}

function ensureEveryRiskClient(
  generated: { clientId: string; bullet: string }[],
  accounts: ExecutiveClientHealthAccount[],
  section: 'portfolio' | 'performance' | 'engagement'
) {
  const generatedById = new Map(
    generated.filter((item) => item.bullet.trim()).map((item) => [item.clientId, item.bullet.trim()])
  );
  return accounts.map((account) => ({
    clientId: account.clientId,
    bullet: generatedById.get(account.clientId) || fallbackAccountBullet(account, section),
  }));
}

export async function generateExecutiveClientHealthSummary(
  input: ExecutiveClientHealthInput
): Promise<ExecutiveClientHealthOutput> {
  assertGoogleAiConfigured();
  const { output } = await executiveClientHealthPrompt(input);
  if (!output) throw new Error('AI failed to generate the executive client health summary.');

  return {
    executiveSummary: output.executiveSummary,
    portfolioReadout: ensureEveryRiskClient(output.portfolioReadout, input.riskAccounts, 'portfolio'),
    performanceReadout: ensureEveryRiskClient(output.performanceReadout, input.riskAccounts, 'performance'),
    engagementReadout: ensureEveryRiskClient(output.engagementReadout, input.riskAccounts, 'engagement'),
  };
}
