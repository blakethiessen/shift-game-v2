// items.js
// Contains component definitions for
// all pickupable entities.

// All items that are destroyed upon usage return true;

(function() {

    function getFrontTile(player, dir) {
        var matrix;
        if (GLOBAL.evilOnLeft) {
            if (objInLeftSide(player))
                matrix = GLOBAL.curLevel.dangerousTileMatrix;
            else
                matrix = GLOBAL.curLevel.neutralTileMatrix;
        }
        else {
            if (objInLeftSide(player))
                matrix = GLOBAL.curLevel.neutralTileMatrix;
            else
                matrix = GLOBAL.curLevel.dangerousTileMatrix;
        }
        
        var playerCoord = getTileCoord(player);

        switch (dir) {
            case GLOBAL.direction.up:
                return matrix[playerCoord._x][playerCoord._y - 1];
            case GLOBAL.direction.upRight:
                return matrix[playerCoord._x][playerCoord._y - 1];
            case GLOBAL.direction.right:
            case GLOBAL.direction.downRight:
                return matrix[playerCoord._x + 1][playerCoord._y];
            case GLOBAL.direction.down:
            case GLOBAL.direction.downLeft:
                return matrix[playerCoord._x][playerCoord._y + 1];
            case GLOBAL.direction.left:
            case GLOBAL.direction.upLeft:
                return matrix[playerCoord._x - 1][playerCoord._y];
        }
    }

    function attackTearIfPresent(player ,dir) {
        var frontTile = getFrontTile(player, dir);
        for (var i = 0; i < frontTile.other.length; i++) {
            if ((GLOBAL.evilOnLeft && objInLeftSide(player)) ||
                (!GLOBAL.evilOnLeft && !objInLeftSide(player))) {
                if (frontTile.other[i].has("Tear")) {
                    frontTile.other[i].linkedTear.reduceSize();
                    break;
                }
            }
            else if (frontTile.other[i].has("SourceTear")) {
                frontTile.other[i].reduceSize();
                break;
            }
        }
    }

    // Item interface definition
    Crafty.c ("Item", {
        init: function() {
            this.addComponent("Interactable, PopUpText");

            this.primaryType = null;
        }
    });

    // Broom - Attacks with broom or picks it up, attacking pushes monster back around 3 tiles
    // "useful for sweeping or keeping monsters at bay"
    Crafty.c("Broom", {
        PopUpText : " ",
        beingUsed : false,
        init: function() {
            this.addComponent("Item").setPopUpText("A sturdy broom");
            this.primaryType = "Broom";
        },
        use: function(player, dir){
            if (player.timer === 0) {
                this.beingUsed = true;
                playAttackSound();
                player.timer = 30;
                player.action = "broom";
                player.setPlayerActionAnimation();

                attackTearIfPresent(player, dir);
            }
        }
    });

    // FryingPan - Attacks with frying pan or picks it up, attacking pushes monster back around 3 tiles
    // "A frying pan, used mainly for hitting things"
    Crafty.c ("FryingPan", {
        PopUpText : " ",
        beingUsed : false,
        init: function() {
            this.addComponent("Item").setPopUpText("A frying pan, used mainly for hitting things");
            this.primaryType = "FryingPan";
        },
        use: function(player, dir){
            if (player.timer === 0) {
                this.beingUsed = true;
                playAttackSound();
                player.timer = 30;
                player.action = "fryingPan";
                player.setPlayerActionAnimation();

                attackTearIfPresent(player, dir);
            }
        }
    });

    // Plunger - Attacks with plunger or picks it up, attacking pushes monster back around 3 tiles
    // "A sturdy plunger, great for plunging toilets"
    Crafty.c ("Plunger", {
        PopUpText : " ",
        beingUsed : false,
        init: function() {
            this.addComponent("Item").setPopUpText("A sturdy plunger, great for plunging toilets");
            this.primaryType = "Plunger";
        },
        use: function(player, dir) {
            if (player.timer === 0) {
                this.beingUsed = true;
                playAttackSound();
                player.timer = 30;
                player.action = "plunger";
                player.setPlayerActionAnimation();

                attackTearIfPresent(player, dir);
            }
        }
    });

    function playAttackSound()
    {
        MyAudio.playSound("weaponSwoosh");
    }

    Crafty.c("Key", {
        init: function() {
            this.addComponent("Item").setPopUpText("This could unlock a door.");
            this.primaryType = "Key";
        },
        use: function(player, dir, interactingObject) {
            if (interactingObject !== null && interactingObject.has("LockedDoor") && !interactingObject.doorUnlocked) {
                MyAudio.playSound("doorUnlocking");
                interactingObject.doorUnlocked = true;
                interactingObject.setPopUpText("The door is unlocked!");

                GLOBAL.unlockedDoors.push(interactingObject);
                persistence.markDoorAsUnlocked(interactingObject);

                return true;
            }
        }
    });

    Crafty.c("BlackKey", {
        init: function() {
            this.addComponent("Item").setPopUpText("This looks like it could unlock the front door.");
            this.primaryType = "BlackKey";
        },
        use: function(player, dir, interactingObject) {
            if (interactingObject !== null && interactingObject.has("BlackDoor") && !interactingObject.doorUnlocked) {
                MyAudio.playSound("doorUnlocking");
                interactingObject.doorUnlocked = true;
                interactingObject.setPopUpText("The black door is unlocked!");

                GLOBAL.unlockedDoors.push(interactingObject);
                persistence.markDoorAsUnlocked(interactingObject);

                return true;
            }
        }
    });

    // Gem - These sit in your inventory, you need to give three of them to the statue to get the black key (The thing with GemStatue)
    Crafty.c ("GreenGem", {
        PopUpText : " ",
        beingUsed : false,
        init: function() {
            this.addComponent("Item").setPopUpText("Green Gem.");
            this.primaryType = "GreenGem";
        },
        use: function(player, dir, interactingObject) {
            if (interactingObject !== null && interactingObject.has("GemStatue")) {
                MyAudio.playSound("doorUnlocking");
                interactingObject.hasGreenGem = true;
                interactingObject.updatePopUp();
                return true;
            }
        }
    });

    Crafty.c ("BlueGem", {
        PopUpText : " ",
        beingUsed : false,
        init: function() {
            this.addComponent("Item").setPopUpText("Blue Gem.");
            this.primaryType = "BlueGem";
        },
        use: function(player, dir, interactingObject) {
            if (interactingObject !== null && interactingObject.has("GemStatue")) {
                MyAudio.playSound("doorUnlocking");
                interactingObject.hasBlueGem = true;
                interactingObject.updatePopUp();
                return true;
            }
        }

    });

    Crafty.c ("RedGem", {
        PopUpText : " ",
        beingUsed : false,
        init: function() {
            this.addComponent("Item").setPopUpText("Red Gem.");
            this.primaryType = "RedGem";
        },
        use: function(player, dir, interactingObject) {
            if (interactingObject !== null && interactingObject.has("GemStatue")) {
                MyAudio.playSound("doorUnlocking");
                interactingObject.hasRedGem = true;
                interactingObject.updatePopUp();
                return true;
            }
        }

    });

    // Food
    Crafty.c("_Food", {       // engine
        HpRecovery : 1.5,     // variable (all)
        init: function() {
            this.addComponent("Item");
        },

        use : function(player,dir){
            flashFX.flash("Green", .1, .05, .5);
            player.heal(this.HpRecovery);
            MyAudio.playSound("eatingFood");
            // Destroy food after use.
            return true;
            //put health recovery animation and other things...
        }
    });

    Crafty.c("Chips", {
        init: function() {
            this.addComponent("_Food").setPopUpText("A bag of chips. 0 trans fats.");
            this.primaryType = "Chips";
        }
    });

    Crafty.c("WaterBottle", {
        init: function() {
            this.addComponent("_Food").setPopUpText("A lukewarm water bottle.");
            this.primaryType = "WaterBottle";
        }
    });

    Crafty.c("Sandwich", {
        init: function() {
            this.addComponent("_Food").setPopUpText("A prepackaged turkey sandwich. Still sealed.");
            this.primaryType = "Sandwich";
        }
    });

    Crafty.c("Lollipop", {
        init: function() {
            this.addComponent("_Food").setPopUpText("A round little lollipop.");
            this.primaryType = "Lollipop";
        }
    });

    // FlashLight-main
    Crafty.c("Flashlight", {
        lightedTiles : [],
        range : 200,
        init: function() {
            this.addComponent("Item")
                .setPopUpText("A flashlight. Useful for lighting up dark areas.");
            this.primaryType = "Flashlight";
        },
        flashlight11 : function() {
            lightFX.createLightCone(GLOBAL.player1._x + GLOBAL.player1._w / 2, GLOBAL.player1._y + GLOBAL.player1._h /2, GLOBAL.player1.flashLightDir, 150);

        },
        flashlight12 : function() {
            lightFX.createLightCone(GLOBAL.player2._x + GLOBAL.player2._w / 2, GLOBAL.player2._y + GLOBAL.player2._h /2, GLOBAL.player2.flashLightDir, 150);

        },
        use: function(player, dir) {
            MyAudio.playSound("flashlightOnOff");

            if (player == GLOBAL.player1)
            {
                if (!GLOBAL.player1.isActivated) {
                    GLOBAL.player1.isActivated = true;
                    // TODO: Change this to look at the player input.
                    Crafty.bind("DoLighting", this.flashlight11);
                }
                else {
                    GLOBAL.player1.isActivated = false;
                    console.log('unbind');
                    Crafty.unbind("DoLighting", this.flashlight11);
                }
            }
            if (player == GLOBAL.player2) {
                if (!GLOBAL.player2.isActivated) {
                    GLOBAL.player2.isActivated = true;
                    // TODO: Change this to look at the player input.
                    Crafty.bind("DoLighting", this.flashlight12);
                }
                else {
                    GLOBAL.player2.isActivated = false;
                    console.log('unbind');
                    Crafty.unbind("DoLighting", this.flashlight12);
                }
            }

            lightFX.loadStaticLights();
            Crafty.trigger("DoLighting");
        },
        turnOff : function(player) {
            if (player == GLOBAL.player1)
            {
                GLOBAL.player1.isActivated = false;
                console.log('unbind');
                Crafty.unbind("DoLighting", this.flashlight11);
            }
            if (player == GLOBAL.player2) {
                GLOBAL.player2.isActivated = false;
                console.log('unbind');
                Crafty.unbind("DoLighting", this.flashlight12);
            }

            lightFX.loadStaticLights();
            Crafty.trigger("DoLighting");
        }
    });

    // FlashLight2

    Crafty.c("Flashlight2", {
        lightedTiles : [],
        range1 : 300,

        flashlight21 : function() {
            lightFX.createLightCone(GLOBAL.player1._x + GLOBAL.player1._w / 2, GLOBAL.player1._y + GLOBAL.player1._h /2, GLOBAL.player1.direction, 350);

        },
        flashlight22 : function() {
            lightFX.createLightCone(GLOBAL.player2._x + GLOBAL.player2._w / 2, GLOBAL.player2._y + GLOBAL.player2._h /2, GLOBAL.player2.direction, 350);

        },
        init: function() {
            this.addComponent("Item")
                .setPopUpText("A brighter flashlight. Useful for lighting up dark areas.");
            this.primaryType = "Flashlight2";
        },
        use: function(player, dir) {

            MyAudio.playSound("flashlightOnOff");

            if (player == GLOBAL.player1)
            {
                if (!GLOBAL.player1.isActivated) {
                    GLOBAL.player1.isActivated = true;
                    // TODO: Change this to look at the player input.
                    Crafty.bind("DoLighting", this.flashlight21);
                }
                else {
                    GLOBAL.player1.isActivated = false;
                    console.log('unbind');
                    Crafty.unbind("DoLighting", this.flashlight21);
                }
            }
            if (player == GLOBAL.player2) {
                if (!GLOBAL.player2.isActivated) {
                    GLOBAL.player2.isActivated = true;
                    // TODO: Change this to look at the player input.
                    Crafty.bind("DoLighting", this.flashlight22);
                }
                else {
                    GLOBAL.player2.isActivated = false;
                    console.log('unbind');
                    Crafty.unbind("DoLighting", this.flashlight22);
                }
            }

            lightFX.loadStaticLights();
            Crafty.trigger("DoLighting");
        },
        setLightDir : function(dir){
            this.dir = dir;
        },

        turnOff : function(player) {
            if (player == GLOBAL.player1)
            {
                GLOBAL.player1.isActivated = false;
                console.log('unbind');
                Crafty.unbind("DoLighting", this.flashlight21);
            }
            if (player == GLOBAL.player2) {
                GLOBAL.player2.isActivated = false;
                console.log('unbind');
                Crafty.unbind("DoLighting", this.flashlight22);
            }

            lightFX.loadStaticLights();
            Crafty.trigger("DoLighting");
        }
    });
    // Lantern
    Crafty.c("Lantern", {
        lightedTiles : [],

        flashlight31 : function() {
            lightFX.createLightCircle(GLOBAL.player1._x + GLOBAL.player1._w / 2, GLOBAL.player1._y + GLOBAL.player1._h /2, 175);

        },
        flashlight32 : function() {
            lightFX.createLightCircle(GLOBAL.player2._x + GLOBAL.player2._w / 2, GLOBAL.player2._y + GLOBAL.player2._h /2, 175);

        },
        init: function() {
            this.addComponent("Item")
                .setPopUpText("A lantern, useful for seeing around you.");
            this.primaryType = "Flashlight3";
        },
        use: function(player, dir) {

            MyAudio.playSound("flashlightOnOff");

            if (player == GLOBAL.player1)
            {
                if (!GLOBAL.player1.isActivated) {
                    GLOBAL.player1.isActivated = true;
                    // TODO: Change this to look at the player input.
                    Crafty.bind("DoLighting", this.flashlight31);
                }
                else {
                    GLOBAL.player1.isActivated = false;
                    console.log('unbind');
                    Crafty.unbind("DoLighting", this.flashlight31);
                }
            }
            if (player == GLOBAL.player2) {
                if (!GLOBAL.player2.isActivated) {
                    GLOBAL.player2.isActivated = true;
                    // TODO: Change this to look at the player input.
                    Crafty.bind("DoLighting", this.flashlight32);
                }
                else {
                    GLOBAL.player2.isActivated = false;
                    console.log('unbind');
                    Crafty.unbind("DoLighting", this.flashlight32);
                }
            }

            lightFX.loadStaticLights();
            Crafty.trigger("DoLighting");
        },

        turnOff : function(player) {
            if (player == GLOBAL.player1)
            {
                GLOBAL.player1.isActivated = false;
                console.log('unbind');
                Crafty.unbind("DoLighting", this.flashlight31);
            }
            if (player == GLOBAL.player2) {
                GLOBAL.player2.isActivated = false;
                console.log('unbind');
                Crafty.unbind("DoLighting", this.flashlight32);
            }

            lightFX.loadStaticLights();
            Crafty.trigger("DoLighting");
        },
        setLightDir : function(dir){
            this.dir = dir;
        }
    });
})();