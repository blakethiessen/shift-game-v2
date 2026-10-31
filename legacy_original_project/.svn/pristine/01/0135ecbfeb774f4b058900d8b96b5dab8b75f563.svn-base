// worldObjects.js
// Contains components for entities
// that exist in the world and cannot
// be picked up by the players.

(function() {

    // Parent implementation for all doors. All doors must also implement
    // shouldOpen(), which returns true if the door should open.
    Crafty.c("_Door", {
        playerAtDoor: false,
        // The three variables below are set
        // if the doors are successfully linked.
        connectedRoom: null,
        connectedDoor: null,
        entranceDirection: null,

        // This is the only function that needs
        // to be called outside of this object.
        linkDoorAndInitialize: function(doorList) {
            var thisDoor = this;
            var otherDoor = (function() {
                for (var i = 0; i < doorList.length; i++) {
                    if (doorList[i]._x >= GLOBAL.viewport.w / 2 &&
                        thisDoor._x + GLOBAL.viewport.w / 2 === doorList[i]._x &&
                        thisDoor._y === doorList[i]._y) {
                        return doorList[i];
                    }
                }
                return null;
            })();

            if (otherDoor !== null) {
                otherDoor.entranceDirection = this.entranceDirection;
            }

            // Initialize player collision with the door.
            this.addComponent("Collides")
                .onCollision = function() {
                    this.playerAtDoor = true;
                    if (this.shouldOpen(otherDoor)) {
                        this.loadNextLevel();
                    }
            };

            // If there's additional initialization
            // for a door, create a postInit().
            if (this.postInit !== null)
                this.postInit();
        },

        loadNextLevel: function() {
            switch (this.entranceDirection) {
                case 0:
                    GLOBAL.p1EntrancePosition = [this.connectedDoor[0], this.connectedDoor[1] - GLOBAL.tileW];
                    GLOBAL.p2EntrancePosition = [this.connectedDoor[0] + GLOBAL.viewport.w / 2, this.connectedDoor[1] - GLOBAL.tileW];
                    break;
                case 1:
                    GLOBAL.p1EntrancePosition = [this.connectedDoor[0] + GLOBAL.tileW, this.connectedDoor[1]];
                    GLOBAL.p2EntrancePosition = [this.connectedDoor[0] + GLOBAL.viewport.w / 2 + GLOBAL.tileW, this.connectedDoor[1]];
                    break;
                case 2:
                    GLOBAL.p1EntrancePosition = [this.connectedDoor[0], this.connectedDoor[1] + GLOBAL.tileW];
                    GLOBAL.p2EntrancePosition = [this.connectedDoor[0] + GLOBAL.viewport.w / 2, this.connectedDoor[1] + GLOBAL.tileW];
                    break;
                case 3:
                    GLOBAL.p1EntrancePosition = [this.connectedDoor[0] - GLOBAL.tileW, this.connectedDoor[1]];
                    GLOBAL.p2EntrancePosition = [this.connectedDoor[0] + GLOBAL.viewport.w / 2 - GLOBAL.tileW, this.connectedDoor[1]];
            }

            persistence.addBlobbiesToPersistence();
            persistence.addDimensionTearsToPersistence();

            GLOBAL.currentLevel = level[this.connectedRoom];
            GLOBAL.currentLevelName = this.connectedRoom;

            Crafty("SourceTear").each(function() {
                this.deInitialize();
            });

            Crafty.scene("gameScreen");
        },
        postInit: null
    });

    Crafty.c("Door", {
        init: function() {
                this.addComponent("_Door, PopUpText, Interactable")
                    .setPopUpText("An unlocked door (both players must stand next to it).");
        },
        shouldOpen: function(otherDoor) {
            return (otherDoor !== null &&
                    otherDoor.playerAtDoor &&
                    !GLOBAL.currentlyShifting.value)
        }
    });

    Crafty.c("LockedDoor", {
        doorUnlocked: false,
        init: function() {
            this.addComponent("_Door, PopUpText, Interactable")
                .setPopUpText("The door is locked.");
        },
        shouldOpen: function(otherDoor) {
            return (otherDoor != null &&
                    otherDoor.playerAtDoor &&
                   (this.doorUnlocked || otherDoor.doorUnlocked))
        },
        postInit: function() {
            for (var i = 0; i < GLOBAL.unlockedDoors.length; i++) {
                if (this.connectedDoor === GLOBAL.unlockedDoors[i].connectedDoor && this.connectedRoom === GLOBAL.unlockedDoors[i].connectedRoom) {
                    this.doorUnlocked = true;
                }
            }
        }
    });


    // Note PressureDoor adds LockedDoor as a component.
    Crafty.c("PressureDoor", {
        doorUnlocked: false,
        init: function() {
            this.addComponent("LockedDoor")
                .setPopUpText("The door is locked, but there's no keyhole.");
        }
    });

    Crafty.c("BlackDoor", {
        doorUnlocked: false,
        init: function() {
            this.addComponent("LockedDoor")
                .setPopUpText("An ominous black door. It's locked.");
        }
    });


    Crafty.c("FinalDoors", {
        init: function() {
            this.addComponent("_Door")
                .setPopUpText("The door outside.");
        },
        loadNextLevel: function() {
            flashFX.flash("#FFFFFF", 0.1, 0.06, undefined, currentlyEnding, function() {
                Crafty("Player").each(function() {
                    this.removeComponent("Persist");
                    this.destroy();
                });
            });

            Crafty.e("Delay").delay(function() {
                flashFX.fadeIn("#000000");
                Crafty.unbind("EnterFrame", "lightingFX");
                Crafty.scene("endingScreen");
            }, 2000);
        }
    });

    Crafty.c("WallDoor", {
        init: function() {
            this.addComponent("Collides");
//                .collision([2,2], [23,2], [23,23], [2,23]);
        }
    });

    Crafty.c("Lamp", {
        lightedTiles : [],
        isOn : false,
        connectedObj : null,
        init: function(){
            this.z = 13;
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("A normal-looking lamp. It should be able to turn on and off.");
        },

        linkObjects: function(objList) {
            var thisObj = this;
            function getOtherLamp() {
                for (var i = 0; i < objList.length; i++) {
                    if (thisObj._x < GLOBAL.viewport.w / 2) {
                        if (thisObj._x + GLOBAL.viewport.w / 2 === objList[i]._x &&
                            thisObj._y === objList[i]._y) {
                            return objList[i];
                        }
                    }
                    else {
                        if (thisObj._x === objList[i]._x + GLOBAL.viewport.w / 2 &&
                            thisObj._y === objList[i]._y) {
                            return objList[i];
                        }
                    }
                    unfoundLampNum = i;
                }
//                alert("Cross dimension lamp not found. Lamps cannot be linked.");
                return null;
            }

            this.connectedObj = getOtherLamp();
        },

        //switch lamp
        interact : function() {
            if(!this.isOn) {
                this.isOn = true;
                this.connectedObj.isOn = true;
                lightFX.setStaticLights();
            }
            else {
                this.isOn = false;
                this.connectedObj.isOn = false;
                lightFX.setStaticLights();
            }

            lightFX.loadStaticLights();
            Crafty.trigger("DoLighting");

            persistence.markLampState(this);
        }

    });

    Crafty.c("ChestPressurePlate", {
        touched : false,
        init: function(){
            this.addComponent("Collision, Interactable, PopUpText").onHit("Box", function(obj) {
                if (this.touched === false) {
                    this.touched = true;

                    this.removeComponent("N_pressurePlateOff");
                    this.addComponent("N_pressurePlateOn");
                    GLOBAL.chestPressurePlatesPressed++;

                    if (GLOBAL.chestPressurePlatesPressed === GLOBAL.chestPressurePlatesToPress) {
                        Crafty("Chest").each(function() {
                            MyAudio.playSound("doorUnlocking");
                            this.activate();
                        });
                    }
                }
            }, function() {
                if (this.touched = true) {
                    this.touched = false;
                    this.removeComponent("N_pressurePlateOn");
                    this.addComponent("N_pressurePlateOff");
                    GLOBAL.chestPressurePlatesPressed--;

                    Crafty("Chest").each(function() {
                        MyAudio.playSound("doorLocking");
                        this.deactivate();
                    });
                }
            })
                .setPopUpText("It looks like a pressure plate. It'll need something heavy on it.");
        }
    });

    Crafty.c("DoorPressurePlate", {
        touched: false,
        init: function(){
            this.addComponent("Collision, Interactable, PopUpText").onHit("Box", function(obj) {
                if (this.touched === false) {
                    this.removeComponent("N_pressurePlateOff");
                    this.addComponent("N_pressurePlateOn");

                    Crafty("PressureDoor").each(function() {
                        // If the room contains pressure doors
                        // (has the doorUnlocked attribute), unlock them...
                        if (this.doorUnlocked !== undefined) {
                            MyAudio.playSound("doorUnlocking");
                            this.doorUnlocked = true;
                        }
                    });

                    this.touched = true;
                }
            }, function() {
                this.touched = false;
                this.removeComponent("N_pressurePlateOn");
                this.addComponent("N_pressurePlateOff");

                Crafty("PressureDoor").each(function() {
                    if (this.doorUnlocked !== undefined) {
//                        MyAudio.playSound("doorLocking");
                        this.doorUnlocked = false;
                    }
                });
            })
                .setPopUpText("It looks like a pressure plate. It'll need something heavy on it.");
        }
    });

    Crafty.c("SafePressurePlate", {
        touched : false,
        init: function(){
            this.addComponent("Collision, Interactable, PopUpText").onHit("Box", function(obj) {
                if (this.touched === false) {
                    this.removeComponent("N_pressurePlateOff");
                    this.addComponent("N_pressurePlateOn");

                    GLOBAL.chestPressurePlatesPressed++;

                    this.touched = true;
                }
            }, function() {
                this.touched = false;
                this.removeComponent("N_pressurePlateOn");
                this.addComponent("N_pressurePlateOff");

                GLOBAL.chestPressurePlatesPressed--;
            })
                .setPopUpText("It looks like a pressure plate. It'll need something heavy on it.");
        }
    });

    Crafty.c ("Lever", {
        activated : false,
        init : function(){
            this.addComponent("N_leverOff, Interactable, PopUpText")
                .setPopUpText("A metal lever. It must be connected to something.");
            this.activated = false;
            this.addComponent("Collision").onHit("Player", function(player) {
                if (player.interact == true){
                    if (this.activated == false){
                        this.activated = true;
                        this.addComponent("N_leverOff");
                        this.removeComponent("N_leverOff");
                    }

                    else if (this.activated == true){
                        this.addComponent("N_leverOff");
                        this.removeComponent("N_leverOn");
                        this.activated = false;
                    }

                }})
        },

        interact : function(player, faceDirection) {
            if (this.activated == false){
                this.activated = true;
                MyAudio.playSound("leverOn");
                this.addComponent("N_leverOn");
                this.removeComponent("N_leverOff");

                // Change fire if fire is in level.
                Crafty("Fire1").each(function(){
                    if (this.isOn){this.isOn = false;}
                    this.removeComponent("N_fire");
                    this.addComponent("N_noFire");
                });
                Crafty("Fire2").each(function(){
                    if (!this.isOn){this.isOn = true;}
                    this.removeComponent("N_noFire");
                    this.addComponent("N_fire");
                });

                // Open chest if chests are there.
                Crafty("Chest").each(function() {
                    if (this.opened) {
                        this.deactivate();
                    }
                    else {
                        this.activate();
                    }
                });
            }

            else if (this.activated == true){
                MyAudio.playSound("leverOff");
                this.addComponent("N_leverOff");
                this.removeComponent("N_leverOn");
                this.activated = false;
                Crafty("Fire1").each(function(){
                    //
                    if (!this.isOn){this.isOn = true;}
                    this.removeComponent("N_noFire");
                    this.addComponent("N_fire");
                });
                Crafty("Fire2").each(function(){
                    if (this.isOn){this.isOn = false;}
                    this.removeComponent("N_fire");
                    this.addComponent("N_noFire");
                });

                // Open chest if chests are there.
                Crafty("Chest").each(function() {
                    if (this.opened) {
                        this.deactivate();
                    }
                    else {
                        this.activate();
                    }
                });
            }
        }
    });

    Crafty.c("Box", {
        connectedObj : null,
        init: function() {
            this.z = 7;
            this.addComponent("Collision").collision([1,1], [1,24], [24,24], [24,1]);
        },

        linkObjects: function(objList) {
            var thisObj = this;
            function getOtherBox() {
                for (var i = 0; i < objList.length; i++) {
                    if (thisObj._x < GLOBAL.viewport.w / 2) {
                        if (thisObj._x + GLOBAL.viewport.w / 2 === objList[i]._x &&
                            thisObj._y === objList[i]._y) {
                            return objList[i];
                        }
                    }
                    else {
                        if (thisObj._x === objList[i]._x + GLOBAL.viewport.w / 2 &&
                            thisObj._y === objList[i]._y) {
                            return objList[i];
                        }
                    }
                }
                alert("Linked item not found!");
                return null;
            }

            this.connectedObj = getOtherBox();
        }
    });


    Crafty.c("Hole", {
        init:function(){
            this.addComponent("Collides");
        }
    });

    /**
     * @return {boolean}
     */
    function ShouldChestOpen() {
        var shouldOpen = true;
        Crafty("Lever").each(function(){
            if (!this.activated){shouldOpen = false}
        });
        return shouldOpen;
    }

    Crafty.c ("Chest", {
        opened : false,
        used: false,
        init: function() {
            this.opened = false;
            this.addComponent("N_chestClosed, Collides, Interactable, PopUpText")
                .setPopUpText("A locked chest. There's no keyhole, but there must be a way to open it.");
        },

        activate: function() {
            this.removeComponent("N_chestClosed");
            this.addComponent("N_chestOpen");
            this.opened = true;

            var x = this._x;
            var y = this._y;
            if (!this.used) {
                switch (GLOBAL.currentLevelName) {
                    case "bigEnemiesRoom":
                        Crafty.e("2D, Canvas, N_greenGem, GreenGem, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "chestIntro":
                        Crafty.e("2D, Canvas, Key, N_key, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "crossyRoom":
                        Crafty.e("2D, Canvas, Key, N_key, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "roomOfRooms":
                        Crafty.e("2D, Canvas, Food, N_waterBottle, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "lanternGet":
                        Crafty.e("2D, Canvas, Flashlight3, IN_lantern, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "sadLovelyLamps":
                        Crafty.e("2D, Canvas, Food, N_sandwich, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "safeRoom":
                        Crafty.e("2D, Canvas, BlueGem, N_blueGem, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "spiralCombo":
                        Crafty.e("2D, Canvas, Key, N_key, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "theEyes":
                        Crafty.e("2D, Canvas, Key, N_key, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "threesCompany":
                        Crafty.e("2D, Canvas, Food, N_sandwich, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                    case "tooMany":
                        Crafty.e("2D, Canvas, FlashLight2, IN_blueFlashlight, MapTile")
                            .attr({x: x, y: y + 25, z: 5 });
                        break;
                }
                this.used = true;
            }
        },
        deactivate: function(){
            this.removeComponent("N_chestOpen");
            this.addComponent("N_chestClosed");
            this.opened = false;
        }
    });

    Crafty.c ("SafeLock", {
        init : function(){
            this.addComponent("Interactable, PopUpText").setPopUpText("A secure safe, it's secrets hidden behind a mysterious lock.");
            if (GLOBAL.safePressurePlatesPressed >= 2) {
                var x = this._x;
                var y = this._y;
                Crafty.e("2D, Canvas, N_redGem, RedGem")
                    .attr({x: x, y: y + 25});
            }
        }
    });

    // BrokenLamp:  “This is a lamp. It’s broken”
    Crafty.c ("BrokenLamp", {
        PopUpText : " ",
        beingUsed : false,
        isOn : false,
        init: function() {
            this.addComponent("Interactable, PopUpText").setPopUpText("A lamp, but it appears to be broken.");
        },
        linkObjects: function() {
        },
        interact: function() {
        }
    });

    Crafty.c ("_Fire", {
        target : null,
        DMG_FREQUENCY: 1000,
        DAMAGE: .5,
        init: function() {
            // fire sfx will play in the level.
            this.addComponent("HasTarget, Animated, Collision, FireHalo");

            var delayer = Crafty.e("2D, Delay");

            if (Math.random() > .5) {
                this.setAnimation(this.animation.fire1);
                this.playLoopAnimation(this.animation.fire1, 20);
            }
            else {
                this.setAnimation(this.animation.fire2);
                this.playLoopAnimation(this.animation.fire2, 20);
            }

            function dealRepeatedDmg() {
                delayer.delay(function() {
                    if (this.isOn && this.hit(this.target)) {
                        this.target.takeDamage(this.DAMAGE);
                        dealRepeatedDmg();
                    }
                }, this.DMG_FREQUENCY);
            }

            this.bind("PlayerMoving", function() {
                //if fire is on
                if (this.isOn && this.hit(this.target)) {
                    this.target.takeDamage(this.DAMAGE);
                    delayer.delay(function() {
                        dealRepeatedDmg();
                    }, this.DMG_FREQUENCY);
                }
            });
        }
    });

    Crafty.c ("Fire1", {
        isOn: true,
        init: function(){
            this.addComponent("_Fire, N_fire");
        }
    });

    Crafty.c ("Fire2", {
        isOn: false,
        init: function(){
            this.addComponent("_Fire, N_noFire");
        }
    });

    Crafty.c ("GemStatue", {
        hasRedGem: false,
        hasBlueGem: false,
        hasGreenGem: false,
        interactText : "A tall, majestic statue. It has 3 gem-shaped slots in its base.",
        gemInserted: false,
        init: function() {
            this.addComponent("Interactable, PopUpText, Collides")
                .setPopUpText(this.interactText);
        },
        updatePopUp: function() {
            var text = this.interactText;
            if (this.hasRedGem) {
                text = text + " A red gem is inserted.";
            }
            if (this.hasBlueGem) {
                text = text + " A blue gem is inserted.";
            }
            if (this.hasGreenGem) {
                text = text + " A green gem is inserted.";
            }
            this.setPopUpText(text);
            if (this.hasRedGem && this.hasBlueGem && this.hasGreenGem) {

                Crafty.e("Canvas, 2D, N_blackKey, BlackKey").attr({
                    x:this._x,
                    y:this._y - GLOBAL.tileW
                });
            }
        }
    });

})();