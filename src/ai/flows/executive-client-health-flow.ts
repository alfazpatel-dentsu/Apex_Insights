'use server';

import { ai, assertGoogleAiConfigured, z } from '@/ai/genkit';

const KpiMetricSchema = z.object({
  name: z.string(),
  target: z.number(),
  achieved: z.number(),
  unit: z.string().optional(),
});

const RiskAccountSchema = z.object({
  clientName: z.string(),
  cluster: z.string(),
  performanceRag: z.string(),
  engagementRag: z.string(),
  contractStatus: z.string(),
  csmComments: z.string(),
  performanceSummary: z.string(),
  executiveSummary: z.string(),
  challenges: z.array(z.string()),
  weeklySpend: z.number(),
  monthlySpend: z.number(),
  weeklyKpis: z.array(KpiMetricSchema),
  monthlyKpis: z.array(KpiMetricSchema),
});

const ExecutiveClientHealthInputSchema = z.object({
  cycleDate: z.string(),
  month: z.string(),
  weekNumber: z.number(),
  portfolio: z.object({
    clientCount: z.number(),
    performance: z.object({ green: z.number(), amber: z.number(), red: z.number() }),
    engagement: z.object({ green: z.number(), amber: z.number(), red: z.number() }),
    weeklySpend: z.number(),
    monthlySpend: z.number(),
    weeklyKpis: z.object({ target: z.number(), achieved: z.number() }),
    monthlyKpis: z.object({ target: z.number(), achieved: z.number() }),
  }),
  riskAccounts: z.array(RiskAccountSchema),
});

export type ExecutiveClientHealthInput = z.infer<typeof ExecutiveClientHealthInputSchema>;

const ExecutiveClientHealthOutputSchema = z.object({
  executiveSummary: z.string(),
  portfolioReadout: z.array(z.string()),
  performanceReadout: z.array(z.string()),
  engagementReadout: z.array(z.string()),
  priorityActions: z.array(z.string()),
});

export type ExecutiveClientHealthOutput = z.infer<typeof ExecutiveClientHealthOutputSchema>;

const executiveClientHealthPrompt = ai.definePrompt({
  name: 'executiveClientHealthPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: ExecutiveClientHealthInputSchema },
  output: { schema: ExecutiveClientHealthOutputSchema },
  config: { temperature: 0.2 },
  prompt: `You are preparing an evidence-led CEO briefing for Aztec Control Center, as of WBR cycle {{cycleDate}} (week {{weekNumber}}, {{month}}).

PORTFOLIO DATA
- Clients in this WBR cycle: {{portfolio.clientCount}}
- Performance RAG: {{portfolio.performance.red}} Red, {{portfolio.performance.amber}} Amber, {{portfolio.performance.green}} Green.
- Engagement RAG: {{portfolio.engagement.red}} Red, {{portfolio.engagement.amber}} Amber, {{portfolio.engagement.green}} Green.
- Spend: this week ₹{{portfolio.weeklySpend}}; month total on record ₹{{portfolio.monthlySpend}}.
- KPI to date: this week {{portfolio.weeklyKpis.achieved}} achieved / {{portfolio.weeklyKpis.target}} target; month {{portfolio.monthlyKpis.achieved}} achieved / {{portfolio.monthlyKpis.target}} target.

AT-RISK ACCOUNT EVIDENCE
{{#each riskAccounts}}
- {{this.clientName}} ({{this.cluster}}): Performance={{this.performanceRag}}, Engagement={{this.engagementRag}}, Contract={{this.contractStatus}}; CSM comments/challenges="{{this.csmComments}}"; Performance summary="{{this.performanceSummary}}"; Executive summary="{{this.executiveSummary}}"; Additional challenges={{this.challenges}}; weekly spend ₹{{this.weeklySpend}}, monthly spend ₹{{this.monthlySpend}}.
  Weekly KPIs: {{#each this.weeklyKpis}}{{this.name}} {{this.achieved}}/{{this.target}} {{this.unit}}; {{/each}}
  Monthly KPIs: {{#each this.monthlyKpis}}{{this.name}} {{this.achieved}}/{{this.target}} {{this.unit}}; {{/each}}
{{/each}}

Prepare concise, sectionalized bullet points for senior leadership.
- Executive summary: state the overall portfolio exposure, the most material risk and whether evidence shows any recovery or mitigation.
- Portfolio readout: 2-4 evidence-backed bullets on RAG distribution, spend, and KPI performance.
- Performance readout: 2-5 bullets explaining the strongest recurring performance drivers from the red/amber accounts.
- Engagement readout: 2-5 bullets explaining client/contract/communication challenges evidenced in the account notes.
- Priority actions: 2-5 practical next steps grounded in the supplied notes and metrics.
- Do not omit, rename, or misstate any metric. Do not invent causes, client sentiment, commitments, owners, or outcomes. Distinguish missing data from zero. If a section has no evidence, say so plainly.
- Keep each bullet to one or two sentences. Use client names when pointing to a specific risk.`,
});

export async function generateExecutiveClientHealthSummary(
  input: ExecutiveClientHealthInput
): Promise<ExecutiveClientHealthOutput> {
  assertGoogleAiConfigured();
  const { output } = await executiveClientHealthPrompt(input);
  if (!output) throw new Error('AI failed to generate the executive client health summary.');
  return output;
}
