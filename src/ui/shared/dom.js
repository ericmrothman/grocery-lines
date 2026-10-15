export function element(tag, options = {}, children = []) {
  const created = document.createElement(tag);
  if (options.className) created.className = options.className;
  if (options.text !== undefined) created.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) created.setAttribute(name, value);
  created.append(...children.filter(Boolean));
  return created;
}

export function withStrongPhrases(text, page = globalThis.document) {
  return text.split(/(\*\*[^*]+\*\*)/).filter((piece) => piece !== '').map((piece) => {
    if (!piece.startsWith('**')) return page.createTextNode(piece);
    const strong = page.createElement('strong');
    strong.textContent = piece.slice(2, -2);
    return strong;
  });
}
