import Phaser from 'phaser';
import { phaserConfig } from './config';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { ClassSelectScene } from './scenes/ClassSelectScene';
import { WorldScene } from './scenes/WorldScene';
import { HUDScene } from './scenes/HUDScene';
import { DialogScene } from './scenes/DialogScene';
import { CombatScene } from './scenes/CombatScene';
import { InventoryScene } from './scenes/InventoryScene';
import { GameOverScene } from './scenes/GameOverScene';
import { ChapterCompleteScene } from './scenes/ChapterCompleteScene';

const config: Phaser.Types.Core.GameConfig = {
  ...phaserConfig,
  scene: [
    BootScene,
    MainMenuScene,
    ClassSelectScene,
    WorldScene,
    HUDScene,
    DialogScene,
    CombatScene,
    InventoryScene,
    GameOverScene,
    ChapterCompleteScene,
  ],
};

new Phaser.Game(config);
