import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="grid gap-1.5 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl font-headline uppercase">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-secondary max-w-2xl">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
