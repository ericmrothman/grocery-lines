import { methodologyWords } from './methodology_content.js';
import { element } from '../shared/dom.js';

const MARKED_PHRASE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^)\s]+\))/;

const LINKED_PHRASE = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/;

function textWithMarkedPhrases(text) {
  return text.split(MARKED_PHRASE).filter(Boolean).map((piece) => {
    if (piece.startsWith('**') && piece.endsWith('**')) return element('strong', {}, textWithMarkedPhrases(piece.slice(2, -2)));
    if (piece.startsWith('`') && piece.endsWith('`')) return element('code', { text: piece.slice(1, -1) });
    const link = piece.match(LINKED_PHRASE);
    if (link) return element('a', { className: 'source-link', attributes: { href: link[2], target: '_blank', rel: 'noopener noreferrer' } }, textWithMarkedPhrases(link[1]));
    return document.createTextNode(piece);
  });
}

function table(block) {
  return element('div', { className: 'methodology-table-frame' }, [
    element('table', { className: 'methodology-table' }, [
      element('thead', {}, [element('tr', {}, block.columns.map((column) => element('th', { text: column, attributes: { scope: 'col' } })))]),
      element('tbody', {}, block.rows.map((row) => element('tr', {}, row.map((cell) => element('td', {}, textWithMarkedPhrases(cell)))))),
    ]),
  ]);
}

function methodologyBlock(block) {
  if (block.kind === 'subheading') return element('h3', { className: 'methodology-subheading', text: block.text });
  if (block.kind === 'bulletList') return element('ul', { className: 'methodology-list' }, block.items.map((item) => element('li', {}, textWithMarkedPhrases(item))));
  if (block.kind === 'numberedList') return element('ol', { className: 'methodology-list', attributes: block.start === 1 ? {} : { start: String(block.start) } }, block.items.map((item) => element('li', {}, textWithMarkedPhrases(item))));
  if (block.kind === 'table') return table(block);
  return element('p', {}, textWithMarkedPhrases(block.text));
}

function sectionHeading(sectionId, text) {
  return element('h2', { className: 'section-heading', text, attributes: { id: sectionId, tabindex: '-1' } });
}

function methodologySection(section) {
  return element('section', { className: 'methodology-section' }, [sectionHeading(section.sectionId, section.heading), ...section.blocks.map(methodologyBlock)]);
}

export function methodologyView(container, { method, inputs, onBack, definition }) {
  container.replaceChildren();
  const words = methodologyWords(method, inputs, definition);
  const body = [
    element('header', { className: 'methodology-hero' }, [element('h1', { text: words.title })]),
    ...words.introduction.map((paragraph) => element('p', { className: 'methodology-lead' }, textWithMarkedPhrases(paragraph))),
    ...words.sections.map(methodologySection),
  ];
  if (!onBack) {
    container.append(...body);
    return;
  }
  const back = element('button', { className: 'link-button', text: words.back, attributes: { type: 'button' } });
  back.addEventListener('click', onBack);
  const returnToMap = element('button', { className: 'methodology-return-button', text: words.returnToMap, attributes: { type: 'button' } });
  returnToMap.addEventListener('click', onBack);
  container.append(back, ...body, element('footer', { className: 'methodology-footer' }, [returnToMap]));
}
