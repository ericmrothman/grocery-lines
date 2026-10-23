import { METHODOLOGY_FIGURES, METHODOLOGY_LINKS, SENSITIVITY_TABLE_FIGURES, figureNames, linkTargets, markdownTags } from './methodology_content.js';

const TABLE_PARTS = Object.freeze(['corner', 'column', 'row', 'cell']);
const STRAY_BRACE = /[{}]/;

function textProblems(text, where, extraFigures = []) {
  if (typeof text !== 'string' || text.trim() === '') return [`${where} needs words`];
  const problems = [];
  for (const name of figureNames(text)) {
    if (!(name in METHODOLOGY_FIGURES) && !extraFigures.includes(name)) problems.push(`${where} names {${name}}, which is not a figure the page knows`);
  }
  if (STRAY_BRACE.test(text.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, ''))) problems.push(`${where} has a { or } that is not part of a {figure}`);
  for (const { label, target } of linkTargets(text)) {
    if (label.trim() === '') problems.push(`${where} has a link with no words to click`);
    if (!(target in METHODOLOGY_LINKS) && !/^https:\/\/\S+$/.test(target)) problems.push(`${where} links to "${target}", which is neither a known link (${Object.keys(METHODOLOGY_LINKS).join(', ')}) nor an https:// address`);
  }
  return problems;
}

function tableProblems(tag, where) {
  if (!tag.isTable) return [`${where} has ${tag.tag}; the only tag the page can show is <SensitivityTable corner="…" column="…" row="…" cell="…" />`];
  return TABLE_PARTS.flatMap((part) => (tag.attributes[part] === undefined ? [`The <SensitivityTable /> in ${where} needs ${part}="…"`] : textProblems(tag.attributes[part], `The <SensitivityTable /> ${part} in ${where}`, SENSITIVITY_TABLE_FIGURES[part])));
}

function markdownProblems(markdown, where) {
  if (typeof markdown !== 'string' || markdown.trim() === '') return [`${where} needs words`];
  const problems = markdownTags(markdown).flatMap((tag) => tableProblems(tag, where));
  const words = markdown.replace(/<[A-Za-z][^>]*>/g, '');
  if (/^#{1,2} /m.test(words) || /^#{4,} /m.test(words)) problems.push(`${where} has a heading the page cannot show: use ### for a subheading (a new section is added with + Section after)`);
  if (/<|>/.test(words.replace(/^\s*>/gm, ''))) problems.push(`${where} has a < or > that is not part of a <SensitivityTable />`);
  if (words.trim() !== '') problems.push(...textProblems(words, where));
  return problems;
}

export function methodologyProblems(methodology) {
  const problems = ['title', 'back', 'returnToMap'].flatMap((key) => textProblems(methodology?.[key], `The page ${key}`));
  if (typeof methodology?.introduction !== 'string') problems.push('The introduction needs to be words, even if blank');
  else if (methodology.introduction.trim() !== '') problems.push(...markdownProblems(methodology.introduction, 'The introduction'));
  const sections = Array.isArray(methodology?.sections) ? methodology.sections : [];
  if (sections.length === 0) problems.push('The page needs at least one section');
  const ids = sections.map((section) => section.sectionId);
  sections.forEach((section, at) => {
    const name = section.heading || `Section ${at + 1}`;
    if (typeof section.sectionId !== 'string' || !/^[a-z][a-z0-9-]*$/.test(section.sectionId)) problems.push(`${name} needs an id of lowercase letters, digits and dashes`);
    else if (ids.indexOf(section.sectionId) !== at) problems.push(`${name} has the same id as an earlier section (${section.sectionId})`);
    problems.push(...textProblems(section.heading, `Section ${at + 1} heading`), ...markdownProblems(section.markdown, name));
  });
  return problems;
}
