// tiles.js
// Contains the parsing algorithm
// for obtaining levels from json files.

var tileModule = (function() {
    //component for level
    Crafty.c("TiledLevel", {
        //tiles of neutral world
        neutralTiles : [],
        //tiles of dangerous world
        dangerousTiles : [],
        //data matrix of neutral tiles, 1 means blockable tiles
        neutralTileMatrix : [],
        //data matrix of neutral tiles
        dangerousTileMatrix : [],
        tileNumX : GLOBAL.viewport.w / GLOBAL.tileW / 2,
        tileNumY : GLOBAL.viewport.h / GLOBAL.tileW,

        //Initialize matrices of tile information
        initMatrices : function() {
            for(var i = 0; i < this.tileNumX; i++){
                this.neutralTileMatrix[i] = [];
                this.dangerousTileMatrix[i] = [];

                for(var j = 0; j < this.tileNumY; j++){
                    this.neutralTileMatrix[i][j] = {base: null, other: []};
                    this.dangerousTileMatrix[i][j] = {base: null, other: []};
                }
            }
            var level = this;
            Crafty("MapTile").each(function(){
                var coord = getTileCoord(this);
                // If this is slow, change use of "has()" or do null check for base.
                if (xor(objInLeftSide(this), GLOBAL.evilOnLeft)) {
                    if (level.neutralTileMatrix[coord._x][coord._y].base === null || this.has("Collides") || this.has("NoLight"))
                        level.neutralTileMatrix[coord._x][coord._y].base = this;
                    else
                        level.neutralTileMatrix[coord._x][coord._y].other.push(this);
                }
                else {
                    if (level.dangerousTileMatrix[coord._x][coord._y].base === null || this.has("Collides") || this.has("NoLight"))
                        level.dangerousTileMatrix[coord._x][coord._y].base = this;
                    else
                        level.dangerousTileMatrix[coord._x][coord._y].other.push(this);
                }
            });
        },

        // Organized tiles in matrix of neutral world (a.push returns array length)
        // neutralTileMatrix : (function(a){ while(a.push([]) < GLOBAL.dimWidthInTiles); return a})([]),

        getRelevantMatrix : function(obj) {
            if (objInLeftSide(obj)) {
                return this.neutralTileMatrix;
            }else{
                return this.dangerousTileMatrix;
            }
        },

        //get tiles of the world of object
        getRelevantTiles : function(obj){
            if (objInLeftSide(obj)){
                return this.neutralTiles;
            }else{
                return this.dangerousTiles;
            }
        },

        makeTiles: function(ts, drawType) {
            var components, i, posx, posy, sMap, sName, tHeight, tName, tNum, tWidth, tsHeight, tsImage, tsProperties, tsWidth, xCount, yCount, _ref;
            tsImage = ts.image, tNum = ts.firstgid, tsWidth = ts.imagewidth;
            tsHeight = ts.imageheight, tWidth = ts.tilewidth, tHeight = ts.tileheight;
            tsProperties = ts.tileproperties;
            xCount = tsWidth / tWidth | 0;
            yCount = tsHeight / tHeight | 0;
            sMap = {};
            for (i = 0, _ref = yCount * xCount; i < _ref; i += 1) {
                posx = i % xCount;
                posy = i / xCount | 0;
                sName = "tileSprite" + tNum;
                tName = "tile" + tNum;
                sMap[sName] = [posx, posy];
                components = "2D, " + drawType + ", " + sName + ", MapTile";
                if (tsProperties) {
                    if (tsProperties[tNum - 1]) {
                        if (tsProperties[tNum - 1]["Components"]) {
                            components += ", " + tsProperties[tNum - 1]["Components"];
                        }
                    }
                }
                Crafty.c(tName, {
                    comp: components,
                    init: function() {
                        this.addComponent(this.comp);
                        return this;
                    }
                });
                tNum++;
            }
            Crafty.sprite(tWidth, tHeight, tsImage, sMap);
            return null;
        },
        makeLayer: function(layer) {
            var i, lData, lHeight, lWidth, tDatum, tile, _len, lProperties, lComponents;
            lData = layer.data, lWidth = layer.width, lHeight = layer.height, lProperties = layer.properties;
            if (lProperties)
                lComponents = lProperties["Components"];
            else
                lComponents = '';

            for (i = 0, _len = lData.length; i < _len; i++) {
                tDatum = lData[i];
                if (tDatum) {
                    tile = Crafty.e("tile" + tDatum + ", " + lComponents);

                    tile.x = (i % lWidth) * tile.w;
                    tile.y = (i / lWidth | 0) * tile.h;
                }
            }
            return null;
        },
        tiledLevel: function(level, drawType) {
            var _this = this;

            var lLayers, ts, tsImages, tss;
            lLayers = level.layers, tss = level.tilesets;
            drawType = drawType != null ? drawType : "Canvas";

            var layer, ts, _i, _j, _len, _len2;
            for (_i = 0, _len = tss.length; _i < _len; _i++) {
                ts = tss[_i];
                _this.makeTiles(ts, drawType);
            }
            for (_j = 0, _len2 = lLayers.length; _j < _len2; _j++) {
                layer = lLayers[_j];
                _this.makeLayer(layer);
            }
            return this;
        },
        init: function() {
            return this;
        }
    });

    return {
        //check if object will pass the middle point of a certain tile
        almostWithinTile : function(obj, tileCoord) {
            if(tileCoord === null) {
                return false;
            }

            var pos = getTilePosition(tileCoord, obj);

            assertFalse("object doesn't have velocity!", obj.velocity === undefined);
            if (obj.velocity.y === 0){
                //if next frame object pass the middle point of tile
                if ((obj.x - GLOBAL.delta - pos._x) * (obj.x + obj.velocity.x - GLOBAL.delta - pos._x) <= 0){
                    return true;
                }
            } else if (obj.velocity.x === 0){
                if ((obj.y - GLOBAL.delta - pos._y) * (obj.y + obj.velocity.y - GLOBAL.delta - pos._y) <= 0){
                    return true;
                }
            } else {
                if ((obj.x - GLOBAL.delta - pos._x) * (obj.x + obj.velocity.x - GLOBAL.delta - pos._x) <= 0
                    || (obj.y - GLOBAL.delta - pos._y) * (obj.y + obj.velocity.y - GLOBAL.delta - pos._y) <= 0){
                    return true;
                }
            }
            return false;
        },

        isAdjacent : function(coord1, coord2){
            var deltaY = (coord1.y - coord2.y);
            var deltaX = (coord1.x - coord2.x);
            //down tile
            if(deltaY === 1 && deltaX === 0) {
                return true;
            }
            if(deltaY === -1 && deltaX === 0) {
                return true;
            }
            if(deltaY === 0 && deltaX === 1) {
                return true;
            }
            if(deltaY === 0 && deltaX === -1) {
                return true;
            }
            return false;
        },

        alignToTile : function(obj, tileCoord){
            var pos = getTilePosition(tileCoord, obj);

            obj.x = pos._x + GLOBAL.delta;
            obj.y = pos._y + GLOBAL.delta;

        },

        reached : function(obj, tile) {
            if( tileModule.almostWithinTile(obj, tile)) {
                tileModule.alignToTile(obj, tile);
                return true;
            } else {
                return false;
            }
        }
    }


}).call(this);