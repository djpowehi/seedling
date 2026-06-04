// Date math for keeper-bot semantics. The keeper fires monthly + bonus
// distributions at 00:00 UTC on the 1st of each calendar month, on top of
// the on-chain 30-day gate. UIs that compute "next allowance" need to
// reconcile both rules — the raw gate alone produces a misleading date
// (e.g. Pedro's gate elapses Jun 15 but his actual first fire is Jul 1).

/** Return the unix-second timestamp of the next 1st-of-calendar-month at
 *  00:00 UTC that is at or after `tsSec`. If `tsSec` already lands exactly on
 *  a 1st-of-month at midnight UTC, that same timestamp is returned. */
export function firstOfMonthOnOrAfter(tsSec: number): number {
  const d = new Date(tsSec * 1000);
  if (
    d.getUTCDate() === 1 &&
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0
  ) {
    return tsSec;
  }
  const nextFirstMs = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    1,
    0,
    0,
    0
  );
  return Math.floor(nextFirstMs / 1000);
}

/** Compute when the keeper bot will actually fire the next monthly allowance.
 *  Takes the on-chain 30-day-gate elapsed timestamp and the current time,
 *  returns the next 1st-of-calendar-month at or after MAX(gate, now). The
 *  `now` clamp handles the rare case where the gate is in the past because
 *  the keeper hasn't run yet — without it, an overdue family would show a
 *  past-month fire date. */
export function nextKeeperFire(gateElapsedSec: number, nowSec: number): number {
  return firstOfMonthOnOrAfter(Math.max(gateElapsedSec, nowSec));
}
