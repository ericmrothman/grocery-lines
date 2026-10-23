import { element } from '../shared/dom.js';

const READING_LINE_SHARE = 0.68;
const ARRIVES_AT_SHARE = 0.3;

export function storyParagraphs(text) {
  return text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph !== '');
}

function storyBreak(pause) {
  const figures = element('div', { className: 'story-break-figures' });
  figures.append(...pause.figures.map((figure) => {
    const item = element('div', { className: 'story-break-figure' });
    item.append(element('p', { className: 'story-break-value', text: figure.value }), element('p', { className: 'story-break-words', text: figure.words }));
    return item;
  }));
  const pauseElement = element('aside', { className: 'story-break' });
  pauseElement.append(figures, ...storyParagraphs(pause.copy).map((paragraph) => element('p', { className: 'story-break-copy', text: paragraph })));
  return pauseElement;
}

function storySection({ step, copy }) {
  const section = element('section', { className: 'story-step' });
  section.dataset.step = String(step);
  section.append(...storyParagraphs(copy).map((paragraph) => element('p', { className: 'story-step-copy', text: paragraph })), element('div', { className: 'story-step-figure' }));
  return section;
}

export function readingStep(cardTops, lineY) {
  let reached = cardTops.length > 0 ? cardTops[0].step : null;
  for (const { step, top } of cardTops) if (top <= lineY) reached = step;
  return reached;
}

export function readingProgress(firstTop, lastBottom, lineY) {
  if (lastBottom <= firstTop) return 0;
  return Math.min(1, Math.max(0, (lineY - firstTop) / (lastBottom - firstTop)));
}

export function createStoryReader(container, { steps, onStepReached, onProgress }) {
  const built = steps.map((step) => ({ step: step.step, section: storySection(step), pause: step.breakBefore ? storyBreak(step.breakBefore) : null }));
  container.replaceChildren(...built.flatMap(({ section, pause }) => (pause ? [pause, section] : [section])));
  let reportedStep = null;
  let isFramePending = false;

  function lineY() {
    return window.innerHeight * READING_LINE_SHARE;
  }

  function stepAtLine() {
    return readingStep(built.map(({ step, section }) => ({ step, top: section.getBoundingClientRect().top })), lineY());
  }

  function report() {
    isFramePending = false;
    onProgress(readingProgress(built[0].section.getBoundingClientRect().top, built.at(-1).section.getBoundingClientRect().bottom, lineY()));
    const step = stepAtLine();
    if (step === null || step === reportedStep) return;
    reportedStep = step;
    onStepReached(step);
  }

  window.addEventListener('scroll', () => {
    if (isFramePending) return;
    isFramePending = true;
    requestAnimationFrame(report);
  }, { passive: true });

  function scrollTo(step, smoothly) {
    const found = built.find((candidate) => candidate.step === step);
    if (!found) return;
    const top = window.scrollY + found.section.getBoundingClientRect().top - window.innerHeight * ARRIVES_AT_SHARE;
    window.scrollTo({ top, behavior: smoothly ? 'smooth' : 'instant' });
  }

  return {
    showStep(step, { smoothly }) {
      scrollTo(step, smoothly);
    },
    follow(step) {
      if (stepAtLine() !== step) scrollTo(step, false);
      reportedStep = step;
      report();
    },
    figureFor(step) {
      return built.find((candidate) => candidate.step === step)?.section.querySelector('.story-step-figure') ?? null;
    },
    showCurrent(step) {
      for (const { step: sectionStep, section } of built) section.toggleAttribute('data-current', sectionStep === step);
    },
  };
}
