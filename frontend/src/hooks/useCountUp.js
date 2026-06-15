import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/**
 * Animate a number from 0 up to `target` once it becomes available.
 * Respects prefers-reduced-motion (jumps straight to the final value).
 *
 * @param {number} target   Final value to count up to.
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]  When false, the count-up is paused
 *                                          (e.g. while data is still loading).
 * @param {number}  [options.duration=0.9]  Duration in seconds.
 */
export function useCountUp(target, { enabled = true, duration = 0.9 } = {}) {
  const reduceMotion = useReducedMotion();
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
  const [value, setValue] = useState(reduceMotion ? safeTarget : 0);

  useEffect(() => {
    if (!enabled) return undefined;

    if (reduceMotion) {
      setValue(safeTarget);
      return undefined;
    }

    const controls = animate(0, safeTarget, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setValue(Math.round(latest)),
    });

    return () => controls.stop();
  }, [safeTarget, enabled, reduceMotion, duration]);

  return reduceMotion ? safeTarget : value;
}
