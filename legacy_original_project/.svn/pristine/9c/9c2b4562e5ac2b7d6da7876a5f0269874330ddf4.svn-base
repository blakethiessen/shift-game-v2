// player.js
// Contains the player component.

(function() {

    Crafty.c("Player", {
        //Tiles that player has walked
        speed: 2,
        old_pos: [0,0],
        whichPlayer : 1,
        leftTile : null,
        rightTile : null,
        upTile : null,
        downTile : null,
        states : {Normal : 0, Bruised : 1, Injured : 2, Dying : 3},
        curState : 0,
        timer : 0,
        action : "",
        useItemKey : 0,
        interactKey : 0,
        inventoryKey : 0,
        flashLightDir : GLOBAL.direction.none,
        isActivated : false,
        interactingObject : null,
        popUpTextDelayer : null,
        speedRegenDelayer: null,
        isAlive: true,
        boxColliding: false,

        player: function(playerNumber) {
            this.popUpTextDelayer = Crafty.e("2D, Delay");
            this.speedRegenDelayer = Crafty.e("2D, Delay");
            this.speedRegenRunning = false;

            this.direction = GLOBAL.direction.down;
            this.velocity = {x: 0, y: 0};

            if(playerNumber === 1) {
                this.whichPlayer = 1;
                GLOBAL.player1 = this;
            }else{
                this.whichPlayer = 2;
                GLOBAL.player2 = this;
            }

            // interactDelayer used for inventory item dropping and picking up
            var interactDelayer = Crafty.e("2D, Delay");
            var itemDropped = false;

            if (playerNumber === 1) {
                this.addComponent('N_playerDown, PlayerControl, Inventory, Animated, Collision, MovingLight, PopUpTextGen, PathFinding')
                    .setAnimations();
                this.setPlayer1Control();
                this.useItemKey = GLOBAL.p1Keys.UseItem;
                this.interactKey = GLOBAL.p1Keys.Interact;
                this.inventoryKey = GLOBAL.p1Keys.Inventory;
            }
            else {
                this.addComponent('D_playerDown, PlayerControl, Inventory, Animated, Collision, MovingLight, PopUpTextGen, PathFinding')
                    .setAnimations();
                this.setPlayer2Control();
                this.useItemKey = GLOBAL.p2Keys.UseItem;
                this.interactKey = GLOBAL.p2Keys.Interact;
                this.inventoryKey = GLOBAL.p2Keys.Inventory;
            }

            this.bind('KeyDown', function(e) {
                if (this.isAlive) {
                    this.movementKeyDown(e.keyCode);

                    if (e.keyCode === this.interactKey && this.interactingObject != null) {
                        // If the object is an item, you can just stand on top of the item.
                        if (this.interactingObject.has("Item")) {
                            this.addNewItem(this.interactingObject);
                            persistence.removeItemFromPersistence(this.interactingObject);
                        }
                        // If it's a world object, it's probably collidable and you have to stand and face it.
                        else if (this.nextToAndFace(this.interactingObject)) {
                            this.interactingObject.interact(this);
                        }
                    }
                    if (e.keyCode === this.useItemKey && this.items.length > 0) {
                        this.useCurrentItem(this, this.direction, this.interactingObject);
                    }

                    // Context sensitive key:
                    //    - Cycles through inventory when released (defined in "KeyUp")
                    //    - If held, drops current item (defined here).
                    if (e.keyCode === this.inventoryKey) {
                        var player = this;
                        interactDelayer.delay(function() {
                            itemDropped = true;
                            var item = player.removeCurrentItem();
                            if (item !== null) {
                                var x;
                                var y;
                                if (player.direction === GLOBAL.direction.up) {
                                    x = player._x;
                                    y = player._y - GLOBAL.tileW;
                                }
                                else if (player.direction === GLOBAL.direction.down) {
                                    x = player._x;
                                    y = player._y + GLOBAL.tileW;
                                }
                                else if (player.direction === GLOBAL.direction.left) {
                                    x = player._x - GLOBAL.tileW;
                                    y = player._y;
                                }
                                else if (player.direction === GLOBAL.direction.right) {
                                    x = player._x + GLOBAL.tileW;
                                    y = player._y;
                                }
                                item.attr( {x: x, y: y, visible: true} )

                                persistence.addItemToPersistence(item);
                            }
                            else {
                                MyAudio.playSound("error");
                            }
                        }, 1000);
                    }
                }
            });

            this.bind('KeyUp', function(e) {
                if (this.isAlive) {
                    this.movementKeyUp(e.keyCode);

                    if (e.keyCode === this.inventoryKey) {
                        if (itemDropped) {
                            this.cycleItems();
                            itemDropped = false;
                        }
                        else {
                            if (this.items.length > 0) {
                                this.cycleAndDisplayItems();
                            }
                            interactDelayer.destroy();
                            interactDelayer = Crafty.e("2D, Delay");
                        }
                    }

                    this.pauseAnimation();
                }
            });

            this.bind('EnterFrame', function() {
                if (this.isAlive) {
                    if (this.moveKeyPressed) {
                        //move the player in a direction depending on the booleans
                        //only move the player in one direction at a time (up/down/left/right)
                        if(this.leftTile) {
                            this.leftTile.x = this._x - this._w;
                            this.leftTile.y = this._y;
                            this.rightTile.x = this._x + this._w;
                            this.rightTile.y = this._y;
                            this.upTile.x = this._x;
                            this.upTile.y = this._y - this._h;
                            this.downTile.x = this._x;
                            this.downTile.y = this._y + this._h;
                        }

                        Crafty.trigger("PlayerMoving", this.whichPlayer);
                        this.old_pos = [this._x, this._y];

                        this.walk();

                        // UPDATE POSITION------------------------------------
                        this.x += this.velocity.x;

                        this.checkForInteractableCollisions();

                        var collidedObj = this.hit("Collides");
                        if (collidedObj) {
                            if (collidedObj[0].obj.onCollision !== null)
                                collidedObj[0].obj.onCollision(this);

                            this.x -= this.velocity.x;
                        }

                        this.y += this.velocity.y;

                        if (!this.interactingObject)
                            this.checkForInteractableCollisions();

                        collidedObj = this.hit("Collides");
                        if (collidedObj) {
                            if (collidedObj[0].obj.onCollision !== null)
                                collidedObj[0].obj.onCollision(this);

                            this.y -= this.velocity.y;
                        }
                        // UPDATE POSITION END--------------------------------

                        //TODO: refactor it
                        this.timer = 0;

                        // Check for box collisions---------------------------
                        var box = this.hit("Box");

                        if (box) {
                            this.boxColliding = true;

                            var xChange = this._x - this.old_pos[0];
                            var yChange = this._y - this.old_pos[1];

                            var boxObj = box[0].obj;

                            boxObj.x += xChange;
                            boxObj.connectedObj.x += xChange;

                            if (boxObj.hit("Collides") || boxObj.hit("Door") ||
                                boxObj.hit("Box") || boxObj.connectedObj.hit("Player") ||
                                boxObj.connectedObj.hit("Collides")) {
                                boxObj.x -= xChange;
                                boxObj.connectedObj.x -= xChange;
                                this.x = this.old_pos[0];
                            }

                            boxObj.y += yChange;
                            boxObj.connectedObj.y += yChange;

                            if (boxObj.hit("Collides") || boxObj.hit("Door") ||
                                boxObj.hit("Box") || boxObj.connectedObj.hit("Player") ||
                                boxObj.connectedObj.hit("Collides")) {
                                boxObj.y -= yChange;
                                boxObj.connectedObj.y -= yChange;
                                this.y = this.old_pos[1];
                            }
                        }
                        else if (this.boxColliding) {
                            this.boxColliding = false;
                        }
                    }
                    else if(this.timer > 0){
                        this.playActionAnimation(this.action);
                        this.timer-=2;
                    }
                }
            });

            // ADD SPECIAL CHARACTERISTICS

            // When a shift occurs, if player is shifted into a wall, he takes damage.
            this.bind("Shift", function() {
                if (this.hit("Collides")) {
                    this.takeDamage(.9);
                }
            });

            var that = this;
            this.bind("SceneChange", function() {
                that.setupPlayerSpawnAndAnimation();
            });

            this.setupPlayerSpawnAndAnimation();

            return this;
        },

        setupPlayerSpawnAndAnimation : function() {
            if (this.whichPlayer === 1) {
                this.x = GLOBAL.p1EntrancePosition[0];
                this.y = GLOBAL.p1EntrancePosition[1];
            }
            else {
                this.x = GLOBAL.p2EntrancePosition[0];
                this.y = GLOBAL.p2EntrancePosition[1];
            }

            var leftTile = Crafty.e("2D, Canvas, S_empty, Animated, Persist")
                .attr({x:this._x - this._w, y: this._y, w: this._w, h: this._h});
            var rightTile = Crafty.e("2D, Canvas, S_empty, Animated, Persist")
                .attr({x:this._x + this._w, y: this._y, w: this._w, h: this._h});
            var upTile = Crafty.e("2D, Canvas, S_empty, Animated, Persist")
                .attr({x:this._x, y: this._y - this._h, w: this._w, h: this._h});
            var downTile = Crafty.e("2D, Canvas, S_empty, Animated, Persist")
                .attr({x:this._x, y: this._y + this._h, w: this._w, h: this._h});
            this.setAdjacentTile(leftTile, rightTile, upTile, downTile);
        },

        walk : function() {
            var adjustedSpeed;
            var adjustedDiagSpeed;
            if (this.boxColliding) {
                adjustedSpeed = this.speed / 4 * 3;
                adjustedDiagSpeed = adjustedSpeed / 1.4;
            }
            else {
                adjustedSpeed = this.speed;
                adjustedDiagSpeed = this.speed / 1.4;
            }
            switch (this.direction) {
                case (GLOBAL.direction.left):
                    this.velocity.x = -adjustedSpeed;
                    this.velocity.y = 0;
                    if(this.whichPlayer === 1) {
                        this.playAnimation(this.animation.player1Left, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }else{
                        this.playAnimation(this.animation.player2Left, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }
                    break;
                case (GLOBAL.direction.right):
                    this.velocity.x = adjustedSpeed;
                    this.velocity.y = 0;
                    if(this.whichPlayer === 1) {
                        this.playAnimation(this.animation.player1Right, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }else{
                        this.playAnimation(this.animation.player2Right, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }
                    break;
                case (GLOBAL.direction.up):
                    this.velocity.x = 0;
                    this.velocity.y = -adjustedSpeed;
                    if(this.whichPlayer === 1) {
                        this.playAnimation(this.animation.player1Up, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }else{
                        this.playAnimation(this.animation.player2Up, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }
                    break;
                case (GLOBAL.direction.down):
                    this.velocity.x = 0;
                    this.velocity.y = adjustedSpeed;
                    if(this.whichPlayer === 1){
                        this.playAnimation(this.animation.player1Down, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }else{
                        this.playAnimation(this.animation.player2Down, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }
                    break;
                case (GLOBAL.direction.downLeft):
                    this.velocity.x = - adjustedDiagSpeed;
                    this.velocity.y = adjustedDiagSpeed;
                    if(this.whichPlayer === 1) {
                        this.playAnimation(this.animation.player1DownLeft, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }else{
                        this.playAnimation(this.animation.player2DownLeft, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }
                    break;
                case (GLOBAL.direction.downRight):
                    this.velocity.x = adjustedDiagSpeed;
                    this.velocity.y = adjustedDiagSpeed;
                    if(this.whichPlayer === 1) {
                        this.playAnimation(this.animation.player1DownRight, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }else{
                        this.playAnimation(this.animation.player2DownRight, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }
                    break;
                case (GLOBAL.direction.upLeft):
                    this.velocity.x = -adjustedDiagSpeed;
                    this.velocity.y = -adjustedDiagSpeed;
                    if(this.whichPlayer === 1) {
                        this.playAnimation(this.animation.player1UpLeft, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }else{
                        this.playAnimation(this.animation.player2UpLeft, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }
                    break;
                case (GLOBAL.direction.upRight):
                    this.velocity.x = adjustedDiagSpeed;
                    this.velocity.y = -adjustedDiagSpeed;
                    if(this.whichPlayer === 1) {
                        this.playAnimation(this.animation.player1UpRight, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }else{
                        this.playAnimation(this.animation.player2UpRight, (GLOBAL.maxSpeed - adjustedSpeed) * 8 + 10);
                    }
                    break;
                default:
                    console.log("No direction when walk() is called?");
                    break;
            }

            this.flashLightDir = this.direction;
        },

        checkForInteractableCollisions : function() {
            // Check for interactable collisions------------------
            var obj = this.hit("Interactable");
            if (obj) {
                if (this.interactingObject === null) {
                    this.interactingObject = obj[0].obj;
                    addGlow(this.interactingObject);
                    var thePlayer = this;
                    this.popUpTextDelayer.delay(function() {
                        if (thePlayer.interactingObject !== null)
                            thePlayer.interactingObject.showPopUpText(thePlayer, thePlayer.nextToAndFace(thePlayer.interactingObject));
                    }, 1000);
                }
            }
            else if (this.interactingObject) {
                this.interactingObject = null;
                this.popUpTextDelayer.destroy();
                this.popUpTextDelayer = Crafty.e("2D, Delay");
            }

            removeGlow(this.interactingObject);
        },

        setPlayerActionAnimation : function(){
            var referBC = this.actionAnimation.playerTile.left.frames[0];
            var baseCoord = [referBC[0],referBC[1]];

            this.setPTileActionAnimation(this.actionAnimation.playerTile.left, baseCoord);
            this.leftTile.setActionAnimation(this, this.actionAnimation.leftTile.left, baseCoord);
            this.rightTile.setActionAnimation(this, this.actionAnimation.rightTile.left, baseCoord);
            this.upTile.setActionAnimation(this, this.actionAnimation.upTile.left, baseCoord);
            this.downTile.setActionAnimation(this, this.actionAnimation.downTile.left, baseCoord);

            this.setPTileActionAnimation(this.actionAnimation.playerTile.right, baseCoord);
            this.leftTile.setActionAnimation(this, this.actionAnimation.leftTile.right, baseCoord);
            this.rightTile.setActionAnimation(this, this.actionAnimation.rightTile.right, baseCoord);
            this.upTile.setActionAnimation(this, this.actionAnimation.upTile.right, baseCoord);
            this.downTile.setActionAnimation(this, this.actionAnimation.downTile.right, baseCoord);

            this.setPTileActionAnimation(this.actionAnimation.playerTile.up, baseCoord);
            this.leftTile.setActionAnimation(this, this.actionAnimation.leftTile.up, baseCoord);
            this.rightTile.setActionAnimation(this, this.actionAnimation.rightTile.up, baseCoord);
            this.upTile.setActionAnimation(this, this.actionAnimation.upTile.up, baseCoord);
            this.downTile.setActionAnimation(this, this.actionAnimation.downTile.up, baseCoord);

            this.setPTileActionAnimation(this.actionAnimation.playerTile.down, baseCoord);
            this.leftTile.setActionAnimation(this, this.actionAnimation.leftTile.down, baseCoord);
            this.rightTile.setActionAnimation(this, this.actionAnimation.rightTile.down, baseCoord);
            this.upTile.setActionAnimation(this, this.actionAnimation.upTile.down, baseCoord);
            this.downTile.setActionAnimation(this, this.actionAnimation.downTile.down, baseCoord);
        },

        playActionAnimation : function(action){
            this.setPlayerActionAnimation();
            if(this.direction === GLOBAL.direction.left){
                this.playAnimation(this.actionAnimation.playerTile.left, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.leftTile.playAnimation(this.actionAnimation.leftTile.left, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.rightTile.playAnimation(this.actionAnimation.rightTile.left, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.upTile.playAnimation(this.actionAnimation.upTile.left, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.downTile.playAnimation(this.actionAnimation.downTile.left, (GLOBAL.maxSpeed - this.speed) * 8 + 10);

            }else if(this.direction === GLOBAL.direction.right){
                this.playAnimation(this.actionAnimation.playerTile.right, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.leftTile.playAnimation(this.actionAnimation.leftTile.right, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.rightTile.playAnimation(this.actionAnimation.rightTile.right, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.upTile.playAnimation(this.actionAnimation.upTile.right, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.downTile.playAnimation(this.actionAnimation.downTile.right, (GLOBAL.maxSpeed - this.speed) * 8 + 10);

            }else if(this.direction === GLOBAL.direction.up){
                this.playAnimation(this.actionAnimation.playerTile.up, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.leftTile.playAnimation(this.actionAnimation.leftTile.up, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.rightTile.playAnimation(this.actionAnimation.rightTile.up, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.upTile.playAnimation(this.actionAnimation.upTile.up, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.downTile.playAnimation(this.actionAnimation.downTile.up, (GLOBAL.maxSpeed - this.speed) * 8 + 10);

            }else if(this.direction === GLOBAL.direction.down){
                this.playAnimation(this.actionAnimation.playerTile.down, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.leftTile.playAnimation(this.actionAnimation.leftTile.down, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.rightTile.playAnimation(this.actionAnimation.rightTile.down, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.upTile.playAnimation(this.actionAnimation.upTile.down, (GLOBAL.maxSpeed - this.speed) * 8 + 10);
                this.downTile.playAnimation(this.actionAnimation.downTile.down, (GLOBAL.maxSpeed - this.speed) * 8 + 10);

            }
        },

        setAnimations: function () {
            if (this.whichPlayer === 1) {
                this.setPlayerAnimation(this.animation.player1Left);
                this.setPlayerAnimation(this.animation.player1Right);
                this.setPlayerAnimation(this.animation.player1Up);
                this.setPlayerAnimation(this.animation.player1Down);
                this.setPlayerAnimation(this.animation.player1UpLeft);
                this.setPlayerAnimation(this.animation.player1UpRight);
                this.setPlayerAnimation(this.animation.player1DownLeft);
                this.setPlayerAnimation(this.animation.player1DownRight);

                this.setPlayerAnimation(this.animation.player1DeathLeft);
                this.setPlayerAnimation(this.animation.player1DeathRight);
                this.setPlayerAnimation(this.animation.player1DeathDown);
                this.setPlayerAnimation(this.animation.player1DeathUp);
            } else {
                this.setPlayerAnimation(this.animation.player2Left);
                this.setPlayerAnimation(this.animation.player2Right);
                this.setPlayerAnimation(this.animation.player2Up);
                this.setPlayerAnimation(this.animation.player2Down);
                this.setPlayerAnimation(this.animation.player2UpLeft);
                this.setPlayerAnimation(this.animation.player2UpRight);
                this.setPlayerAnimation(this.animation.player2DownLeft);
                this.setPlayerAnimation(this.animation.player2DownRight);

                this.setPlayerAnimation(this.animation.player2DeathLeft);
                this.setPlayerAnimation(this.animation.player2DeathRight);
                this.setPlayerAnimation(this.animation.player2DeathDown);
                this.setPlayerAnimation(this.animation.player2DeathUp);
            }
        },

        setAdjacentTile : function(leftTile, rightTile, upTile, downTile) {
            this.leftTile = leftTile;
            this.rightTile = rightTile;
            this.upTile = upTile;
            this.downTile = downTile;
        },

        heal: function(hpGained) {
            this.speed *= hpGained;

            if (this.speed > GLOBAL.maxSpeed) {
                this.speed = GLOBAL.maxSpeed;
            }
//            else if (GLOBAL.curHP <= 50) {
//                flashFX.stopContinuousFlash();
//                MyAudio.stop("heartBeat");
//            }
            this.changeHealthStateIfApplicable();
        },

        takeDamage: function(hpLost) {
            if (this.isAlive) {
                this.speed *= hpLost;

                this.changeHealthStateIfApplicable();

                // Players die if they are attacked while on the same tile.
                var p1TilePos = getTileCoord(GLOBAL.player1);
                var p2TilePos = getTileCoord(GLOBAL.player2);
                if (p1TilePos._x === p2TilePos._x && p1TilePos._y === p2TilePos._y) {
                    flashFX.stopContinuousFlash();

                    MyAudio.playSound("death");
                    flashFX.flash("red", .1);
                    // Freeze input and game processing.
                    this.isAlive = false;
                    this.otherPlayer.isAlive = false;

                    // PlayerMoving event will delete text from the screen.
                    Crafty.trigger("PlayerMoving", this.whichPlayer);
                    Crafty.trigger("PlayerMoving", this.otherPlayer.whichPlayer);

                    playDirectionalDeathAnimation(this);
                    playDirectionalDeathAnimation(this.otherPlayer);
                    var player = this;
                    Crafty.e("2D, Delay").delay(function() {
                        GLOBAL.player1.removeComponent("Persist")
                            .dePersistifyInventory();
                        GLOBAL.player2.removeComponent("Persist")
                            .dePersistifyInventory();

                        Crafty.scene("gameOverScreen");
                    }, 3000);
                }
                else {
                    flashFX.flash("red", .2);
                    MyAudio.playSound("damage");

                    var pathExists = pushPlayerToTarget(this, this.otherPlayer);
                    // If no path from our player to the other player exists, find a path from the other player.
                    if (!pathExists) {
                        pushPlayerToTarget(this.otherPlayer, this);
                    }

                    if (!this.speedRegenRunning) {
                        this.speedRegenRunning = true;
                        var that = this;
                        this.speedRegenDelayer.delay(function() {
                            if (that.speed < 2) {
                                that.speed += .1;
                                if (that.speed > 2)
                                    that.speed = 2;
                            }
                            else {
                                that.speedRegenDelayer.destroy();
                                that.speedRegenDelayer = Crafty.e("2D, Delay");
                                that.speedRegenRunning = false;
                            }
                        }, 5000, -1);
                    }

//                    if (this.WP >= 50) {
//                        var flashMod = (50 - this.WP) / 800;
//                        flashFX.startContinuousFlash(this.WP * 60, "red",
//                            .015 + flashMod, .01 + flashMod, .3 + flashMod * 2);
//
//                        if (this.WP >= 70) {
//                            MyAudio.playLoopedSound("heartBeat");
//                        }
//                    }
                }
            }
        },
        changeHealthStateIfApplicable : function(){
//            if (this.WP <= 25) {
//                this.curState = this.states.Normal;
//            }
//            else if (this.WP <= 50) {
//                this.curState = this.states.Bruised;
//            }
//            else if (this.WP <= 75) {
//                this.curState = this.states.Injured;
//            }
//            else {
//                this.curState = this.states.Dying;
//            }
        },
        //next to something and face it
        nextToAndFace : function(obj){
            var playerCoord = getTileCoord(this);
            var objCoord = getTileCoord(obj);
            if (playerCoord.x === objCoord.x && playerCoord.y === objCoord.y) {
                return this.direction;
            }
            if (this.direction === GLOBAL.direction.left && playerCoord.x - objCoord.x === 1 && (playerCoord.y >= objCoord.y - 1 || playerCoord.y <= objCoord.y + 1)){
                return GLOBAL.direction.left;
            }
            if (this.direction === GLOBAL.direction.right && objCoord.x - playerCoord.x === 1 && (playerCoord.y >= objCoord.y - 1 || playerCoord.y <= objCoord.y + 1)){
                return GLOBAL.direction.right;
            }
            if (this.direction === GLOBAL.direction.up && playerCoord.y - objCoord.y === 1 && (playerCoord.x >= objCoord.x - 1 || playerCoord.x <= objCoord.x + 1)){
                return GLOBAL.direction.up;
            }
            if (this.direction === GLOBAL.direction.down && objCoord.y - playerCoord.y === 1 && (playerCoord.x >= objCoord.x - 1 || playerCoord.x <= objCoord.x + 1)){
                return GLOBAL.direction.down;
            }
            return 0;
        },
        //next to something
        nextTo : function(obj){
            var playerCoord = getTileCoord(this);
            var objCoord = getTileCoord(obj);
            if (playerCoord.x - objCoord.x === 1 && playerCoord.y === objCoord.y){
                return true;
            }
            if (objCoord.x - playerCoord.x === 1 && playerCoord.y === objCoord.y){
                return true;
            }
            if (playerCoord.y - objCoord.y === 1 && playerCoord.x === objCoord.x){
                return true;
            }
            if (objCoord.y - playerCoord.y === 1 && playerCoord.x === objCoord.x){
                return true;
            }
            return false;
        },
        withinRange : function(obj, range) {
            var playerCoord = getTileCoord(this);
            var objCoord = getTileCoord(obj);
            if (Math.abs(playerCoord.x - objCoord.x) <= range && Math.abs(playerCoord.y - objCoord.y) <= range){
                return true;
            }

            return false;
        }
    });

    function pushPlayerToTarget(player, target) {
        var path = player.findPath(getTileCoord(player), getTileCoord(target));

        if (path.length > 0) {
            var distancePushed = Math.floor((path.length - 1) / (player.speed * 3));

            if (objInLeftSide(player))
                player.x = path[distancePushed]._x * GLOBAL.tileW;
            else
                player.x = path[distancePushed]._x * GLOBAL.tileW + GLOBAL.viewport.w / 2;

            player.y = path[distancePushed]._y * GLOBAL.tileW;

            return true;
        }

        return false;
    }

    function playDirectionalDeathAnimation(player) {
        if (player.direction === GLOBAL.direction.left || player.direction === GLOBAL.direction.upLeft) {
            player.playAnimation(player.animation.player1DeathLeft, 60);
        }
        else if (player.direction === GLOBAL.direction.right || player.direction === GLOBAL.direction.downRight) {
            player.playAnimation(player.animation.player1DeathRight, 60);
        }
        else if (player.direction === GLOBAL.direction.up || player.direction === GLOBAL.direction.upRight) {
            player.playAnimation(player.animation.player1DeathUp, 60);
        }
        else if (player.direction === GLOBAL.direction.down || player.direction === GLOBAL.direction.downLeft) {
            player.playAnimation(player.animation.player1DeathDown, 60);
        }
    }

    function addGlow(object) {
        if (object.has("Broom")) {
            object.addComponent("GL_broom")
        }
        else if (object.has("FryingPan")) {
            object.addComponent("GL_fryingPan")
        }
        else if (object.has("Plunger")) {
            object.addComponent("GL_plunger")
        }
        else if (object.has("BlackKey")) {
            object.addComponent("GL_blackKey")
        }
        else if (object.has("Key")) {
            object.addComponent("GL_woodKey")
        }
        else if (object.has("GreenGem")) {
            object.addComponent("GL_greenGem")
        }
        else if (object.has("BlueGem")) {
            object.addComponent("GL_greenGem")
        }
        else if (object.has("RedGem")) {
            object.addComponent("GL_greenGem")
        }
        else if (object.has("Food")) {
            object.addComponent("GL_chipBag")
        }
        else if (object.has("Flashlight")) {
            object.addComponent("GL_blueFlashlight")
        }
        else if (object.has("Flashlight2")) {
            object.addComponent("GL_blueFlashlight")
        }
        else if (object.has("Flashlight3")) {
            object.addComponent("GL_lantern")
        }
//        if (!object.has("Tint")) {
//            object.addComponent("Tint")
//                .tint("#969696", 0.3);
//        }
    }

    function removeGlow(object) {
        if (object !== null) {
            if (object.has("Broom")) {
                object.removeComponent("GL_broom")
            }
            else if (object.has("FryingPan")) {
                object.removeComponent("GL_fryingPan")
            }
            else if (object.has("Plunger")) {
                object.removeComponent("GL_plunger")
            }
            else if (object.has("BlackKey")) {
                object.removeComponent("GL_blackKey")
            }
            else if (object.has("Key")) {
                object.removeComponent("GL_woodKey")
            }
            else if (object.has("GreenGem")) {
                object.removeComponent("GL_greenGem")
            }
            else if (object.has("BlueGem")) {
                object.removeComponent("GL_greenGem")
            }
            else if (object.has("RedGem")) {
                object.removeComponent("GL_greenGem")
            }
            else if (object.has("Food")) {
                object.removeComponent("GL_chipBag")
            }
            else if (object.has("Flashlight")) {
                object.removeComponent("GL_blueFlashlight")
            }
            else if (object.has("Flashlight2")) {
                object.removeComponent("GL_blueFlashlight")
            }
            else if (object.has("Flashlight3")) {
                object.removeComponent("GL_lantern")
            }
        }
    }

    Crafty.c("PopUpTextGen", {
        currentlyDisplaying: false,
        displayDescription : function(faceDirection) {
            if (!this.currentlyDisplaying) {
                this.currentlyDisplaying = true;
                var textGenerator = Crafty.e("2D, DOM, Persist, TextPrinter")
                    .attr( {x: 20, y: 20, w: 100, z: 20} );
                // Lots of magic numbers here to optimize text positioning.
                if (faceDirection === GLOBAL.direction.left) {
                    textGenerator.attr( {x: this.interactingObject._x - GLOBAL.tileW - 95, y: this.interactingObject._y - 20} );
                }
                else if (faceDirection === GLOBAL.direction.right) {
                    textGenerator.attr( {x: this.interactingObject._x + GLOBAL.tileW, y: this.interactingObject._y - 20} );
                }
                else if (faceDirection === GLOBAL.direction.up) {
                    textGenerator.attr( {x: this.interactingObject._x - 50, y: this.interactingObject._y - GLOBAL.tileW - 40} );
                }
                else if (faceDirection === GLOBAL.direction.down) {
                    textGenerator.attr( {x: this.interactingObject._x - 50, y: this.interactingObject._y + GLOBAL.tileW + 2} );
                }
                textGenerator.print(this.interactingObject.popUpText);

                var player = this;

                textGenerator.bind("PlayerMoving", function(whichPlayer) {
                    if (player.whichPlayer === whichPlayer) {
                        player.currentlyDisplaying = false;
                        textGenerator.deleteText();
                        textGenerator.destroy();
                    }
                })
            }
        }
    });

})();