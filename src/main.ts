import Phaser from 'phaser';
import { phaserConfig } from './config';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { ClassSelectScene } from './scenes/ClassSelectScene';
import { WorldScene } from './scenes/WorldScene';
import { HUDScene } from './scenes/HUDScene';
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
    GameOverScene,
    ChapterCompleteScene,
  ],
};

new Phaser.Game(config);
