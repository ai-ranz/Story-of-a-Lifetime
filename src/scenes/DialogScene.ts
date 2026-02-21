import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TYPEWRITER_SPEED } from '../config';
import { DialogSystem, DialogTree } from '../systems/DialogSystem';
import dialogsVillage from '../data/dialogs/village.json';

const ALL_DIALOGS: Record<string, any> = {
  ...dialogsVillage,
};

export class DialogScene extends Phaser.Scene {
  private dialogSystem!: DialogSystem;
  private worldScene: any;
  private textObj!: Phaser.GameObjects.Text;
  private speakerObj!: Phaser.GameObjects.Text;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private selectedChoice = 0;
  private isTypewriting = false;
  private fullText = '';
  private typewriterTimer?: Phaser.Time.TimerEvent;
  private panelBg!: Phaser.GameObjects.Rectangle;
  private immediateMode = false;

  constructor() {
    super({ key: 'DialogScene' });
  }

  init(data: any): void {
    this.worldScene = data.worldScene;
    this.dialogSystem = new DialogSystem();

    this.dialogSystem.setActionCallback((action: string) => {
      this.worldScene?.onDialogAction?.(action);
    });

    if (data.immediateText) {
      this.immediateMode = true;
      this.fullText = data.immediateText;
    } else if (data.dialogId) {
      this.immediateMode = false;
      const tree = ALL_DIALOGS[data.dialogId] as DialogTree;
      if (tree) {
        this.dialogSystem.start(tree);
      }
    }
  }

  create(): void {
    // Dialog box at bottom of screen
    const boxH = 60;
    const boxY = GAME_HEIGHT - boxH;

    this.panelBg = this.add.rectangle(GAME_WIDTH / 2, boxY + boxH / 2, GAME_WIDTH - 8, boxH, 0x111122, 0.9)
      .setStrokeStyle(1, 0x6666aa);

    this.speakerObj = this.add.text(10, boxY + 4, '', {
      fontSize: '10px', color: '#ffdd44', fontFamily: 'monospace',
    });

    this.textObj = this.add.text(10, boxY + 18, '', {
      fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - 24 },
    });

    if (this.immediateMode) {
      this.speakerObj.setText('');
      this.startTypewriter(this.fullText);
    } else {
      this.showCurrentNode();
    }

    // Input
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => this.onConfirm());
      this.input.keyboard.on('keydown-SPACE', () => this.onConfirm());
      this.input.keyboard.on('keydown-UP', () => this.moveChoice(-1));
      this.input.keyboard.on('keydown-DOWN', () => this.moveChoice(1));
      this.input.keyboard.on('keydown-ESC', () => this.onConfirm());
    }

    // Touch advance
    this.panelBg.setInteractive();
    this.panelBg.on('pointerdown', () => this.onConfirm());
  }

  private showCurrentNode(): void {
    const node = this.dialogSystem.currentNode;
    if (!node) {
      this.closeDialog();
      return;
    }

    this.speakerObj.setText(node.speaker ?? '');
    this.clearChoices();
    this.startTypewriter(node.text);
  }

  private startTypewriter(text: string): void {
    this.fullText = text;
    this.textObj.setText('');
    this.isTypewriting = true;
    let charIndex = 0;

    this.typewriterTimer = this.time.addEvent({
      delay: TYPEWRITER_SPEED,
      callback: () => {
        charIndex++;
        this.textObj.setText(this.fullText.substring(0, charIndex));
        if (charIndex >= this.fullText.length) {
          this.isTypewriting = false;
          this.typewriterTimer?.destroy();
          this.onTypewriterComplete();
        }
      },
      loop: true,
    });
  }

  private onTypewriterComplete(): void {
    if (this.immediateMode) return; // wait for confirm to close

    const node = this.dialogSystem.currentNode;
    if (node?.choices && node.choices.length > 0) {
      this.showChoices(node.choices);
    }
  }

  private showChoices(choices: Array<{ text: string; next: string | null }>): void {
    this.clearChoices();
    this.selectedChoice = 0;

    const startY = GAME_HEIGHT - 58;
    choices.forEach((choice, i) => {
      const txt = this.add.text(GAME_WIDTH / 2 - 100, startY - (choices.length - i) * 16, choice.text, {
        fontSize: '9px',
        color: i === 0 ? '#ffff00' : '#cccccc',
        fontFamily: 'monospace',
        backgroundColor: '#222244',
        padding: { x: 4, y: 2 },
      }).setInteractive();

      txt.on('pointerdown', () => {
        this.selectedChoice = i;
        this.confirmChoice();
      });

      this.choiceTexts.push(txt);
    });
    this.updateChoiceHighlight();
  }

  private updateChoiceHighlight(): void {
    this.choiceTexts.forEach((txt, i) => {
      txt.setColor(i === this.selectedChoice ? '#ffff00' : '#cccccc');
    });
  }

  private moveChoice(dir: number): void {
    if (this.choiceTexts.length === 0) return;
    this.selectedChoice = (this.selectedChoice + dir + this.choiceTexts.length) % this.choiceTexts.length;
    this.updateChoiceHighlight();
  }

  private onConfirm(): void {
    if (this.isTypewriting) {
      // Skip typewriter
      this.typewriterTimer?.destroy();
      this.textObj.setText(this.fullText);
      this.isTypewriting = false;
      this.onTypewriterComplete();
      return;
    }

    if (this.immediateMode) {
      this.closeDialog();
      return;
    }

    if (this.choiceTexts.length > 0) {
      this.confirmChoice();
      return;
    }

    // Advance dialog
    const continued = this.dialogSystem.advance();
    if (continued) {
      this.showCurrentNode();
    } else {
      this.closeDialog();
    }
  }

  private confirmChoice(): void {
    const continued = this.dialogSystem.choose(this.selectedChoice);
    this.clearChoices();
    if (continued) {
      this.showCurrentNode();
    } else {
      this.closeDialog();
    }
  }

  private clearChoices(): void {
    this.choiceTexts.forEach(t => t.destroy());
    this.choiceTexts = [];
    this.selectedChoice = 0;
  }

  private closeDialog(): void {
    this.typewriterTimer?.destroy();
    this.dialogSystem.end();
    this.scene.stop('DialogScene');
  }
}
