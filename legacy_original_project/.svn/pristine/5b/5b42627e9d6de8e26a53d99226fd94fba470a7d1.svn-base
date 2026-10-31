// global.js
// Contains definitions of all global
// variables and functions.
(function(window) {
    var GLOBAL = window.GLOBAL = {};
    GLOBAL.viewport = {
        w : 1000,
        h : 650
    };
    GLOBAL.tileW = 25;

    GLOBAL.roomsEntered;

    GLOBAL.dimWidthInTiles = GLOBAL.viewport.w / GLOBAL.tileW / 2;
    GLOBAL.dimHeightInTiles = GLOBAL.viewport.h / GLOBAL.tileW;

    GLOBAL.direction = {
        none : 0,
        left : 1,
        upLeft : 2,
        up : 3,
        upRight : 4,
        right : 5,
        downRight : 6,
        down : 7,
        downLeft : 8,
        // Last two are for dimension tears.
        horizontal: 9,
        vertical: 10
    };
    
    GLOBAL.defaultAnimationDurationMs = 300;

    //to prevent the collision between players and walls.
    GLOBAL.delta = 1;
    GLOBAL.commonKeys = {
        SwitchDimensions: Crafty.keys.SHIFT,
        Pause: Crafty.keys.P,
        Mute: Crafty.keys.M
    };
    GLOBAL.player1 = null;
    GLOBAL.player2 = null;
    GLOBAL.maxSpeed = 2;
    GLOBAL.currentBGM = "";
    GLOBAL.p1Keys = {
        Up: Crafty.keys.W,
        Down: Crafty.keys.S,
        Left: Crafty.keys.A,
        Right: Crafty.keys.D,
        UseItem: Crafty.keys.Q,
        Interact: Crafty.keys['1'],
        Inventory: Crafty.keys['2']
    };
    GLOBAL.p2Keys = {
        Up: Crafty.keys.UP_ARROW,
        Down: Crafty.keys.DOWN_ARROW,
        Left: Crafty.keys.LEFT_ARROW,
        Right: Crafty.keys.RIGHT_ARROW,
        // The " ' ", "]", & "[" keys respectively.
        UseItem: 222,
        Interact: 221,
        Inventory: 219
    };
    GLOBAL.firstLevel = true;
    GLOBAL.currentlyShifting = { value: false };
    GLOBAL.currentLevel; // Check gameScene.js to set starting level.
    GLOBAL.currentLevelName;
    GLOBAL.p1EntrancePosition;
    GLOBAL.p2EntrancePosition;
    GLOBAL.moveDistBeforeLightRefresh = GLOBAL.tileW;
    GLOBAL.evilOnLeft;

    GLOBAL.chestShouldOpen = true;
    GLOBAL.unlockedDoors;
    GLOBAL.safePressurePlatesPressed = 0;
    GLOBAL.chestPressurePlatesPressed;
    GLOBAL.chestPressurePlatesToPress;

    GLOBAL.curLevel;

    GLOBAL.numberOfTearedTiles;
    GLOBAL.numberOfBlobbies;

    GLOBAL.collidingWithWallX = false;
    GLOBAL.collidingWithWallY = false;

    GLOBAL.playerLeftX = 10;
    GLOBAL.playerRightX = 12;
    GLOBAL.playerUpX = 14;
    GLOBAL.playerDownX = 6;
    GLOBAL.playerNormalY = 0;
    GLOBAL.playerBruisedY = 1;
    GLOBAL.playerInjuredY = 2;
    GLOBAL.playerDyingY = 3;

    //In action animation there are 5 tiles involved

    //        up
    // left player right
    //       down

    //the tiles below means image coordinates that frames of animation use
    //for example: playerActLeft contains 4 frames that are on the player tile when the player faces left.
    //leftActUp contains 4 frames that are on the left of the player tile when the player faces upward.
    //emptySprite means that there is nothing on that tile at that frame.
    GLOBAL.playerActLeft = [[0, 0], [2, 0], [4, 0], [GLOBAL.playerLeftX + 1, 12]];
    GLOBAL.playerActRight = [[0, 2], [1, 2], [3, 2], [GLOBAL.playerRightX + 1,12]];
    GLOBAL.playerActUp = [[3 , 4], [5, 4], [GLOBAL.playerUpX + 1, 12]];
    GLOBAL.playerActDown = [[1 , 4], [2, 4], [GLOBAL.playerDownX + 1, 12]];

    GLOBAL.emptySprite = [5, 1];

    GLOBAL.leftActLeft = [GLOBAL.emptySprite, [1, 0], [3, 0], GLOBAL.emptySprite];
    GLOBAL.leftActRight = [GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite];
    GLOBAL.leftActUp = [GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite];
    GLOBAL.leftActDown = [[0, 4], GLOBAL.emptySprite, GLOBAL.emptySprite];

    GLOBAL.rightActLeft = [GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite];
    GLOBAL.rightActRight = [GLOBAL.emptySprite, [2, 2], [4, 2], GLOBAL.emptySprite];
    GLOBAL.rightActUp = [[4 , 4], GLOBAL.emptySprite, GLOBAL.emptySprite];
    GLOBAL.rightActDown = [GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite];

    GLOBAL.upActLeft = [[0, -1], [2, -1], [4, -1], GLOBAL.emptySprite];
    GLOBAL.upActRight = [[0, 1], [1, 1], [3, 1], GLOBAL.emptySprite];
    GLOBAL.upActUp = [[3 , 3], [5, 3], GLOBAL.emptySprite];
    GLOBAL.upActDown = [[1 , 3], [2, 3], GLOBAL.emptySprite];

    GLOBAL.downActLeft = [GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite];
    GLOBAL.downActRight = [GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite];
    GLOBAL.downActUp = [GLOBAL.emptySprite, GLOBAL.emptySprite, GLOBAL.emptySprite];
    GLOBAL.downActDown = [GLOBAL.emptySprite, [2, 5], GLOBAL.emptySprite];

    //this is a offset that added to frame picture coordinates of the player on the evil side
    GLOBAL.evilSprite = 24;

})(window);

//get the coordinates of an object in the tile system
// Note: This adjusts the x position according to whether
// the tile is in the left or right dimension.
function getTileCoord(obj){
    var tileSize = GLOBAL.tileW;
    var delta = 0;
    if (obj._w === null) {
        console.log(obj);
    }
    if (obj._w === GLOBAL.tileW - 2 * GLOBAL.delta){
        delta = GLOBAL.delta;
    }
    var x = obj._x + (tileSize - delta) / 2;
    var y = obj._y + (tileSize - delta) / 2;
    var tileX = Math.floor(x / tileSize);
    var tileY = Math.floor(y / tileSize);
    if (!objInLeftSide(obj)){
        tileX -= 20;
    }
    return makeVector(tileX,tileY);
}

function xor(x, y) {
    return (x && !y) || (!x && y);
}

function objInLeftSide(obj) {
    return obj._x < GLOBAL.viewport.w / 2;
}

function getTilePosition(coord, obj) {
    var pos = makeVector(coord._x * GLOBAL.tileW, coord._y * GLOBAL.tileW);
    if (!objInLeftSide(obj)){
        pos._x += GLOBAL.viewport.w / 2;
    }
    return pos;
}

function objSwitchDimension(obj) {
    if (objInLeftSide(obj)) {
        obj.x += GLOBAL.viewport.w / 2;
    }
    else {
        obj.x -= GLOBAL.viewport.w / 2;
    }
}

function arrayObjectIndexOf(myArray, searchTerm) {
    for(var i = 0; i < myArray.length; i++) {
        if (myArray[i] === searchTerm) return i;
    }
    return -1;
}

function makeVector(x,y){
    return {
        _x : x,
        _y : y,
        distance: function() {
            return Math.sqrt(x^2 + y^2);
        }
    }
}

function assertTrue(message, e){
    if(!e){
        alert(message);
    }
}

function assertFalse(message, e){
    if(e){
        alert(message);
    }
}

function assertEquals(message, expected, value){
    if(value !== expected){
        alert(message);
    }
}

function calcCosine(vec1, vec2){
    var norm1 = Math.sqrt(vec1._x * vec1._x + vec1._y * vec1._y);
    var norm2 = Math.sqrt(vec2._x * vec2._x + vec2._y * vec2._y);
    var dot = vec1._x * vec2._x + vec1._y * vec2._y;
    return  ( dot / ( norm1 * norm2 ) );
}

//determine if line section intersects with boundingbox
function intersect(x1, y1, x2, y2, obj){
    var objH = GLOBAL.tileW;
    var objW = GLOBAL.tileW;
    if (x1 < obj._x + objW && x1 > obj._x && y1 < obj._y + objW && y1 > obj._y){
        return false;
    }
    if ( (x1 > obj._x + objW && x2 > obj._x + objW) || (x1 < obj._x && x2 < obj._x) || (y1 > obj._y + objH && y2 > obj._y + objH) || (y1 < obj._y && y2 < obj._y) ) {
        return false;
    }else{
        if (x2 !== x1){
            var k = ( y2 - y1 ) / ( x2 - x1 );
            var yLeft = k * ( obj._x - x1 ) + y1;
            var yRight = k * ( obj._x - x1 + objW ) + y1;

            var k1 = ( x2 - x1 ) / ( y2 - y1 );
            var xUp = k1 * ( obj._y - y1 ) + x1;
            var xDown = k1 * ( obj._y - y1 + objH ) + x1;

            return ( yLeft >= obj._y && yLeft <= obj._y + objH ) || ( yRight >= obj._y && yRight <= obj._y + objH ) || ( xUp >= obj._x && xUp <= obj._x + objW ) || ( xDown >= obj._x && xDown <= obj._x + objW );
        }else{
            return true;
        }


        //cross
        //return ( yLeft - obj._y ) * ( yRight - obj._y) < 0;

    }
}