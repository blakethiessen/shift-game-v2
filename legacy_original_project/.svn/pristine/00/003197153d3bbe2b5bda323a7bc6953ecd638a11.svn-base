// miscComponents.js
// Contains all components that
// are not world objects or items.

(function() {

    // Needed to tag objects we want the player
    // to collide with.
    Crafty.c("Collides", {
        init: function() {
            this.addComponent("Collision");
            this.onCollision = null;
        }
    });

    Crafty.c("MovablePlayerEnemy", {
        init: function() {
            this.velocity = {x: 0, y: 0};
        },
        direction: GLOBAL.direction.none,
        updatePosition : function() {
            this.x += this.velocity.x;
            this.y += this.velocity.y;
        },
        scaleSpeed : function(factor){
            this.velocity.x *= factor;
            this.velocity.y *= factor;
        }
    });

    Crafty.c("LightHalo", {
        haloRadius: 50,
        init:function() {
            this.bind("DoLighting", function() {
                lightFX.createLightCircle(this._x + this._w / 2, this._y + this._h /2 , this.haloRadius);
//                lightFX.createLightCone(this._x + this._w / 2, this._y + this._h /2, this.direction, 0);
            })
        }
    });

    Crafty.c("FireHalo", {
        haloRadius: 80,
        pulseTimer: 10,
        currentTimer: 9,
        init:function() {
            this.bind("DoLighting", function() {
                if (this.isOn) {
                    if (this.currentTimer > this.pulseTimer) {
                        this.currentTimer = 9;
                    } else {
                        this.currentTimer++;
                    }

                    //looks more natural if tint applied first
                    lightFX.createLightTint(this._x + this._w / 2, this._y + this._h /2 , this.haloRadius * this.currentTimer / this.pulseTimer, 1, "orange");
                    lightFX.createLightCircle(this._x + this._w / 2, this._y + this._h /2 , this.haloRadius * this.currentTimer / this.pulseTimer);
                }
            })
        }
    });

    Crafty.c("PopUpText", {
        setPopUpText: function(text) {
            this.popUpText = text;
        },
        showPopUpText : function(player, faceDirection) {
            if (faceDirection === GLOBAL.direction.left && player._x < 100) {
                player.displayDescription(GLOBAL.direction.right);
            }
            else if (faceDirection === GLOBAL.direction.up && player._y < 100) {
                player.displayDescription(GLOBAL.direction.down);
            }
            else if (faceDirection === GLOBAL.direction.right && player._x > GLOBAL.viewport.h - 100) {
                player.displayDescription(GLOBAL.direction.left);
            }
            else if (faceDirection === GLOBAL.direction.down && player._x > GLOBAL.viewport.w - 100) {
                player.displayDescription(GLOBAL.direction.up);
            }
            else {
                player.displayDescription(faceDirection);
            }
        }
    });

    Crafty.c("TextPrinter", {
        init: function() {
            this.addComponent("Delay")
                .css({"font": "10pt Courier", "color": "#FFFFFF", "text-align": "center"});
        },
        // 14 = Line width
        print: function(inputText) {
            var spacedText = "";
            var allCharsInArray = false;
            var start = 0;
            var lineLength = 14;

            while (!allCharsInArray) {
                if (start + lineLength >= inputText.length) {
                    spacedText = spacedText.concat(inputText.substring(start, inputText.length));
                    allCharsInArray = true;
                }
                else {
                    for (var i = start + lineLength; i > start; i--) {
                        if (inputText.charAt(i) === " ") {
                            spacedText = spacedText.concat(inputText.substring(start, i) + "<br />");
                            start = i + 1;
                            break;
                        }
                    }
                }
            }

            this.text = document.createElement('div');
            // 120px width means max font characters/line is 14.
            this.text.setAttribute("style", "position: absolute; font-style: normal; font-variant: normal; font-weight: normal;" +
                " font-size: 10pt; line-height: normal; font-family: Courier; color: rgb(255, 255, 255); text-align: center;" +
                " visibility: visible; width: 120px; z-index: 20; opacity: 1; -webkit-transform: translate3d(" + this._x + "px, " + this._y + "px, 0);");
            document.getElementById("cr-stage").appendChild(this.text);

            var start = [0, 0, 0, 0];
            var end = 0;
            for (var i = 0; i < spacedText.length; i++) {
                this.delay(function() {
                    // If the char is a line break...
                    if (spacedText.charAt(end - 1) === "<") {
                        if (start[1] === 0) {
                            start[1] = end + 5;
                            end += 5;
                        }
                        else if (start[2] === 0) {
                            start[2] = end + 5;
                            end += 5;
                        }
                        else if (start[3] === 0) {
                            start[3] = end + 5;
                            end += 5;
                        }
                            else {
                            start[0] = start[1];
                            start[1] = start[2];
                            start[2] = start[3];
                            start[3] = end + 5;
                            end += 5;
                        }
                    }
                    else {
                        this.text.innerHTML = spacedText.substring(start[0], end);
                        end++;
                    }
                }, i * 50 - Math.random() * 25);
            }
        },
        deleteText: function() {
            document.getElementById("cr-stage").removeChild(this.text);
        }
    });

})();