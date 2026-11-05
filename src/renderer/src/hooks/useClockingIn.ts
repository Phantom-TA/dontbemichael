import { useEffect, useRef, useState } from 'react';
import { ACTION_CLOCKING_IN, type Agent } from '@/store/store';
import { clockingIn } from '@/shell/clockingIn';

/** The office floor's opening: who is still clocking in, refreshed while
 *  anyone is, so the dark desks and the card that explains them agree. Pass
 *  `since` to read when each was first seen. */
export function useClockingIn(agents: ReadonlyArray<Pick<Agent, 'id' | 'action'>>, since?: Map<string, number>): Set<string> {
  const own = useRef(new Map<string, number>());
  const [, tick] = useState(0);
  const out = clockingIn(agents, since ?? own.current, Date.now(), ACTION_CLOCKING_IN);
  const waiting = out.size > 0;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, [waiting]);
  return out;
}
