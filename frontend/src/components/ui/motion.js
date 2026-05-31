export const easeOutQuart = [0.22, 1, 0.36, 1];

export const pageMotion = {
  initial: { opacity: 0, y: 18 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.48,
      ease: easeOutQuart,
    },
  },
};

export const sectionStagger = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

export const cardLift = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.42,
      ease: easeOutQuart,
    },
  },
};

export const bubbleMotion = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.26,
      ease: easeOutQuart,
    },
  },
};
