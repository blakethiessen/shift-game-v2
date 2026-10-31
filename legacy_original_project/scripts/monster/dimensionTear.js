//Encapsulate functions and components into a module
var dimensionTearModule = (function(direction) {

    // Should only handle logic for animating or display.
    Crafty.c("Tear", {
        init: function() {
            this.addComponent("S_empty, Animated").origin("center");
            this.linkedTear = null;

            this.rotation = 0;
        }
    });

    // Source tear has all code for the behavior and display of
    // a dimension tear in the neutral tile dimension.
    Crafty.c("SourceTear", {
        ANIMATION_SPEED: 20,
        GROWTH_RATE: 3000,
        REGROWTH_RATE: 9000,
        angle: null,

        init: function() {
            this.currentAnimNumber = 0;
            this.curAnimation = null;
            this.tearGrowing = false;

            this.spawnTimer = Crafty.e("2D, Delay");
            this.surroundingTiles = [];
        },
        initialize: function(angle) {
            // Add tear component, used as a
            // flag to signal the tear has started.
            this.addComponent("Tear");
            var linkedTear = Crafty.e("2D, Canvas, Tear")
                .attr({ x: this._x + GLOBAL.dimWidthInTiles * GLOBAL.tileW, y: this._y, w: this._w, h: this._h });
            this.linkedTear = linkedTear;
            linkedTear.linkedTear = this;

            GLOBAL.curLevel.dangerousTileMatrix[this._x / GLOBAL.tileW][this._y / GLOBAL.tileW].other.push(linkedTear);

            this.angle = angle;

            // Set animation.
            switch (angle) {
                case direction.upLeft:
                    this.curAnimation = this.animation.dimSplitDiagonalSpread;
                    this.rotation = 270;
                    this.linkedTear.rotation = 270;
                    break;
                case direction.up:
                    this.curAnimation = this.animation.dimSplitOrthoSpread;
                    this.rotation = 0;
                    this.linkedTear.rotation = 0;
                    break;
                case direction.upRight:
                    this.curAnimation = this.animation.dimSplitDiagonalSpread;
                    this.rotation = 0;
                    this.linkedTear.rotation = 0;
                    break;
                case direction.right:
                    this.curAnimation = this.animation.dimSplitOrthoSpread;
                    this.rotation = 90;
                    this.linkedTear.rotation = 90;
                    break;
                case direction.downRight:
                    this.curAnimation = this.animation.dimSplitDiagonalSpread;
                    this.rotation = 90;
                    this.linkedTear.rotation = 90;
                    break;
                case direction.down:
                    this.curAnimation = this.animation.dimSplitOrthoSpread;
                    this.rotation = 180;
                    this.linkedTear.rotation = 180;
                    break;
                case direction.downLeft:
                    this.curAnimation = this.animation.dimSplitDiagonalSpread;
                    this.rotation = 180;
                    this.linkedTear.rotation = 180;
                    break;
                case direction.left:
                    this.curAnimation = this.animation.dimSplitOrthoSpread;
                    this.rotation = 270;
                    this.linkedTear.rotation = 270;
                    break;
                default:
                    this.rotation = 0;
                    if (Math.random() > .5) {
                        this.curAnimation = this.animation.dimSplitSpawnHorizontal;
                        this.angle = direction.horizontal;
                    }
                    else {
                        this.curAnimation = this.animation.dimSplitSpawnVertical;
                        this.angle = direction.vertical;
                    }
            }

            // Set animations for both linkedTear and sourceTear.
            for (var i = 0; i < this.curAnimation.length; i++) {
                this.setTearAnimations(this.curAnimation[i]);
            }

            return this;
        },
        startGrowing: function() {
            this.growTear();
        },
        immediatelyStartGrowing: function() {
            // TODO: Is tearGrowing ever true?
            this.tearGrowing = false;
            curModule.grow(this);
        },
        growTear: function() {
            var dimTear = this;
            // TODO: Is tearGrowing ever true?
            this.tearGrowing = false;
            this.spawnTimer.delay(function() {
                curModule.grow(dimTear);
            }, this.GROWTH_RATE);
        },
        initializeAdjacentTiles: function() {
            // Find all adjacent non-nolight tiles.
            var coord = getTileCoord(this);
            var currentMatrix = GLOBAL.curLevel.neutralTileMatrix;

            var lastXIteration = false;
            // For each x position around the base tile...
            for (var i = coord._x; i < coord._x + 2; lastXIteration = true) {
                var lastYIteration = false;
                // for each y position around the base tile...
                for (var j = coord._y; j < coord._y + 2; lastYIteration = true) {
                    // If this tile is not an area that stops light (walls and doors)...
                    if (currentMatrix[i][j].base !== null && !currentMatrix[i][j].base.has("NoLight") &&
                        !currentMatrix[i][j].base.has("_Door") && !currentMatrix[i][j].base.has("WallDoor")) {
                        // If there are other tiles on top of this tile that might contain another tear...
                        if (currentMatrix[i][j].other.length > 0) {
                            var arrayLength = currentMatrix[i][j].other.length;
                            for (var k = 0; k < arrayLength; k++) {
                                if (currentMatrix[i][j].other[k].has("Tear")) {
                                    break;
                                }
                                else if (k === currentMatrix[i][j].other.length - 1) {
                                    // Insert the tear.
                                    var tearingTile = curModule.addSurroundingTile(this, i, j, coord);
                                    currentMatrix[i][j].other.push(tearingTile);
                                    break;
                                }
                            }
                        }
                        else {
                            // Insert the tear.
                            var tearingTile = curModule.addSurroundingTile(this, i, j, coord);
                            currentMatrix[i][j].other.push(tearingTile);
                        }
                    }
                    if (lastYIteration)
                        j += 2;
                    else
                        j--;
                }
                if (lastXIteration)
                    i += 2;
                else
                    i--;
            }
        },
        reduceSize: function() {
            if (this.currentAnimNumber > 0) {
                this.currentAnimNumber--;
                this.playLoopAnimation(this.curAnimation[this.currentAnimNumber], this.ANIMATION_SPEED);
                this.linkedTear.playLoopAnimation(this.curAnimation[this.currentAnimNumber], this.ANIMATION_SPEED);

                if (!this.tearGrowing)
                    this.growTear();
            }
            else {
                this.deInitialize();
                GLOBAL.numberOfTearedTiles--;
            }
        },
        deInitialize: function() {
            this.spawnTimer.destroy();
            var xTile = this._x / GLOBAL.tileW;
            var yTile = this._y / GLOBAL.tileW;

            // Make origin tile regrow into destroyed area.
            // TODO: Make tile regrowths have an adjacent tile to expand to.
            if (this.surroundingTiles[0] !== undefined) {
                // Find the opposite angle.
                var sourceTile = this.surroundingTiles[0];

                var regrowthAngle = sourceTile.angle + 4;
                if (regrowthAngle > 8)
                    regrowthAngle %= 8;

                var regrowth = Crafty.e("2D, Canvas, S_empty")
                    .attr({ x: this._x, y: this._y, w: this._w, h: this._h });

                sourceTile.tile.spawnTimer.delay(function() {
                    regrowth.addComponent("SourceTear").initialize(regrowthAngle);
                    regrowth.startGrowing();
                    GLOBAL.curLevel.neutralTileMatrix[xTile][yTile]
                        .other.push(regrowth);
                    GLOBAL.TEMP = regrowth[0];

                }, sourceTile.tile.REGROWTH_RATE);
            }

            curModule.removeTileById(GLOBAL.curLevel.dangerousTileMatrix[xTile][yTile].other, this.linkedTear[0]);
            this.linkedTear.destroy();

            curModule.removeTileById(GLOBAL.curLevel.neutralTileMatrix[xTile][yTile].other, this[0]);
            this.destroy();
            delete this;
        }
    });

    var curModule = {

        grow : function(dimTear) {
            dimTear.playLoopAnimation(dimTear.curAnimation[dimTear.currentAnimNumber], dimTear.ANIMATION_SPEED);
            dimTear.linkedTear.playLoopAnimation(dimTear.curAnimation[dimTear.currentAnimNumber], dimTear.ANIMATION_SPEED);

            if (dimTear.currentAnimNumber < dimTear.curAnimation.length - 1) {
                dimTear.currentAnimNumber++;
                dimTear.growTear();
            }
            else {
                dimTear.initializeAdjacentTiles();
                dimTear.stop();
                dimTear.linkedTear.stop();

                dimTear.spawnTimer.delay(function() {
                    curModule.spreadCreep(dimTear);
                    // TODO: Might have a problem with half destroyed tiles increasing.
                    GLOBAL.numberOfTearedTiles++;

                    this.tearGrowing = false;
                }, 10);
            }
        },

        spreadCreep : function (dimensionTear) {
            for (var i = 0; i < dimensionTear.surroundingTiles.length; i++) {
                dimensionTear.surroundingTiles[i].tile.addComponent("SourceTear")
                    .initialize(dimensionTear.surroundingTiles[i].angle)
                    .growTear();
            }
        },

        addSurroundingTile : function (dimensionTear, x, y, coord) {
            var tearingTile = Crafty.e("2D, Canvas, S_empty, Tear").attr({ x: x * GLOBAL.tileW,
                    y: y * GLOBAL.tileW, w: GLOBAL.tileW, h: GLOBAL.tileW});

            var angle;
            switch (x) {
                case (coord._x - 1):
                    switch (y) {
                        case (coord._y - 1):
                            if (this.tileHasTear(coord._x - 1, coord._y))
                                angle = direction.up;
                            else if (this.tileHasTear(coord._x, coord._y - 1))
                                angle = direction.left;
                            else
                                angle = direction.upLeft;
                            break;
                        case (coord._y):
                            angle = direction.left;
                            break;
                        default:
                            if (this.tileHasTear(coord._x - 1, coord._y))
                                angle = direction.down;
                            else if (this.tileHasTear(coord._x, coord._y + 1))
                                angle = direction.left;
                            else
                                angle = direction.downLeft;
                    }
                    break;
                case (coord._x):
                    switch (y) {
                        case (coord._y - 1):
                            angle = direction.up;
                            break;
                        default:
                            angle = direction.down;
                    }
                    break;
                default:
                    switch (y) {
                        case (coord._y - 1):
                            if (this.tileHasTear(coord._x + 1, coord._y))
                                angle = direction.up;
                            else if (this.tileHasTear(coord._x, coord._y - 1))
                                angle = direction.right;
                            else
                                angle = direction.upRight;
                            break;
                        case (coord._y):
                            angle = direction.right;
                            break;
                        default:
                            if (this.tileHasTear(coord._x + 1, coord._y))
                                angle = direction.down;
                            else if (this.tileHasTear(coord._x, coord._y + 1))
                                angle = direction.right;
                            else
                                angle = direction.downRight;
                    }
                    break;
            }

            dimensionTear.surroundingTiles.push({tile: tearingTile, angle: angle});

            return tearingTile;
        },

        tileHasTear: function(x, y) {
            for (var i = 0; i < GLOBAL.curLevel.neutralTileMatrix[x][y].other.length; i++) {
                if (GLOBAL.curLevel.neutralTileMatrix[x][y].other[i].has("SourceTear"))
                    return true;
            }
            return false;
        },

        removeTileById: function(list, id) {
            for (var i = 0; i < list.length; i++) {
                if (list[i][0] === id) {
                    list.splice(i, 1);
                    break;
                }
            }
        }
    };

})(GLOBAL.direction);