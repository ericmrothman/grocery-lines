export function inspectorViewModel(focus, { placeCardFor }) {
  switch (focus.kind) {
    case 'rest':
      return { kind: 'rest' };
    case 'audit': {
      const card = placeCardFor(focus.placeId);
      return card ? { kind: 'audit', card } : { kind: 'rest' };
    }
    default:
      throw new Error(`Unknown focus: ${focus.kind}`);
  }
}
