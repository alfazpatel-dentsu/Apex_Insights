import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import {logger} from "firebase-functions";
import {ActionItemDoc, ActionAssigneeDoc} from "./action-item-row";

type ActivityType =
  | "created"
  | "updated"
  | "status_changed"
  | "assignees_changed"
  | "comment_added"
  | "comment_deleted"
  | "deleted";

interface ActivityChange {
  label: string;
  before: unknown;
  after: unknown;
}

interface ActionItemActivityDoc extends ActionItemDoc {
  createdBy?: string;
  updatedBy?: string;
  commentHistory?: Array<{
    id?: string;
    text?: string;
    author?: string;
  }>;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableValue(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function compareField(
  before: ActionItemActivityDoc,
  after: ActionItemActivityDoc,
  key: keyof ActionItemActivityDoc,
  label: string
): ActivityChange | null {
  const oldValue = before[key];
  const newValue = after[key];
  if (stableValue(oldValue) === stableValue(newValue)) return null;
  return {label, before: oldValue ?? null, after: newValue ?? null};
}

function assigneeLabels(assignees: ActionAssigneeDoc[] | undefined, assignedTo: string | undefined): string[] {
  if (assignees?.length) {
    return assignees.map((person) => person.name || person.email || "Unknown assignee");
  }
  return (assignedTo || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function commentsById(data: ActionItemActivityDoc | undefined): Map<string, string> {
  const comments = new Map<string, string>();
  for (const entry of data?.commentHistory || []) {
    if (!entry.id || entry.id.startsWith("legacy-")) continue;
    comments.set(entry.id, entry.text || "");
  }
  return comments;
}

async function writeActionItemActivity(
  before: ActionItemActivityDoc | undefined,
  after: ActionItemActivityDoc | undefined,
  actionItemId: string,
  agencyId: string,
  eventId: string,
  eventTimestamp: string
): Promise<void> {
  const db = getFirestore();
  const source = after || before;
  if (!source) return;

  const actorUid = after?.updatedBy || after?.createdBy || before?.updatedBy || before?.createdBy || "";
  let actorName = "Unknown user";
  let actorEmail = "";
  if (actorUid) {
    const actorSnapshot = await db.doc(`users/${actorUid}`).get();
    const actor = actorSnapshot.data() || {};
    actorName = String(actor.displayName || actor.email || actorUid);
    actorEmail = String(actor.email || "");
  }

  const taskName = String(source.taskName || "Untitled action item");
  const events: Array<{
    type: ActivityType;
    changes?: Record<string, ActivityChange>;
    comment?: string;
  }> = [];

  if (!before && after) {
    events.push({type: "created"});
    for (const [, text] of commentsById(after)) {
      events.push({type: "comment_added", comment: text});
    }
  } else if (before && !after) {
    events.push({type: "deleted"});
  } else if (before && after) {
    const statusChange = compareField(before, after, "status", "Status");
    if (statusChange) {
      events.push({type: "status_changed", changes: {status: statusChange}});
    }

    const oldAssignees = assigneeLabels(before.assignees, before.assignedTo);
    const newAssignees = assigneeLabels(after.assignees, after.assignedTo);
    if (stableValue(oldAssignees) !== stableValue(newAssignees)) {
      events.push({
        type: "assignees_changed",
        changes: {
          assignees: {label: "Assignees", before: oldAssignees, after: newAssignees},
        },
      });
    }

    const generalChanges: Record<string, ActivityChange> = {};
    const trackedFields: Array<[keyof ActionItemActivityDoc, string, string]> = [
      ["taskName", "Task name", "taskName"],
      ["description", "Description", "description"],
      ["section", "Section", "section"],
      ["clientName", "Client", "clientName"],
      ["priority", "Priority", "priority"],
      ["dueDate", "Due date", "dueDate"],
    ];
    for (const [key, label, id] of trackedFields) {
      const change = compareField(before, after, key, label);
      if (change) generalChanges[id] = change;
    }
    if (Object.keys(generalChanges).length) {
      events.push({type: "updated", changes: generalChanges});
    }

    const oldComments = commentsById(before);
    const newComments = commentsById(after);
    for (const [id, text] of newComments) {
      if (!oldComments.has(id)) {
        events.push({type: "comment_added", comment: text});
      }
    }
    for (const [id, text] of oldComments) {
      if (!newComments.has(id)) {
        events.push({type: "comment_deleted", comment: text});
      }
    }
  }

  const safeEventId = eventId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const createdAt = Timestamp.fromDate(new Date(eventTimestamp));
  const batch = db.batch();
  events.forEach((event, index) => {
    const ref = db.collection("actionItemActivity").doc(`${safeEventId}_${index}`);
    batch.set(ref, {
      agencyId,
      actionItemId,
      taskName,
      type: event.type,
      actorUid,
      actorName,
      actorEmail,
      createdAt,
      ...(event.changes ? {changes: event.changes} : {}),
      ...(event.comment !== undefined ? {comment: event.comment} : {}),
      recordedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  if (events.length) await batch.commit();
}

function createAuditTrigger(path: string, agencyPathParam?: boolean) {
  return functions
    .region("us-central1")
    .runWith({timeoutSeconds: 60, memory: "256MB"})
    .firestore.document(path)
    .onWrite(async (change, context) => {
      const before = change.before.exists
        ? (change.before.data() as ActionItemActivityDoc)
        : undefined;
      const after = change.after.exists
        ? (change.after.data() as ActionItemActivityDoc)
        : undefined;
      const agencyId = agencyPathParam
        ? String(context.params.agencyId || "")
        : "sokrati";
      try {
        await writeActionItemActivity(
          before,
          after,
          context.params.id as string,
          agencyId,
          context.eventId,
          context.timestamp
        );
      } catch (error) {
        logger.error("Action item activity audit failed", {
          actionItemId: context.params.id,
          agencyId,
          eventId: context.eventId,
          error,
        });
        throw error;
      }
    });
}

export const auditSokratiActionItem = createAuditTrigger("actionItems/{id}");
export const auditAgencyActionItem = createAuditTrigger(
  "agencies/{agencyId}/actionItems/{id}",
  true
);
