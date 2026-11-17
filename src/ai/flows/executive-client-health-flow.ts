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
  currentWeekDate: z.string(),
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
  prompt: `Prepare an evidence-led CEO briefing for Aztec Control Center for WBR cycle {{cycleDate}}. Compare the latest available spend week {{currentWeekDate}} with the previous available spend week {{previousWeekDate}}.

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

SYNTHESIS RULES
- Treat the source fields as evidence, not copy to reproduce. Do not quote, concatenate, or restate comments verbatim. Combine duplicate points and omit background details that do not change the leadership decision.
- executiveSummary: 2-3 short sentences, at most 60 words, explaining portfolio exposure and the main shared drivers. The UI shows exact RAG rosters, so do not repeat counts or client lists.
- portfolioReadout: exactly one concise bullet for EVERY risk client, keyed by exact CLIENT_ID. In at most 40 words, synthesize the principal account risk and its business impact using the CSM comment, performance summary, executive summary, and challenges. Include a mitigation only when the notes support it.
- performanceReadout: exactly one concise bullet for EVERY risk client, keyed by exact CLIENT_ID. In at most 40 words, identify the most material missed KPI(s), with channel and week, and whether the notes show a response. Honor DESC (lower is better). Do not enumerate every KPI; the evidence table already provides exact values.
- engagementReadout: exactly one concise bullet for EVERY risk client, keyed by exact CLIENT_ID. In at most 40 words, summarize the material relationship/operational challenge and relevant contract status.
- Do not use field headings like "Comments" or "Challenges", repeat the client's name or ID in the bullet text, or invent causes, sentiment, commitments, owners, actions, or results.
- Treat empty comments, missing KPIs, and missing spends as unavailable, not zero. Return arrays keyed to supplied client IDs and use distinct, executive-ready phrasing.`,
});

function ensureEveryRiskClient(
  generated: { clientId: string; bullet: string }[],
  accounts: ExecutiveClientHealthAccount[]
) {
  const expectedIds = new Set(accounts.map((account) => account.clientId));
  const generatedById = new Map<string, string>();
  generated.forEach((item) => {
    const bullet = item.bullet.trim();
    if (!expectedIds.has(item.clientId) || !bullet) return;
    if (generatedById.has(item.clientId)) {
      throw new Error(`AI returned a duplicate summary for client ${item.clientId}. Please regenerate the report.`);
    }
    if (bullet.split(/\s+/).length > 50) {
      throw new Error(`AI returned an overlong account summary for client ${item.clientId}. Please regenerate the report.`);
    }
    generatedById.set(item.clientId, bullet);
  });
  const missingIds = accounts.filter((account) => !generatedById.has(account.clientId)).map((account) => account.clientId);
  if (missingIds.length) {
    throw new Error(`AI did not return concise summaries for every at-risk client (${missingIds.join(', ')}). Please regenerate the report.`);
  }
  return accounts.map((account) => {
    const bullet = generatedById.get(account.clientId);
    if (!bullet) throw new Error(`AI summary missing for client ${account.clientId}. Please regenerate the report.`);
    return { clientId: account.clientId, bullet };
  });
}

export async function generateExecutiveClientHealthSummary(
  input: ExecutiveClientHealthInput
): Promise<ExecutiveClientHealthOutput> {
  assertGoogleAiConfigured();
  const { output } = await executiveClientHealthPrompt(input);
  if (!output) throw new Error('AI failed to generate the executive client health summary.');
  if (!output.executiveSummary.trim() || output.executiveSummary.trim().split(/\s+/).length > 75) {
    throw new Error('AI returned an empty or overlong executive summary. Please regenerate the report.');
  }

  return {
    executiveSummary: output.executiveSummary,
    portfolioReadout: ensureEveryRiskClient(output.portfolioReadout, input.riskAccounts),
    performanceReadout: ensureEveryRiskClient(output.performanceReadout, input.riskAccounts),
    engagementReadout: ensureEveryRiskClient(output.engagementReadout, input.riskAccounts),
  };
}
