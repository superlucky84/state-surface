declare module 'idiomorph' {
  export interface IdiomorphCallbacks {
    beforeNodeMorphed?(oldNode: Node, newNode: Node): boolean | void;
    beforeNodeRemoved?(node: Node): boolean | void;
    afterNodeAdded?(node: Node): void;
  }
  export const Idiomorph: {
    morph(
      target: Element,
      content: string | Node | Node[],
      config?: {
        morphStyle?: 'innerHTML' | 'outerHTML';
        ignoreActiveValue?: boolean;
        restoreFocus?: boolean;
        callbacks?: IdiomorphCallbacks;
      }
    ): Node[];
  };
}
