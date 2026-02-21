export type DialogActionCallback = (action: string) => void;

export interface DialogNode {
  speaker: string;
  text: string;
  choices?: Array<{ text: string; next: string | null; action?: string }>;
  action?: string;
  next?: string | null;
}

export interface DialogTree {
  id: string;
  nodes: Record<string, DialogNode>;
}

export class DialogSystem {
  private tree: DialogTree | null = null;
  private currentNodeId: string | null = null;
  private actionCallback: DialogActionCallback = () => {};

  get active(): boolean {
    return this.tree !== null && this.currentNodeId !== null;
  }

  get currentNode(): DialogNode | null {
    if (!this.tree || !this.currentNodeId) return null;
    return this.tree.nodes[this.currentNodeId] ?? null;
  }

  setActionCallback(cb: DialogActionCallback): void {
    this.actionCallback = cb;
  }

  start(tree: DialogTree): void {
    this.tree = tree;
    this.currentNodeId = 'start';
  }

  /** Advance with no choice (linear next). */
  advance(): boolean {
    const node = this.currentNode;
    if (!node) return false;

    // Execute action if present
    if (node.action) {
      this.actionCallback(node.action);
    }

    if (node.choices && node.choices.length > 0) {
      // Can't auto-advance when choices are present
      return true;
    }

    if (node.next === null || node.next === undefined) {
      this.end();
      return false;
    }

    this.currentNodeId = node.next;
    return true;
  }

  /** Choose a branch from the current node's choices. */
  choose(choiceIndex: number): boolean {
    const node = this.currentNode;
    if (!node?.choices || choiceIndex >= node.choices.length) return false;

    const choice = node.choices[choiceIndex];

    // Execute choice action if present
    if (choice.action) {
      this.actionCallback(choice.action);
    }

    if (choice.next === null) {
      this.end();
      return false;
    }

    this.currentNodeId = choice.next;
    return true;
  }

  end(): void {
    this.tree = null;
    this.currentNodeId = null;
  }
}
