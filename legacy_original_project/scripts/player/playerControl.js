
(function() {
    Crafty.c("PlayerControl", {
        upKey : 0,
        downKey : 0,
        leftKey : 0,
        rightKey : 0,
        previousDir : GLOBAL.direction.none,
        moveKeyPressed : false,

        init : function() {
            //dimensionTearModule.i
            this.keyState = {up: false, down: false, left: false, right: false};
        },

        setPlayer1Control : function() {
            this.upKey = GLOBAL.p1Keys.Up;
            this.downKey = GLOBAL.p1Keys.Down;
            this.leftKey = GLOBAL.p1Keys.Left;
            this.rightKey = GLOBAL.p1Keys.Right;
        },

        setPlayer2Control : function() {
            this.upKey = GLOBAL.p2Keys.Up;
            this.downKey = GLOBAL.p2Keys.Down;
            this.leftKey = GLOBAL.p2Keys.Left;
            this.rightKey = GLOBAL.p2Keys.Right;
        },

        movementKeyDown : function(keyCode) {
            //if keys are down, set the direction
            if (keyCode === this.leftKey) {
                this.keyState.left = true;
                MyAudio.playLoopedSound("walk");
                if (!this.moveKeyPressed) {
                    this.moveKeyPressed = true;
                }
            }
            if (keyCode === this.rightKey) {
                this.keyState.right = true;
//                console.log("right down");
                MyAudio.playLoopedSound("walk");
                if (!this.moveKeyPressed) {
                    this.moveKeyPressed = true;
                }
            }
            if (keyCode === this.upKey) {
                this.keyState.up = true;
                MyAudio.playLoopedSound("walk");
                if (!this.moveKeyPressed) {
                    this.moveKeyPressed = true;
                }
            }
            if (keyCode === this.downKey) {
                this.keyState.down = true;
//                console.log("down down");
                MyAudio.playLoopedSound("walk");
                if (!this.moveKeyPressed) {
                    this.moveKeyPressed = true;
                }
            }

            this.setDirectionFromKeys();

            /*
             If direction that new key indicates is orthogonal to player's direction clockwise,
             increase direction value clockwise, and vice versa.
             6 and -6 is the when two directions are left and down
             */
//            var directionDelta = keyDirection - this.previousDir;
//            if(this.previousDir == GLOBAL.direction.none && this.moveKeyPressed){
//                this.setPlayerDirection(keyDirection);
//            }else if(directionDelta === 2 || directionDelta === -2) {
//                this.setPlayerDirection(this.previousDir + directionDelta / 2);
//            } else if(directionDelta === 6 || directionDelta === -6) {
//                this.setPlayerDirection(GLOBAL.direction.downLeft);
//            }
        },

        movementKeyUp : function(keyCode) {
            var keyUp = false;
            if (keyCode === this.leftKey) {
                this.keyState.left = false;
                keyUp = true;
            }
            if (keyCode === this.rightKey) {
                this.keyState.right = false;
                keyUp = true;
//                console.log("right up");
            }
            if (keyCode === this.upKey) {
                this.keyState.up = false;
                keyUp = true;
            }
            if (keyCode === this.downKey) {
                this.keyState.down = false;
                keyUp = true;
//                console.log("down up");
            }

            if (keyUp && !this.keyState.left && !this.keyState.right && !this.keyState.up && !this.keyState.down) {
                this.previousDir = GLOBAL.direction.none;
//                console.log("stop: " + "down: " + this.keyState.down +  "right: " + this.keyState.right);
                MyAudio.stop("walk");
                this.moveKeyPressed = false;
            }

            this.setDirectionFromKeys();
        },

        setPlayerDirection : function(direction){
            this.direction = direction;
        },

        setDirectionFromKeys : function() {
            if (this.keyState.left) {
                if (this.keyState.up)
                    this.setPlayerDirection(GLOBAL.direction.upLeft);
                else if (this.keyState.down)
                    this.setPlayerDirection(GLOBAL.direction.downLeft);
                else if (!this.keyState.right)
                    this.setPlayerDirection(GLOBAL.direction.left);
            }
            else if (this.keyState.right) {
                if (this.keyState.up)
                    this.setPlayerDirection(GLOBAL.direction.upRight);
                else if (this.keyState.down)
                    this.setPlayerDirection(GLOBAL.direction.downRight);
                else
                    this.setPlayerDirection(GLOBAL.direction.right);
            }
            else if (this.keyState.up && !this.keyState.down) {
                this.setPlayerDirection(GLOBAL.direction.up);
            }
            else if (this.keyState.down) {
                this.setPlayerDirection(GLOBAL.direction.down);
            }
        }
    });
})();