// sprites.js
// Contains the image mapping data
// to fetch pieces of the spritesheets.

(function() {

    Crafty.sprite(1,"images/indicator2.png", {
        indicate:[0,0]
    });

    Crafty.sprite(GLOBAL.tileW, "images/spritesheet.png", {
        // Top left (world objects)
        N_pressurePlateOff: [0, 1],
        N_pressurePlateOn: [1, 1],
        N_leverOff: [0, 2],
        N_leverOn: [1, 2],
        N_chestClosed: [0, 3],
        N_chestOpen: [1, 3],
        N_tallLampOn: [0, 4],
        N_tallLampOff: [1, 4],
        N_shortLampOn: [0, 6],
        N_shortLampOff: [1, 6],
        D_pressurePlateOff: [0 + 7, 1],
        D_pressurePlateOn: [1 + 7, 1],
        D_leverOff: [0 + 7, 2],
        D_leverOn: [1 + 7, 2],
        D_chestClosed: [0 + 7, 3],
        D_chestOpen: [1 + 7, 3],
        D_tallLampOn: [0 + 7, 4],
        D_tallLampOff: [1 + 7, 4],
        D_shortLampOn: [0 + 7, 6],
        D_shortLampOff: [1 + 7, 6],

        // Middle left (fire)
        N_fire: [3, 24],
        D_fire: [3 + 7, 24],

        // Bottom middle left (items)
        N_Flashlight: [1, 44],
        N_Flashlight2: [2, 44],
        N_Lantern: [3, 44],
        N_Blobby: [5, 44],
        N_EvilLampHead: [6, 44],
        N_BlackKey: [1, 45],
        N_Key: [2, 45],
        N_GreenGem: [1, 46],
        N_BlueGem: [2, 46],
        N_RedGem: [3, 46],
        N_Chips: [1, 47],
        N_Plunger: [3, 47],
        N_Broom: [4, 47],
        N_WaterBottle: [1, 48],
        N_Sandwich: [2, 48],
        N_FryingPan: [3, 48],
        N_GreenLollipop: [1, 49],
        N_RedLollipop: [2, 49],
        N_BlueLollipop: [1, 50],
        D_Flashlight: [1 + 7, 44],
        D_Flashlight2: [2 + 7, 44],
        D_Lantern: [3 + 7, 44],
        D_Blobby: [5 + 7, 44],
        D_EvilLampHead: [6 + 7, 44],
        D_BlackKey: [1 + 7, 45],
        D_Key: [2 + 7, 45],
        D_GreenGem: [1 + 7, 46],
        D_BlueGem: [2 + 7, 46],
        D_RedGem: [3 + 7, 46],
        D_Chips: [1 + 7, 47],
        D_Plunger: [3 + 7, 47],
        D_Broom: [4 + 7, 47],
        D_WaterBottle: [1 + 7, 48],
        D_Sandwich: [2 + 7, 48],
        D_FryingPan: [3 + 7, 48],
        D_GreenLollipop: [1 + 7, 49],
        D_RedLollipop: [2 + 7, 49],
        D_BlueLollipop: [1 + 7, 50],

        // Below to right of items (Item glow)
        S_ItemGlow: [10, 51],
        S_Empty: [4, 1],

        // TODO: Finish capitalizing and refactoring names
        N_playerDown: [48, 52],
        N_playerDown2: [48, 53],
        N_playerDown3: [48, 54],
        N_playerDown4: [48, 55],
        D_playerDown: [48 - 13, 52],
        D_playerDown2: [48 - 13, 53],
        D_playerDown3: [48 - 13, 54],
        D_playerDown4: [48 - 13, 55]
    });

    Crafty.sprite(1, "images/spritesheet.png", {
        // Big images
        I_gameOver: [350, 0, 1000, 650],
        I_theEnd: [1000, 0, 1000, 650],

        I_soundSlider: [0, 1475, 227, 24],
        I_backButton: [1375, 1200, 70, 19],
        I_mainLogo: [1350, 1050, 500, 137]
    });

})();