/* persistence.js
    Contains a map for levels modified
    after players enter them.

    A map element contains a time since the level was last accessed,
    and a list for each of the following:

        - Removed Items (type, position)
            - Upon entrance: remove all items.
            - Upon picking up an item: add to removed items if nonexistent.

        - Added Items (type, position)
            - Upon entrance: add all items.
            - Upon dropping an item: add to added items if nonexistent.

        - LockedDoors (position)
            - Upon entrance: unlock all doors.
            - Upon unlocking a door: add to locked doors.

        - Blobbies (position)
            - Upon entrance: add blobbies to room.
            - Upon exit: clear list and re-add positions.
            
        - Dimension Tears (x,y rectangles)

        - Lamps (tile position, on/off)
            - Upon entrance: manually set on/off of all lamps in list, if no
                lamps in list, use random values for each lamp and add to list.
            - Upon turning a lamp on or off: find lamp in list and change value.

        - Chests & Safes

*/
var persistence = (function() {

    var levelData;

    return {

        initialize: function() {
            levelData = {};
            // Initialize empty level data for all levels.
            for (var property in level) {
                levelData[property] = {
                    removedItems: [],
                    addedItems: [],
                    unlockedDoorsPositions: [],
                    blobbyPositions: [],
                    lamps: [],
                    dimensionTears: []
                }
            }
        }
        ,
        removeItemFromPersistence: function(item) {
            var itemListPosition = findItemPositionInList(item, levelData[GLOBAL.currentLevelName].addedItems)

            if (itemListPosition === null)
                addItemToList(item, levelData[GLOBAL.currentLevelName].removedItems);
            else
                removeItemFromList(itemListPosition, levelData[GLOBAL.currentLevelName].addedItems);
        }
        ,
        addItemToPersistence: function(item) {
            var itemListPosition = findItemPositionInList(item, levelData[GLOBAL.currentLevelName].removedItems)

            if (itemListPosition === null)
                addItemToList(item, levelData[GLOBAL.currentLevelName].addedItems);
            else
                removeItemFromList(itemListPosition, levelData[GLOBAL.currentLevelName].removedItems);
        }
        ,
        markDoorAsUnlocked: function(door) {
            levelData[GLOBAL.currentLevelName].unlockedDoorsPositions.push({x: door._x, y: door._y});
        }
        ,
        markLampState: function(lamp) {
            var lampList = levelData[GLOBAL.currentLevelName].lamps;

            // The distance the linked lamp is.
            var oppositeDimXMod;
            if (objInLeftSide(lamp))
                oppositeDimXMod = GLOBAL.viewport.w / 2;
            else
                oppositeDimXMod = -GLOBAL.viewport.w / 2;

            for (var i = 0; i < lampList.length; i++) {
                if (lampList[i].position.x === lamp._x &&
                    lampList[i].position.y === lamp._y) {
                    lampList[i].isOn = lamp.isOn;
                    break;
                }
                // Look for the lamp on the opposite dimension.
                else if (lampList[i].position.x === lamp._x + oppositeDimXMod &&
                         lampList[i].position.y === lamp._y) {
                    lampList[i].isOn = lamp.isOn;
                    break;
                }
            }
        }
        ,
        addBlobbiesToPersistence: function() {
            // Clear out all the old blobby positions.
            levelData[GLOBAL.currentLevelName].blobbyPositions = [];

            // If the evil side is on the left, save the blobby position
            // on the opposite side, since later we'll be manually switching
            // the dimensions.
            if (GLOBAL.evilOnLeft) {
                Crafty("Blobby").each(function() {
                    if (objInLeftSide(this))
                        levelData[GLOBAL.currentLevelName].blobbyPositions.push({x: this._x + GLOBAL.viewport.w / 2, y: this._y});
                    else
                        levelData[GLOBAL.currentLevelName].blobbyPositions.push({x: this._x - GLOBAL.viewport.w / 2, y: this._y});
                });
            }
            else {
                Crafty("Blobby").each(function() {
                    levelData[GLOBAL.currentLevelName].blobbyPositions.push({x: this._x, y: this._y});
                });
            }
        }
        ,
        addDimensionTearsToPersistence: function() {
            levelData[GLOBAL.currentLevelName].dimensionTears = [];

            // Only retrieve tears on one side of the level, since they're identical.
            Crafty("SourceTear").each(function() {
                if (objInLeftSide(this))
                    levelData[GLOBAL.currentLevelName].dimensionTears.push({
                        position: { x: this._x, y: this._y },
                        angle: this.angle,
                        curAnim: this.currentAnimNumber
                    });
            });
        }
        ,
        addLevelModifications: function() {
            var curLevelData = levelData[GLOBAL.currentLevelName];

            removeItemsInListFromLevel(curLevelData);
            addItemsInListToLevel(curLevelData);
            unlockPreviouslyUnlockedDoorsInLevel(curLevelData);
            moveOldBlobbiesToNewPositions(curLevelData);
            modifyLampStates(curLevelData);
            addDimensionTears(curLevelData);
        }
    }
    
    function removeItemsInListFromLevel(curLevelData) {
        for (var i = 0; i < curLevelData.removedItems.length; i++) {
            // calculate tile position of the removed item.
            var item = curLevelData.removedItems[i];
            var existingTiles = findCorrespondingMatrixTiles(item.position).other;

            for (var j = 0; j < existingTiles.length; j++) {
                if (existingTiles[j].primaryType === item.type) {
                    var removedTile = existingTiles.splice(j, 1);
                    removedTile[0].destroy();
                    break;
                }
            }
        }
    }
    
    function addItemsInListToLevel(curLevelData) {
        for (var i = 0; i < curLevelData.addedItems.length; i++) {
            // calculate tile position of the added item.
            var item = curLevelData.addedItems[i];
            var existingTiles = findCorrespondingMatrixTiles(item.position).other;

            var itemEntity = Crafty.e("2D, Canvas, MapTile, Item, " + item.type + ", N_" + item.type)
                .attr({ x: item.position.x, y: item.position.y, w: GLOBAL.tileW, h: GLOBAL.tileW });

            existingTiles.push(itemEntity);
        }
    }

    function unlockPreviouslyUnlockedDoorsInLevel(curLevelData) {
        for (var i = 0; i < curLevelData.unlockedDoorsPositions.length; i++) {
            findCorrespondingMatrixTiles(curLevelData.unlockedDoorsPositions[i]).base.doorUnlocked = true;
        }
    }

    function moveOldBlobbiesToNewPositions(curLevelData) {
        if (curLevelData.blobbyPositions.length > 0) {
            Crafty("Blobby").each(function() {
                this.destroy();
            })

            for (var i = 0 ; i < curLevelData.blobbyPositions.length; i++) {
                Crafty.e("2D, Canvas, MapTile, Blobby").attr({ x: curLevelData.blobbyPositions[i].x,
                                                               y: curLevelData.blobbyPositions[i].y,
                                                               w: GLOBAL.tileW, h: GLOBAL.tileW });
            }
        }
    }

    function modifyLampStates(curLevelData) {
        if (curLevelData.lamps.length > 0) {
            for (var i = 0; i < curLevelData.lamps.length; i++) {
                var matrixTiles = findCorrespondingMatrixTiles(curLevelData.lamps[i].position);

                if (matrixTiles.base.has("Lamp")) {
                    matrixTiles.base.isOn = curLevelData.lamps[i].isOn;
                }
                else {
                    for (var j = 0; j < matrixTiles.other.length; j++) {
                        if (matrixTiles.other[j].has("Lamp"))
                            matrixTiles.other[j].isOn = curLevelData.lamps[i].isOn;
                    }
                }
            }
        }
        // Initialize the lamps from their initial random on/off values.
        else {
            Crafty("Lamp").each(function() {
                curLevelData.lamps.push({
                    position: {x: this._x, y: this._y},
                    isOn: this.isOn
                })
            });
        }
    }

    function addDimensionTears(curLevelData) {
        if (curLevelData.dimensionTears.length > 0) {
            GLOBAL.numberOfTearedTiles += curLevelData.dimensionTears.length;

            for (var i = 0; i < curLevelData.dimensionTears.length; i++) {
                var curData = curLevelData.dimensionTears[i];
                var sourceTear = Crafty.e("2D, Canvas, SourceTear")
                    .attr({ x: curData.position.x, y: curData.position.y,
                            w: GLOBAL.tileW, h: GLOBAL.tileW })
                    .initialize(curData.angle);

                sourceTear.currentAnimNumber = curData.curAnim;
                findCorrespondingMatrixTiles(curData.position).other.push(sourceTear);

                sourceTear.immediatelyStartGrowing();
            }
        }
    }
    
    function findCorrespondingMatrixTiles(itemPosition) {
        var itemTilePos = makeVector(Math.floor(itemPosition.x / GLOBAL.tileW),
            Math.floor(itemPosition.y / GLOBAL.tileW));

        if (itemPosition.x < GLOBAL.viewport.w / 2) {
            if (GLOBAL.evilOnLeft)
                return GLOBAL.curLevel.dangerousTileMatrix[itemTilePos._x][itemTilePos._y];
            else
                return GLOBAL.curLevel.neutralTileMatrix[itemTilePos._x][itemTilePos._y];
        }
        else {
            itemTilePos._x -= 20;

            if (!GLOBAL.evilOnLeft)
                return GLOBAL.curLevel.dangerousTileMatrix[itemTilePos._x][itemTilePos._y];
            else
                return GLOBAL.curLevel.neutralTileMatrix[itemTilePos._x][itemTilePos._y];
        }
    }

    function addItemToList(item, list) {
        list.push({
            type: item.primaryType,
            position: {x: item._x, y: item._y}
        })
    }

    function removeItemFromList(itemPosition, list) {
        list.splice(itemPosition, 1);
    }

    // Returns null if no duplicates found.
    function findItemPositionInList(item, list) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].type === item.primaryType &&
                list[i].position.x === item._x &&
                list[i].position.y === item._y) {
                return i;
            }
        }

        return null;
    }

})();