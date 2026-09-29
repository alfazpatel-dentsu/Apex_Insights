# Agency tenancy migration

## Target data layout

All business data belongs below `agencies/{agencyId}`. The only supported
agency IDs are `sokrati` and `iprospect`.

```text
agencies/sokrati/{collection}/{document}
agencies/iprospect/{collection}/{document}
```

The following Sokrati root collections must be copied with document IDs and
contents preserved: `clients`, `leads`, `kpis`, `kpiWeeklyData`,
`kpiDefinitions`, `channels`, `monthlySpends`, `weeklySpends`,
`businessSnapshots`, `actionItems`, `wbrEntries`, `pageManagement`, and
`clusterInsights`.

Every business document must also include `agencyId: "sokrati"`. The migration
script backfills this identifier on the legacy source document and writes it to
the copied tenant document, so the data remains explicitly attributable during
and after the transition.

## Safe cutover sequence

1. Deploy the tenant-aware rules in this change. They preserve legacy root
   collection access only for Sokrati members while preventing iProspect-only
   accounts from reading the legacy data.
2. Backfill every existing approved user with an active `memberships.sokrati`
   entry. Backfill legacy Sokrati administrators with `groupPermissions:
   ['platform_admin']` before removing the temporary legacy rule path.
3. Copy each root collection to `agencies/sokrati/{collection}` with the
   supplied Admin SDK script. Run `npm --prefix functions run migrate:sokrati`
   first to inspect counts, then rerun it with `-- --execute` to copy documents.
   Compare document counts, sampled IDs, and `agencyId` values before cutover.
   The script never deletes legacy source documents.
4. Update each client query, write, Cloud Function trigger, Sheets sync, mail
   notification, and export to use `agencyCollectionPath(agencyId, collection)`.
5. Release the Sokrati UI against the tenant path, then disable writes to the
   root collections. Keep a short, read-only rollback window if required.
6. Remove legacy root collection matches and `isLegacySokratiUser` from
   `firestore.rules` after verification. Only then load iProspect production
   data into `agencies/iprospect`.

## Access approval workflow

The only platform administrators are `alfaz.patel@dentsu.com`,
`hasnain.rasiwalla1@dentsu.com`, and `mehul.kulkarni@dentsu.com`. They approve
access in Administration by assigning an agency and page permissions. There are
no business roles such as CSM or Cluster Lead: page permissions are the source
of truth. Approval activates the selected membership and triggers the existing
access-granted confirmation email. The `manageUserAgencyAccess` callable writes
an immutable server-side audit record for every change.

## Executive reporting

Do not query both agency datasets from an ordinary agency screen. Build a
separate read-only Group reporting surface that is available only when a user
has active memberships for both agencies and the `group_reporting` permission.
Every exported or displayed aggregate must retain its agency label.
