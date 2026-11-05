import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, ACTION_CLOCKING_IN } from '@/store/store';
import { useClockingIn } from '@/hooks/useClockingIn';
import { restoreInFlight } from '@/hooks/useRestoreTeam';
import { DONE_SHOWN_MS, SHORT_SHOWN_MS, lockEnd, namesShown, nextOpening, openingClock, slowestOut, stillOut, waitNote } from '@/shell/clockingIn';
import { OpeningCard } from './OpeningCard';

/** How long the end card takes to fade, inside its shown time. */
const FADE_MS = 300;

/**
 * The office opening (DESIGN.md 7.24, design review 2026-10-18). Always
 * mounted, so the opening moves on whatever view is up (the clock pill reads
 * it too); the card itself shows on the office floor only. While people clock
 * in: who is in, a bar, who is still coming, how long it has run and who is
 * slowest, so a slow start never reads as frozen (owner, 2026-10-30). Then
 * "Everyone's in" for 2 s, or at the one minute cap who has not clocked in, for
 * 4 s. After that the opening is over for the session: a mid-day hire clocks in
 * on their desk only. It also ends the launch lock, whatever the opening is
 * waiting on (docs/designs/clocking-in-clarity.md).
 */
export function TeamClockingIn({ show }: { show: boolean }) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const opening = useStore((s) => s.opening);
  const godStatus = useStore((s) => s.godStatus);
  const stopped = useStore((s) => s.stopped);
  const launchLock = useStore((s) => s.launchLock);
  const firstSeen = useRef(new Map<string, number>());
  const arriving = useClockingIn(agents, firstSeen.current);
  // A member whose terminal ended is not coming: the opening waits for none of
  // them (owner, 2026-10-30), and still names them as not clocked in.
  const coming = [...arriving].filter((id) => !stopped[id]).length;
  const michaelStopped = Object.values(stopped).some((m) => m.isMichael);
  const [, tick] = useState(0);
  // What the screen reader heard when this opening began, kept for its whole run.
  const said = useRef<{ since: number; text: string } | null>(null);
  const clock = useRef<{ since: number; at: number } | null>(null);
  // When each terminal last printed, by pty id; unset while there is no reading.
  const [outputs, setOutputs] = useState<Map<string, number> | undefined>();
  if (opening.kind === 'opening') clock.current = openingClock(clock.current, opening.since, launchLock, Date.now());

  const live = opening.kind !== 'over';
  const opened = opening.kind === 'opening';
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    const read = (): void => {
      window.cth.listPtys()
        .then((list) => { if (alive) setOutputs(new Map(list.map((p) => [p.id, p.lastOutputAt]))); })
        .catch(() => { if (alive) setOutputs(undefined); });
    };
    read();
    const id = window.setInterval(read, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, [opened]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [live]);
  useEffect(() => {
    const next = nextOpening(opening, {
      team: agents, arriving: coming, michaelStarting: godStatus === 'booting',
      restoring: restoreInFlight(), marker: ACTION_CLOCKING_IN
    }, Date.now());
    if (next !== opening) useStore.getState().setOpening(next);
  });
  useEffect(() => {
    if (!launchLock) return;
    const now = Date.now();
    const end = lockEnd(opening, michaelStopped, clock.current?.at ?? now, now);
    if (!end) return;
    console.log(`[opening] floor open: ${end} after ${Math.round((now - (clock.current?.at ?? now)) / 1000)} s, still out: ${stillOut(agents, ACTION_CLOCKING_IN).join(', ') || 'nobody'}`);
    useStore.getState().endLaunchLock();
  });

  // A stopped Michael's own card says what happened instead (MichaelStopped).
  if (!show || michaelStopped) return null;
  const joined = (names: string[]) => names.join(t('office.opening.nameSep'));

  if (opening.kind === 'opening') {
    const out = stillOut(agents, ACTION_CLOCKING_IN);
    if (!agents.length || !out.length) return null;
    const total = agents.length;
    const inCount = total - out.length;
    if (said.current?.since !== opening.since) said.current = { since: opening.since, text: t('office.opening.announce', { count: inCount, total }) };
    // Who is still on the way: a member whose terminal ended is out, not coming.
    const shown = namesShown(stillOut(agents.filter((a) => !stopped[a.id]), ACTION_CLOCKING_IN));
    const now = Date.now();
    const elapsed = now - (clock.current?.at ?? now);
    const seconds = Math.floor(elapsed / 1000);
    const slowest = slowestOut(agents.filter((a) => arriving.has(a.id) && !stopped[a.id]), firstSeen.current);
    const note = waitNote(!!slowest, elapsed, slowest?.ptyId ? outputs?.get(slowest.ptyId) : undefined, now);
    return (
      <OpeningCard tone="indigo" pulse
        title={t('office.opening.title')}
        count={t('office.clockedInCount', { count: inCount, total })}
        progress={{ value: inCount, max: total, label: t('office.opening.title') }}
        line={<>
          {shown.names.length > 0 && <div>{shown.more
            ? t('office.opening.stillComingMore', { names: joined(shown.names), count: shown.more })
            : t('office.opening.stillComing', { names: joined(shown.names) })}</div>}
          {note && <div>{t(`office.opening.wait.${note}`, { seconds, name: slowest?.name })}</div>}
          {launchLock && <div>{t('office.opening.floorWaits')}</div>}
        </>}
        say={said.current.text} />
    );
  }
  if (opening.kind === 'done') {
    const title = t('office.opening.allIn');
    return (
      <OpeningCard tone="green" check fadeAfterMs={DONE_SHOWN_MS - FADE_MS}
        title={title}
        count={t('office.clockedInCount', { count: opening.total, total: opening.total })}
        progress={{ value: opening.total, max: opening.total, label: title }}
        say={title} />
    );
  }
  if (opening.kind === 'short') {
    const title = t('office.clockedInCount', { count: opening.total - opening.missing.length, total: opening.total });
    const [first, ...rest] = opening.missing;
    const line = rest.length
      ? t('office.opening.missingMore', { name: first, count: rest.length })
      : t('office.opening.missingOne', { name: first });
    return <OpeningCard tone="amber" fadeAfterMs={SHORT_SHOWN_MS - FADE_MS} title={title} line={line} say={`${title}. ${line}`} />;
  }
  return null;
}
