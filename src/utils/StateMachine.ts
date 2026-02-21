export interface StateConfig {
  enter?: () => void;
  exit?: () => void;
  update?: (dt: number) => void;
}

export class StateMachine {
  private states: Map<string, StateConfig> = new Map();
  private currentState: string | null = null;

  addState(name: string, config: StateConfig): this {
    this.states.set(name, config);
    return this;
  }

  transition(newState: string): void {
    if (!this.states.has(newState)) {
      console.warn(`StateMachine: unknown state "${newState}"`);
      return;
    }
    if (this.currentState) {
      this.states.get(this.currentState)?.exit?.();
    }
    this.currentState = newState;
    this.states.get(newState)?.enter?.();
  }

  update(dt: number): void {
    if (this.currentState) {
      this.states.get(this.currentState)?.update?.(dt);
    }
  }

  get current(): string | null {
    return this.currentState;
  }
}
