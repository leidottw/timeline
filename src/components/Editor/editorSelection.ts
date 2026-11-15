export type EditorSelection =
  | { type: 'new-storyline' }
  | { type: 'storyline'; storylineId: string }
  | { type: 'new-node'; storylineId: string }
  | { type: 'node'; storylineId: string; nodeId: string }
