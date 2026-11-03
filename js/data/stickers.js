// Collectible stickers: one from each daily treasure chest, or buy with coins.
const RAW = [
  ['🦁', 'Lion'], ['🐯', 'Tiger'], ['🐼', 'Panda'], ['🐨', 'Koala'], ['🦊', 'Fox'], ['🐸', 'Frog'], ['🐵', 'Monkey'],
  ['🦄', 'Unicorn'], ['🐲', 'Dragon'], ['🦖', 'T-Rex'], ['🦕', 'Dino'], ['🐙', 'Octopus'], ['🦈', 'Shark'], ['🐬', 'Dolphin'],
  ['🐳', 'Whale'], ['🦉', 'Owl'], ['🦅', 'Eagle'], ['🐧', 'Penguin'], ['🦩', 'Flamingo'], ['🐢', 'Turtle'], ['🦥', 'Sloth'],
  ['🦦', 'Otter'], ['🐝', 'Bee'], ['🦋', 'Butterfly'], ['🐞', 'Ladybug'], ['🦔', 'Hedgehog'], ['🐇', 'Bunny'], ['🐕', 'Puppy'],
  ['🐈', 'Kitty'], ['🦒', 'Giraffe'], ['🐘', 'Elephant'], ['🦓', 'Zebra'], ['🦘', 'Kangaroo'], ['🦜', 'Parrot'], ['🐻', 'Bear'],
  ['🚀', 'Rocket'], ['🛸', 'UFO'], ['🌋', 'Volcano'], ['🌈', 'Rainbow'], ['⚡', 'Lightning'], ['🔥', 'Fire'], ['❄️', 'Snowflake'],
  ['🏰', 'Castle'], ['🗽', 'Statue of Liberty'], ['🎡', 'Ferris Wheel'], ['🎢', 'Roller Coaster'], ['🏈', 'Football'], ['🏀', 'Basketball'],
  ['⚾', 'Baseball'], ['🛹', 'Skateboard'], ['🎸', 'Guitar'], ['🎮', 'Game Controller'], ['🍩', 'Donut'], ['🌮', 'Taco'], ['🍔', 'Burger'],
  ['🌭', 'Hot Dog'], ['🧁', 'Cupcake'], ['🍦', 'Ice Cream'], ['🍿', 'Popcorn'], ['🥞', 'Pancakes'], ['👑', 'Crown'], ['💎', 'Diamond'],
  ['🏆', 'Trophy'], ['🤖', 'Robot'], ['👽', 'Alien'], ['🧙', 'Wizard'], ['🦸', 'Superhero'], ['🥷', 'Ninja'], ['🏴‍☠️', 'Pirate Flag'], ['🪐', 'Planet'],
];
export const STICKERS = RAW.map(([e, name], i) => ({ id: 'st' + i, e, name }));
export const STICKER_PRICE = 40;
