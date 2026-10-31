//gameScene.js
//Contains the scene in
//which the game is played.
//Level initializations and
//room-switching occurs here.

(function() {

    Crafty.scene("gameScreen", function() {
        // When the first level is loaded, initialize everything in here.
        if (GLOBAL.firstLevel) {
            MyAudio.stop("start");

            // CHANGE LEVEL HERE -------------------------------------------------------->
            GLOBAL.currentLevel = level.spawnRoom;
            GLOBAL.currentLevelName = "spawnRoom";
            // CHANGE LEVEL HERE -------------------------------------------------------->
            GLOBAL.evilOnLeft = false;
            GLOBAL.unlockedDoors = [];
            GLOBAL.roomsEntered = 0;

            persistence.initialize();

            GLOBAL.p1EntrancePosition = [GLOBAL.viewport.w / 4 - GLOBAL.tileW, GLOBAL.viewport.h / 2];
            GLOBAL.p2EntrancePosition = [GLOBAL.viewport.w / 4 * 3 - GLOBAL.tileW, GLOBAL.viewport.h / 2];

            flashFX.initialize();
            lightFX.initialize();
            var player1 = Crafty.e("2D, Canvas, Player, Persist, LightHalo")
                .attr({x: 0, w: GLOBAL.tileW, h: GLOBAL.tileW, z: 10, path : [{_x:0,_y:0}]})
                .player(1)
                .collision([3,3], [22,3], [22,22], [3,22]);

            var player2 = Crafty.e("2D, Canvas, Player, Persist, LightHalo")
                .attr({x: GLOBAL.viewport.w / 2, w: GLOBAL.tileW * GLOBAL.delta, h: GLOBAL.tileW * GLOBAL.delta, z: 10, path : [{_x:0,_y:0}]})
                .player(2)
                .collision([3,3], [22,3], [22,22], [3,22]);

            player1.otherPlayer = player2;
            player2.otherPlayer = player1;

            // INSTANTIATE TEST OBJECTS HERE!------------------------------------------------------>
            // STOP INSTANTIATING TEST OBJECTS HERE!----------------------------------------------->

            // Is lighting on or off.
            var lightingOn = true;

            // Bind Dimension switch to key.
            MyAudio.unbindMute();

            player1.bind("KeyDown", function(e) {
                if (e.key == GLOBAL.commonKeys.SwitchDimensions && !GLOBAL.currentlyShifting.value
                    && !Crafty.isPaused()) {
                    GLOBAL.currentlyShifting.value = true;
                    MyAudio.playSound("shift");

                    flashFX.flash("#FFFFFF", 0.1, 0.06, undefined, GLOBAL.currentlyShifting, function() {
                        switchDimensions(player1, player2);

                        GLOBAL.evilOnLeft = !GLOBAL.evilOnLeft;

                        Crafty.trigger("Shift", null);
                    });
                }
                // pause game
                else if (e.key === GLOBAL.commonKeys.Pause) {
                    Crafty.pause();

                    if (Crafty.isPaused()) {
                        lightFX.darkenScreen();

                        if (!Crafty.audio.muted) {
                            Crafty.audio.toggleMute();
                        }
                    }
                    else if (!Crafty.isPaused()) {
                        lightFX.lightenScreen();
                        Crafty.trigger("PlayerMoving");

                        if (Crafty.audio.muted && !MyAudio.isManuallyMuted()) {
                            Crafty.audio.toggleMute();
                        }
                    }
                }
                // debug key, for light
                else if (e.key == Crafty.keys['Y']) {
                    if (lightingOn) {
                        lightFX.hideCanvas();
                        lightingOn = false;
                    }
                    else {
                        lightFX.showCanvas();
                        lightingOn = true;
                    }
                }
                // debug key, delivers damage from blobby
                else if (e.key === Crafty.keys['T']) {
                    GLOBAL.player1.takeDamage(.9);
                }
                else {
                    // Already checks for key usage.
                    MyAudio.toggleMute(e);
                }
            });
            flashFX.fadeIn("#000000");

            MyAudio.stop(GLOBAL.currentBGM);
            MyAudio.startMusic();

            GLOBAL.firstLevel = false;
        }

        Crafty("Blobby").each(function () {
            this.destroy();
        });

        Crafty.audio.stop("fire");

        GLOBAL.roomsEntered++;
        GLOBAL.chestPressurePlatesPressed = 0;
        GLOBAL.chestPressurePlatesToPress = 0;
        GLOBAL.unlockedDoors = [];

        generateRoom();

        lightFX.loadStaticLights();

        Crafty.bind("PlayerMoving", function lightingFX() {
            lightFX.loadStaticLights();
            Crafty.trigger("DoLighting");
        });

//        lightFX.createShadows(player1._x, player1._y, 150);
        if (GLOBAL.evilOnLeft) {
            switchDimensions(player1, player2);
        }

        //set target of objects that have target
        Crafty("HasTarget").each(function() {
            this.resetRoom();
            this.resetTarget();
            this.setRoomMatrix();
        });
        MyAudio.stop("blobbyTracking");
        MyAudio.playSound("doorClosing");

        if (GLOBAL.chestPressurePlatesPressed === GLOBAL.chestPressurePlatesToPress) {
            Crafty("Chest").each(function() {
                this.activate();
            });
        }

        // Trigger movement so lighting halo shows up.
        Crafty.e("2D, Delay").delay(function() {
            Crafty.trigger("PlayerMoving");
        }, 10, 1);
    });

    function generateRoom() {
        GLOBAL.curLevel = Crafty.e("TiledLevel").tiledLevel(GLOBAL.currentLevel.room, "Canvas");

        GLOBAL.curLevel.initMatrices();
        function putIntoWorlds(object) {
            GLOBAL.curLevel.getRelevantTiles(object).push(object);
        }

        Crafty("ChestPressurePlate").each(function() {
            GLOBAL.chestPressurePlatesToPress++;
        });

        var doorList = [];
        Crafty("_Door").each(function() {
            doorList.push(this);
        });

        for (var i = 0; i < doorList.length; i++) {
            // GLOBAL.currentLevel is a reference to the doors the level should have.
            for (var j = 0; j < GLOBAL.currentLevel.doors.length; j++) {
                // If this door has theoretical level equivalent.
                if (GLOBAL.currentLevel.doors[j].coor[0] === doorList[i]._x &&
                    GLOBAL.currentLevel.doors[j].coor[1] === doorList[i]._y) {
                    doorList[i].connectedRoom = GLOBAL.currentLevel.doors[j].connectedRoom;

                    doorList[i].connectedDoor = GLOBAL.currentLevel.doors[j].connectedDoor;
                    doorList[i].entranceDirection = GLOBAL.currentLevel.doors[j].entranceDirection;

                    break; // Break out of inner loop.
                }
            }
            doorList[i].linkDoorAndInitialize(doorList);
        }

        // Link moveable objects between dimensions.
        var boxes = [];
        Crafty("Box").each(function() {
            boxes.push(this);
        });
        for (var i = 0; i < boxes.length; i++) {
            boxes[i].linkObjects(boxes);
        }

        // Link lamps between dimensions.
        var lampList = [];
        Crafty("Lamp").each(function() {
            lampList.push(this);
        });
        for (var i = 0; i < lampList.length; i++) {
            lampList[i].linkObjects(lampList);

            // 50/50 chance lamp spawns on or off.
            if (Math.random() > .5) {
                lampList[i].isOn = true;
                if (lampList[i].connectedObj !== null && lampList[i].connectedObj !== undefined) {
                    lampList[i].connectedObj.isOn = true;
                }
            }
        }

        GLOBAL.numberOfTearedTiles = 0;
        GLOBAL.numberOfBlobbies = 0;

//        if (GLOBAL.currentLevel === Some level to test) {
//            GLOBAL.numberOfTearedTiles = 1;
//        }
//        else {
//            GLOBAL.numberOfTearedTiles = 0;
//        }
        var minimumValue = .01;
        while (Math.pow(Math.random(), GLOBAL.roomsEntered) < minimumValue) {
            GLOBAL.numberOfTearedTiles++;
            minimumValue /= 10;
        }

        addDimensionCracks(GLOBAL.numberOfTearedTiles, 1);

        // This needs to be called after adding dimension cracks and before spawning
        // crack blobbies in order to correctly modify GLOBAL.numberOfTearedTiles.
        persistence.addLevelModifications();

        var delayer = Crafty.e("2D, Delay");
        if (GLOBAL.numberOfTearedTiles > 0) {
            spawnCrackBlobbies(delayer, 24000 / (1 + (.1 * GLOBAL.numberOfTearedTiles)));
        }

        // Generate matrix, prepare for lighting
        Crafty("MapTile").each(function() {
            if (this.has("Blobby")) {
                console.log(this);
            }
            putIntoWorlds(this);
        });

        // Have to delay the bind to allow the first sceneChange to take place
        // without destroying the delayer.
        delayer.delay(function() {
            delayer.bind("SceneChange", function() {
                this.destroy();
            });
        }, 1000);

        if (GLOBAL.curLevel === GLOBAL.curLevel.kitchenPuzzle) {
            MyAudio.playLoopedSound("fire");
        }

        lightFX.setStaticLights();
    }

    function switchDimensions(player, player2) {
        var neutralTiles = [];
        var dangerousTiles = [];
        //find tiles
        if (GLOBAL.evilOnLeft) {
            Crafty("MapTile").each(function() {
                //tiles in the left half move to right
                objSwitchDimension(this);
                if (objInLeftSide(this)) {
                    neutralTiles.push(this);
                }
                else {
                    dangerousTiles.push(this);
                }
            });
        }
        else {
            Crafty("MapTile").each(function() {
                //tiles in the left half move to right
                objSwitchDimension(this);
                if (objInLeftSide(this)) {
                    dangerousTiles.push(this);
                }
                else {
                    neutralTiles.push(this);
                }
            });
        }

        Crafty("Player").each(function() {
            this.path = [];
        });

        //reset target of objects that have target
        Crafty("HasTarget").each(function() {
            this.resetTarget();
        });

        //reset target of objects that have target
        Crafty("Blobby").each(function() {
            this.startToWander();
        });
    }

    function addDimensionCracks(numOfCracks, diameterOfCracks) {
        for (var i = 0; i < numOfCracks; i++) {
            var randomXSpawn, randomYSpawn, spawnTile;
            do {
                randomXSpawn = Math.floor(Math.random() * (GLOBAL.dimWidthInTiles - diameterOfCracks));
                randomYSpawn = Math.floor(Math.random() * (GLOBAL.dimHeightInTiles - diameterOfCracks));
                spawnTile = GLOBAL.curLevel.neutralTileMatrix[randomXSpawn][randomYSpawn];
            } while (spawnTile.base === null || spawnTile.base.has("NoLight") || spawnTile.base.has("WallDoor") || spawnTile.base.has("_Door"));

            var origXSpawn = randomXSpawn;
            var origYSpawn = randomYSpawn;

            for (; randomXSpawn < origXSpawn + diameterOfCracks; randomXSpawn++) {
                for (; randomYSpawn < origYSpawn + diameterOfCracks; randomYSpawn++) {
                    spawnTile = GLOBAL.curLevel.neutralTileMatrix[randomXSpawn][randomYSpawn];
                    if (spawnTile.base !== null && !spawnTile.base.has("NoLight") && !spawnTile.base.has("WallDoor") && !spawnTile.base.has("_Door")) {
                        var sourceTear = Crafty.e("2D, Canvas, SourceTear")
                            .attr({x: randomXSpawn * GLOBAL.tileW, y: randomYSpawn * GLOBAL.tileW,
                                w: GLOBAL.tileW, h: GLOBAL.tileW})
                            .initialize();

                        sourceTear.startGrowing();

                        spawnTile.other.push(sourceTear);
                    }
                }
                randomYSpawn = origYSpawn;
            }
        }
    }

    function spawnCrackBlobbies(delayer, delayTime) {
        delayer.delay(function() {
            if (GLOBAL.numberOfBlobbies < 10) {
                spawnBlobbyAtRandomTear();

                spawnCrackBlobbies(delayer, 24000 / (1 + (.1 * GLOBAL.numberOfTearedTiles)));
            }
        }, 24000 / (1 + (.1 * GLOBAL.numberOfTearedTiles)));
    }

    function spawnBlobbyAtRandomTear() {
        var randomTileNum = Math.floor(Math.random() * GLOBAL.numberOfTearedTiles);

        var blobbySpawned = false;
        var currentNum = 0;
        // TODO: Optimize inefficiency of looping through all tiles.
        Crafty("SourceTear").each(function() {
            if (!blobbySpawned && currentNum === randomTileNum) {
                var newBlobby = Crafty.e("2D, Canvas, MapTile, Blobby").attr({x: this._x, y: this._y, w: GLOBAL.tileW, h: GLOBAL.tileW});
                newBlobby.resetRoom();
                newBlobby.resetTarget();
                newBlobby.setRoomMatrix();

                var newBlobby2 = Crafty.e("2D, Canvas, MapTile, Blobby").attr({x: this.linkedTear._x, y: this.linkedTear._y, w: GLOBAL.tileW, h: GLOBAL.tileW});
                newBlobby2.resetRoom();
                newBlobby2.resetTarget();
                newBlobby2.setRoomMatrix();

                blobbySpawned = true;

                return;
            }
            else
                currentNum++;
        });

        GLOBAL.numberOfBlobbies++;
    }

})();