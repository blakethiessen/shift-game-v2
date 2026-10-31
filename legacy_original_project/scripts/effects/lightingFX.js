
var lightFX = (function lightingFX() {

    var lightCanvas;
    var lightCtx;
    var staticLightingImage;
    var staticCtx;

    var pulseTimer = 0;

    return {
        initialize: function() {

            lightCanvas = document.createElement("canvas");
            document.body.appendChild(lightCanvas);
            lightCtx = lightCanvas.getContext("2d");

            lightCanvas.setAttribute('style', 'position: absolute; z-index: 1;');
            var doc = document.getElementsByTagName('div');
            doc[1].appendChild(lightCanvas);
            lightCanvas.width = GLOBAL.viewport.w;
            lightCanvas.height = GLOBAL.viewport.h;
            lightCtx.globalAlpha = 1;
            lightCtx.globalCompositeOperation = "destination-out";


            staticLightingImage = document.createElement("canvas");
            staticLightingImage.width = lightCanvas.width;
            staticLightingImage.height = lightCanvas.height;
            staticCtx = staticLightingImage.getContext("2d");
        },

        reset: function () {
            lightCtx.globalAlpha = 1;
            lightCtx.globalCompositeOperation = "destination-out";
            lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
        },

        deleteCanvas: function() {
            var doc = document.getElementsByTagName('div');
            doc[1].removeChild(lightCanvas);
            delete staticLightingImage;
        },

        hideCanvas: function() {
            lightCanvas.style.display = "none";
        },

        showCanvas: function() {
            lightCanvas.style.display = "inline";
        },

        darkenScreen: function() {
            lightCanvas.globalAlpha = 0.5;
            lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
        },

        lightenScreen: function() {
            this.loadStaticLights();
        },

        loadStaticLights: function() {
            this.reset();
            lightCtx.globalCompositeOperation = "source-over";
            lightCtx.globalAlpha = 1;
            lightCtx.drawImage(staticLightingImage,0,0);
        },

        setStaticLights: function() {
            // Set lighted tiles and light them

            delete staticLightingImage;
            staticLightingImage = document.createElement("canvas");
            staticLightingImage.width = lightCanvas.width;
            staticLightingImage.height = lightCanvas.height;
            staticCtx = staticLightingImage.getContext("2d");

            lightFX.resetLightMap();
            lightFX.createDarkMap();

            //Light each lamp
            Crafty("Lamp").each(function() {
                if (this.isOn) {
                    lightFX.createShadows(this._x + this._w /2, this._y + this._h / 2, 25);
                    lightFX.createLightMap(this._x + this._w /2, this._y + this._h / 2, 100);
                }
            });

        },

        createDarkMap: function() {
            staticCtx.clearRect(0,0,staticLightingImage.width, staticLightingImage.height);
            staticCtx.clearRect(0,0,lightCanvas.width, lightCanvas.height);
            staticCtx.clearRect(0,0,50000, 50000);
            staticCtx.globalCompositeOperation = "source-over";
            staticCtx.fillStyle = "black";
            staticCtx.globalAlpha = 1;
            staticCtx.fillRect(0,0,staticLightingImage.width,staticLightingImage.height);

            staticCtx.fillRect(0,0,lightCanvas.width,lightCanvas.height);
        },



        createLightMap: function(x, y, radius) {
            staticCtx.save();

            staticCtx.globalCompositeOperation = "destination-out";
            staticCtx.globalAlpha = 1;


            //gradient subtracts from "dark map" to create illusion of light
            var grd = staticCtx.createRadialGradient(x,y,0,x,y,radius);
            grd.addColorStop(0,"black");
            grd.addColorStop(1, "transparent");
            staticCtx.fillStyle = grd;

            staticCtx.fillRect(x-radius, y-radius, radius * 2, radius * 2);


            staticCtx.restore();

        },

        resetLightMap: function() {
            //reset light map

            lightCtx.globalCompositeOperation = "destination-out";
            staticLightingImage.getContext("2d").fillRect(0,0,staticLightingImage.width, staticLightingImage.height);
        },

        createLightCircle: function(x, y, radius) {

            //Clips light that extends to other side of the canvas
            lightCtx.save();

            lightCtx.globalCompositeOperation = "destination-out";

            if (x < lightCanvas.width / 2) {
                lightCtx.beginPath();
                lightCtx.lineTo(0,0);
                lightCtx.lineTo(lightCanvas.width / 2,0);
                lightCtx.lineTo(lightCanvas.width / 2, lightCanvas.height);
                lightCtx.lineTo(0, lightCanvas.height);
                lightCtx.lineTo(0,0);
                lightCtx.closePath();
                lightCtx.clip();
            } else {
                lightCtx.beginPath();
                lightCtx.lineTo(lightCanvas.width / 2,0);
                lightCtx.lineTo(lightCanvas.width,0);
                lightCtx.lineTo(lightCanvas.width, lightCanvas.height);
                lightCtx.lineTo(lightCanvas.width / 2, lightCanvas.height);
                lightCtx.lineTo(lightCanvas.width / 2, 0);
                lightCtx.closePath();
                lightCtx.clip();
            }

            lightCtx.globalAlpha = 1;
            var grd = lightCtx.createRadialGradient(x,y,0,x,y,radius);
            grd.addColorStop(0,"black");
            grd.addColorStop(1,"transparent");
            lightCtx.fillStyle = grd;
            lightCtx.fillRect(x-radius, y-radius, radius * 2, radius * 2);

            lightCtx.restore();
        },

        //tints look more natural if tint applied before "createLightCircle", gradient is smoother
        createLightTint: function(x, y, radius, alpha, color) {

            //Clips light that extends to other side of the canvas
            lightCtx.save();

            lightCtx.globalCompositeOperation = "source-over";

            if (x < lightCanvas.width / 2) {
                lightCtx.beginPath();
                lightCtx.lineTo(0,0);
                lightCtx.lineTo(lightCanvas.width / 2,0);
                lightCtx.lineTo(lightCanvas.width / 2, lightCanvas.height);
                lightCtx.lineTo(0, lightCanvas.height);
                lightCtx.lineTo(0,0);
                lightCtx.closePath();
                lightCtx.clip();
            } else {
                lightCtx.beginPath();
                lightCtx.lineTo(lightCanvas.width / 2,0);
                lightCtx.lineTo(lightCanvas.width,0);
                lightCtx.lineTo(lightCanvas.width, lightCanvas.height);
                lightCtx.lineTo(lightCanvas.width / 2, lightCanvas.height);
                lightCtx.lineTo(lightCanvas.width / 2, 0);
                lightCtx.closePath();
                lightCtx.clip();
            }

            lightCtx.globalAlpha = alpha;
            var grd = lightCtx.createRadialGradient(x,y,0,x,y,radius);
            grd.addColorStop(0, color);
            grd.addColorStop(1,"transparent");
            lightCtx.fillStyle = grd;
            lightCtx.fillRect(x-radius, y-radius, radius * 2, radius * 2);

            lightCtx.restore();
        },

        createLightCone: function(x, y, direction, length) {

            //Clips light that extends to other side of the canvas
            lightCtx.save();

            lightCtx.globalCompositeOperation = "destination-out";
            lightCtx.globalAlpha = 1;
            var angle = Math.PI / 2;

            if (x < lightCanvas.width / 2) {
                lightCtx.beginPath();
                lightCtx.lineTo(0,0);
                lightCtx.lineTo(lightCanvas.width / 2,0);
                lightCtx.lineTo(lightCanvas.width / 2, lightCanvas.height);
                lightCtx.lineTo(0, lightCanvas.height);
                lightCtx.lineTo(0,0);
                lightCtx.clip();
            } else {
                lightCtx.beginPath();
                lightCtx.lineTo(lightCanvas.width / 2,0);
                lightCtx.lineTo(lightCanvas.width,0);
                lightCtx.lineTo(lightCanvas.width, lightCanvas.height);
                lightCtx.lineTo(lightCanvas.width / 2, lightCanvas.height);
                lightCtx.lineTo(lightCanvas.width / 2, 0);
                lightCtx.clip();
            }

            if (direction === GLOBAL.direction.right) {
                angle = 0;
            }
            else if (direction === GLOBAL.direction.left) {
                angle = Math.PI;
            }
            else if (direction === GLOBAL.direction.up) {
                angle = -Math.PI / 2;
            }
            else if (direction === GLOBAL.direction.down) {
                angle = Math.PI / 2;
            }
            else if (direction === GLOBAL.direction.upRight) {
                angle = - Math.PI / 4;
            }
            else if (direction === GLOBAL.direction.upLeft) {
                angle = - 3 * Math.PI / 4;
            }
            else if (direction === GLOBAL.direction.downRight) {
                angle = Math.PI / 4;
            }
            else if (direction === GLOBAL.direction.downLeft) {
                angle = 3 * Math.PI / 4;
            }
            lightCtx.globalAlpha = .6;

            //draw cone for flashlight

            lightCtx.beginPath();
            lightCtx.lineTo(x, y);
            //ccwx == counterclockwise
            var cwx = x + (length ) * (Math.cos(angle + Math.PI/8));
            var ccwx = x + (length) * (Math.cos(angle - Math.PI/8));


            lightCtx.lineTo(cwx, y +(length) * (Math.sin(angle + Math.PI/8)));
            lightCtx.lineTo(ccwx, y + (length) * (Math.sin(angle - Math.PI/8)));
            lightCtx.lineTo(x, y);
            lightCtx.closePath();


            var grd = lightCtx.createRadialGradient(x,y,100,x,y, 150);
            grd.addColorStop(0,"black");
            grd.addColorStop(1,"transparent");
            lightCtx.fillStyle = grd;
            lightCtx.fill();

            lightCtx.restore();
        },

        createShadows: function(x,y,lightRadius) {

            staticCtx.save();

            staticCtx.fillStyle = "black";
            staticCtx.globalAlpha = .02;
            staticCtx.globalCompositeOperation = "source-over";

            if (x < lightCanvas.width / 2) {
                if (GLOBAL.curLevel.neutralTileMatrix != null) {

                    var startX =  Math.floor((x  - lightRadius) / GLOBAL.tileW);
                    var endX = Math.ceil((x  + lightRadius) / GLOBAL.tileW);
                    var startY =  Math.floor((y  - lightRadius) / GLOBAL.tileW);
                    var endY =  Math.ceil((y  + lightRadius) / GLOBAL.tileW);

                    if (startX < 0) {
                        startX = 0;
                    }
                    if (endX > GLOBAL.curLevel.tileNumX) {
                        endX = GLOBAL.curLevel.tileNumX;
                    }

                    if (startY < 0) {
                        startY = 0;
                    }
                    if (endY > GLOBAL.curLevel.tileNumX) {
                        endY = GLOBAL.curLevel.tileNumX;
                    }

                    for (var indexX = startX; indexX < endX; indexX++) {
                        for (var indexY = startY; indexY < endY; indexY++) {
                            if (GLOBAL.curLevel.neutralTileMatrix[indexX][indexY].base != null && GLOBAL.curLevel.neutralTileMatrix[indexX][indexY].base.has("NoLight")) {


                                var topLeftCorner;
                                topLeftCorner = makeVector(indexX * GLOBAL.tileW, indexY * GLOBAL.tileW);


                                var topRightCorner;
                                topRightCorner = makeVector((1+indexX) * GLOBAL.tileW, indexY * GLOBAL.tileW);

                                var bottomLeftCorner;
                                bottomLeftCorner = makeVector(indexX * GLOBAL.tileW, (1+indexY) * GLOBAL.tileW);

                                var bottomRightCorner;
                                bottomRightCorner = makeVector((1+indexX) * GLOBAL.tileW, (1+indexY) * GLOBAL.tileW);

                                //
                                var topLeftToTopRightNormal = makeVector(topRightCorner._y - topLeftCorner._y, topRightCorner._x - topLeftCorner._x);
                                var topRightToBottomRightNormal = makeVector(bottomRightCorner._y - topRightCorner._y, bottomRightCorner._x - topRightCorner._x);
                                var bottomRightToBottomLeftNormal = makeVector(bottomLeftCorner._y - bottomRightCorner._y, bottomLeftCorner._x - bottomRightCorner._x);
                                var bottomLeftToTopLeftNormal = makeVector(topLeftCorner._y - bottomLeftCorner._y, topLeftCorner._x - bottomLeftCorner._x);

                                var lightToCenter = makeVector(x - ((bottomRightCorner._x + topLeftCorner._x) / 2), y - ((bottomRightCorner._y + topLeftCorner._y) / 2));



                                var dot1 = topLeftToTopRightNormal._x * lightToCenter._x + topLeftToTopRightNormal._y * lightToCenter._y;
                                var dot2 = topRightToBottomRightNormal._x * lightToCenter._x + topRightToBottomRightNormal._y * lightToCenter._y;
                                var dot3 = bottomRightToBottomLeftNormal._x * lightToCenter._x + bottomRightToBottomLeftNormal._y * lightToCenter._y;
                                var dot4 = bottomLeftToTopLeftNormal._x * lightToCenter._x + bottomLeftToTopLeftNormal._y * lightToCenter._y;

                                if (dot3 > 0) {
                                    // staticCtx.fillStyle = "rgba(0, 0, 255, .5)";
                                    lightCtx.beginPath();
                                    staticCtx.moveTo(bottomRightCorner._x,bottomRightCorner._y);
                                    staticCtx.lineTo(bottomRightCorner._x + (bottomRightCorner._x - x) * 1.5, bottomRightCorner._y + (bottomRightCorner._y - y) * 1.5);
                                    staticCtx.lineTo(bottomLeftCorner._x + (bottomLeftCorner._x - x) * 1.5, bottomLeftCorner._y + (bottomLeftCorner._y - y) * 1.5);
                                    staticCtx.lineTo(bottomLeftCorner._x, bottomLeftCorner._y);
                                    staticCtx.closePath();
                                    staticCtx.fill();

                                }
                                if (dot4 > 0) {
                                    // staticCtx.fillStyle = "rgba(255, 0, 0, .5)";
                                    lightCtx.beginPath();
                                    staticCtx.moveTo(topRightCorner._x,topRightCorner._y);
                                    staticCtx.lineTo(topRightCorner._x + (topRightCorner._x - x) * 1.5, topRightCorner._y + (topRightCorner._y - y) * 1.5);
                                    staticCtx.lineTo(bottomRightCorner._x + (bottomRightCorner._x - x) * 1.5, bottomRightCorner._y + (bottomRightCorner._y - y) * 1.5);
                                    staticCtx.lineTo(bottomRightCorner._x, bottomRightCorner._y);
                                    staticCtx.closePath();
                                    staticCtx.fill();
                                }
                                if (dot1 > 0) {
                                    // staticCtx.fillStyle = "rgba(0, 255, 0, .5)";
                                    lightCtx.beginPath();
                                    staticCtx.moveTo(topLeftCorner._x,topLeftCorner._y);
                                    staticCtx.lineTo(topLeftCorner._x + (topLeftCorner._x - x) * 1.5, topLeftCorner._y + (topLeftCorner._y - y) * 1.5);
                                    staticCtx.lineTo(topRightCorner._x + (topRightCorner._x - x) * 1.5, topRightCorner._y + (topRightCorner._y - y) * 1.5);
                                    staticCtx.lineTo(topRightCorner._x, topRightCorner._y);
                                    staticCtx.closePath();
                                    staticCtx.fill();
                                }
                                if (dot2 > 0) {
                                    lightCtx.beginPath();
                                    staticCtx.moveTo(bottomLeftCorner._x,bottomLeftCorner._y);
                                    staticCtx.lineTo(bottomLeftCorner._x + (bottomLeftCorner._x - x) * 1.5, bottomLeftCorner._y + (bottomLeftCorner._y - y) * 1.5);
                                    staticCtx.lineTo(topLeftCorner._x + (topLeftCorner._x - x) * 1.5, topLeftCorner._y + (topLeftCorner._y - y) * 1.5);
                                    staticCtx.lineTo(topLeftCorner._x, topLeftCorner._y);
                                    staticCtx.closePath();
                                    staticCtx.fill();
                                }
                            }
                        }
                    }

                }
                staticCtx.restore();

            } else {
                if (GLOBAL.curLevel.dangerousTileMatrix != null) {

                    var startX =  Math.floor((x  - lightRadius - lightCanvas.width / 2) / GLOBAL.tileW);
                    var endX = Math.ceil((x  + lightRadius - lightCanvas.width / 2) / GLOBAL.tileW);
                    var startY =  Math.floor((y  - lightRadius) / GLOBAL.tileW);
                    var endY =  Math.ceil((y  + lightRadius) / GLOBAL.tileW);

                    if (startX < 0) {
                        startX = 0;
                    }
                    if (endX > GLOBAL.curLevel.tileNumX) {
                        endX = GLOBAL.curLevel.tileNumX;
                    }

                    if (startY < 0) {
                        startY = 0;
                    }
                    if (endY > GLOBAL.curLevel.tileNumX) {
                        endY = GLOBAL.curLevel.tileNumX;
                    }


                    for (var indexX = startX; indexX < endX; indexX++) {
                        for (var indexY = startY; indexY < endY; indexY++) {
                            if (GLOBAL.curLevel.dangerousTileMatrix[indexX][indexY].base != null && GLOBAL.curLevel.dangerousTileMatrix[indexX][indexY].base.has("NoLight")) {


                                var topLeftCorner;
                                topLeftCorner = makeVector(indexX * GLOBAL.tileW + lightCanvas.width / 2, indexY * GLOBAL.tileW);


                                var topRightCorner;
                                topRightCorner = makeVector((1+indexX) * GLOBAL.tileW + lightCanvas.width / 2, indexY * GLOBAL.tileW);

                                var bottomLeftCorner;
                                bottomLeftCorner = makeVector(indexX * GLOBAL.tileW + lightCanvas.width / 2, (1+indexY) * GLOBAL.tileW);

                                var bottomRightCorner;
                                bottomRightCorner = makeVector((1+indexX) * GLOBAL.tileW + lightCanvas.width / 2, (1+indexY) * GLOBAL.tileW);

                                //
                                var topLeftToTopRightNormal = makeVector(topRightCorner._y - topLeftCorner._y, topRightCorner._x - topLeftCorner._x);
                                var topRightToBottomRightNormal = makeVector(bottomRightCorner._y - topRightCorner._y, bottomRightCorner._x - topRightCorner._x);
                                var bottomRightToBottomLeftNormal = makeVector(bottomLeftCorner._y - bottomRightCorner._y, bottomLeftCorner._x - bottomRightCorner._x);
                                var bottomLeftToTopLeftNormal = makeVector(topLeftCorner._y - bottomLeftCorner._y, topLeftCorner._x - bottomLeftCorner._x);

                                var lightToCenter = makeVector(x - ((bottomRightCorner._x + topLeftCorner._x) / 2), y - ((bottomRightCorner._y + topLeftCorner._y) / 2));



                                var dot1 = topLeftToTopRightNormal._x * lightToCenter._x + topLeftToTopRightNormal._y * lightToCenter._y;
                                var dot2 = topRightToBottomRightNormal._x * lightToCenter._x + topRightToBottomRightNormal._y * lightToCenter._y;
                                var dot3 = bottomRightToBottomLeftNormal._x * lightToCenter._x + bottomRightToBottomLeftNormal._y * lightToCenter._y;
                                var dot4 = bottomLeftToTopLeftNormal._x * lightToCenter._x + bottomLeftToTopLeftNormal._y * lightToCenter._y;

                                if (dot3 > 0) {
                                    // staticCtx.fillStyle = "rgba(0, 0, 255, .5)";
                                    lightCtx.beginPath();
                                    staticCtx.moveTo(bottomRightCorner._x,bottomRightCorner._y);
                                    staticCtx.lineTo(bottomRightCorner._x + (bottomRightCorner._x - x) * 1.5, bottomRightCorner._y + (bottomRightCorner._y - y) * 1.5);
                                    staticCtx.lineTo(bottomLeftCorner._x + (bottomLeftCorner._x - x) * 1.5, bottomLeftCorner._y + (bottomLeftCorner._y - y) * 1.5);
                                    staticCtx.lineTo(bottomLeftCorner._x, bottomLeftCorner._y);
                                    staticCtx.closePath();
                                    staticCtx.fill();

                                }
                                if (dot4 > 0) {
                                    // staticCtx.fillStyle = "rgba(255, 0, 0, .5)";
                                    lightCtx.beginPath();
                                    staticCtx.moveTo(topRightCorner._x,topRightCorner._y);
                                    staticCtx.lineTo(topRightCorner._x + (topRightCorner._x - x) * 1.5, topRightCorner._y + (topRightCorner._y - y) * 1.5);
                                    staticCtx.lineTo(bottomRightCorner._x + (bottomRightCorner._x - x) * 1.5, bottomRightCorner._y + (bottomRightCorner._y - y) * 1.5);
                                    staticCtx.lineTo(bottomRightCorner._x, bottomRightCorner._y);
                                    staticCtx.closePath();
                                    staticCtx.fill();
                                }
                                if (dot1 > 0) {
                                    // staticCtx.fillStyle = "rgba(0, 255, 0, .5)";
                                    lightCtx.beginPath();
                                    staticCtx.moveTo(topLeftCorner._x,topLeftCorner._y);
                                    staticCtx.lineTo(topLeftCorner._x + (topLeftCorner._x - x) * 1.5, topLeftCorner._y + (topLeftCorner._y - y) * 1.5);
                                    staticCtx.lineTo(topRightCorner._x + (topRightCorner._x - x) * 1.5, topRightCorner._y + (topRightCorner._y - y) * 1.5);
                                    staticCtx.lineTo(topRightCorner._x, topRightCorner._y);
                                    staticCtx.closePath();
                                    staticCtx.fill();
                                }
                                if (dot2 > 0) {
                                    lightCtx.beginPath();
                                    staticCtx.moveTo(bottomLeftCorner._x,bottomLeftCorner._y);
                                    staticCtx.lineTo(bottomLeftCorner._x + (bottomLeftCorner._x - x) * 1.5, bottomLeftCorner._y + (bottomLeftCorner._y - y) * 1.5);
                                    staticCtx.lineTo(topLeftCorner._x + (topLeftCorner._x - x) * 1.5, topLeftCorner._y + (topLeftCorner._y - y) * 1.5);
                                    staticCtx.lineTo(topLeftCorner._x, topLeftCorner._y);
                                    staticCtx.closePath();
                                    staticCtx.fill();
                                }
                            }
                        }
                    }

                }
            }
        }

    }

}());