const FADE_OUT_MS = 150;
const FADE_IN_MS = 300;

export function crossFade(target, signature, render) {
  if (target.dataset.signature === signature) return;
  const isFirst = target.dataset.signature === undefined;
  target.dataset.signature = signature;
  const isQuiet = isFirst || !target.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isQuiet) {
    render();
    return;
  }
  target.getAnimations().forEach((animation) => animation.cancel());
  const fadingOut = target.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT_MS, easing: 'ease-in', fill: 'forwards' });
  fadingOut.finished.then(() => {
    if (target.dataset.signature !== signature) return;
    render();
    target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS, easing: 'ease-out' });
    fadingOut.cancel();
  }).catch(() => {});
}
