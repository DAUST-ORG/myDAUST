/**
 * The station is deliberately outside PortalShell. It is a 1180x800 landscape appliance
 * bolted to a wall at the dining-hall entrance, not a page in a sidebar console — and the
 * sidebar would eat a third of the width the viewfinder needs.
 *
 * Auth is a normal staff session, not a device credential: JwtStrategy re-reads Person and
 * compares sessionVersion on every request, so a station can be revoked instantly by bumping
 * that column. A shared device secret would have no revocation and, worse, no attribution —
 * and every manual override is audit-logged with the actor's personId.
 */
export default function StationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
