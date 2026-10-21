import {
  Briefcase,
  ChartLine,
  ChartLineUp,
  ClipboardText,
  Coins,
  ListChecks,
  PresentationChart,
  ShieldCheck,
  Target,
} from '@phosphor-icons/react';

export const DASHBOARD_NAV_ITEMS = [
  {
    href: '/dashboard/business-snapshot',
    label: 'Snapshot',
    icon: ChartLineUp,
    testId: 'sidebar-nav-dashboard',
    permission: 'snapshot',
    description:
      'Start with the executive view of current business performance. Bring weekly and monthly spend movement, sales pipeline, action-item status, client updates and KPI health together to see where momentum is building and where a closer review may be needed.',
  },
  {
    href: '/dashboard/sales-tracker',
    label: 'Sales Tracker',
    icon: Briefcase,
    testId: 'sidebar-nav-sales',
    permission: 'sales',
    description:
      'Follow opportunities from qualification through the sales pipeline, with the details your team uses to understand each prospect, its estimated value, expected spend, services and next steps. Use the tracker to keep acquisition activity visible alongside the agency’s current client work.',
  },
  {
    href: '/dashboard/kpi-tracking',
    label: 'KPI Tracker',
    icon: Target,
    testId: 'sidebar-nav-kpis',
    permission: 'tracker',
    description:
      'Compare client KPI targets with recorded performance across the selected reporting periods. Review weekly pacing, identify accounts that are ahead of or behind target, and use the underlying client and channel detail to focus the next performance conversation.',
  },
  {
    href: '/dashboard/spends',
    label: 'Spends Update',
    icon: Coins,
    testId: 'sidebar-nav-spends',
    permission: 'spends',
    description:
      'Review monthly and weekly spend records for the clients available to your agency. This workspace brings the operational data and reporting periods into view, so teams can inspect existing entries and maintain the spend information used by the downstream analytics.',
  },
  {
    href: '/dashboard/spends-dashboard',
    label: 'Spends Dashboard',
    icon: PresentationChart,
    testId: 'sidebar-nav-spends-dashboard',
    permission: 'dashboard',
    description:
      'Explore spend performance across the reporting periods and dimensions available in the dashboard. Compare movement over time, review channel and client contributions, and use the page’s filters to investigate what is driving changes in the spend picture.',
  },
  {
    href: '/dashboard/spends-forecast',
    label: 'Spends Forecast',
    icon: ChartLine,
    testId: 'sidebar-nav-spends-forecast',
    permission: 'forecast',
    description:
      'Use historical monthly spend to examine forward-looking projections. Compare the available forecasting models, inspect the projected horizon alongside recorded actuals, and export the forecast view when you need to continue the analysis outside the dashboard.',
  },
  {
    href: '/dashboard/wbr',
    label: 'Weekly Review',
    icon: ClipboardText,
    testId: 'sidebar-nav-wbr',
    permission: 'wbr',
    description:
      'Bring weekly client performance and account context into a structured review. Browse the available review cycle, inspect performance and engagement signals, and read the summaries and notes that help teams discuss risks, opportunities and follow-up with each client.',
  },
  {
    href: '/dashboard/actions',
    label: 'Action Items',
    icon: ListChecks,
    testId: 'sidebar-nav-actions',
    permission: 'actions',
    description:
      'Turn review discussions into trackable work. See action items grouped by their current status, and review the task description, owner, priority and due date so responsibilities and follow-up remain clear across the team.',
  },
  {
    href: '/dashboard/admin',
    label: 'Administration',
    icon: ShieldCheck,
    testId: 'sidebar-nav-admin',
    permission: 'admin',
    description:
      'For users with administration access, this is the place to manage team access and the settings that support the Control Center. Available controls depend on your role; the guided tour only includes this destination when your effective permissions allow it.',
  },
] as const;
