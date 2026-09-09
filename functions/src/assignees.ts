export interface ActionAssignee {
  name?: string;
  email?: string;
  userId?: string;
}

export interface AssigneeSource {
  assignedTo?: string;
  assignees?: ActionAssignee[];
}

export function assigneesFromItem(item: AssigneeSource | undefined | null): ActionAssignee[] {
  if (!item) return [];
  if (item.assignees && item.assignees.length > 0) {
    return item.assignees.map((a) => ({
      name: String(a.name || "").trim(),
      email: String(a.email || "").trim().toLowerCase(),
      userId: a.userId ? String(a.userId) : undefined,
    }));
  }
  const raw = (item.assignedTo || "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;&/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.includes("@")
        ? {name: part.split("@")[0] || part, email: part.toLowerCase()}
        : {name: part, email: ""}
    );
}

export function assigneeKey(a: ActionAssignee): string {
  if (a.userId) return `uid:${a.userId}`;
  if (a.email) return `email:${a.email.trim().toLowerCase()}`;
  return `name:${(a.name || "").trim().toLowerCase()}`;
}

export function newlyAddedAssignees(
  after: AssigneeSource,
  before?: AssigneeSource
): ActionAssignee[] {
  const next = assigneesFromItem(after);
  if (!before) return next;
  const prev = assigneesFromItem(before);
  const prevKeys = new Set(prev.map(assigneeKey));
  const prevEmails = new Set(
    prev.map((a) => (a.email || "").trim().toLowerCase()).filter((e) => e.includes("@"))
  );
  return next.filter((a) => {
    if (!prevKeys.has(assigneeKey(a))) return true;
    const email = (a.email || "").trim().toLowerCase();
    return email.includes("@") && !prevEmails.has(email);
  });
}
