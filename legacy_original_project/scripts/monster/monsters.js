// monsters.js
// Contains components for enemy
// entities including tracking
// algorithms.

(function(direction) {

    Crafty.c("HasTarget", {
        target : null,
        matrix : null,
        level : null,
        init : function() {
            this.matrix = [];
        },
        resetRoom : function() {
            this.level = Crafty("TiledLevel");
        },
        setRoomMatrix : function() {
            if(this.target !== null) {
                this.matrix = this.level.getRelevantMatrix(this.target);
            }
        },

        isTileBlocked : function(x,y) {
            if (this.matrix[x] === undefined) {
                return true;
            } else if (this.matrix[x][y] === undefined) {
                return true;
            }

            var tile = this.matrix[x][y].base;
            // TODO: Consider switching out has function call with a .__c variable test.
            if (tile !== null) {
                return tile.has("Collides") || tile.has("NoLight") || tile.has("_Door");
            }
            else {
                return true;
            }
        },

        resetTarget : function() {
            var source = this;
            Crafty("Player").each(function(){
                if (objInLeftSide(this)){
                    if (objInLeftSide(source)){
                        source.target = this;
                    }
                }
                else {
                    if (!objInLeftSide(source)){
                        source.target = this;
                    }
                }
            });
            //todo: temporary code, need to refactor later.
            //add one more path array to player;
            this.pathIdx = 0;
        }
    });

    Crafty.c("Blobby", {
        target : null,
        nextStep : null,
        nextStepIdx : 0,
        chasingSpeed : 2.4,
        wanderingSpeed :.8,
        currentSpeed :.8,
        acceleration : 0.05,
        damage : .8,
        states : {Wandering : 0, Seeking : 1, Shocking : 2, Eating : 3},
        curState : null,
        timer : 0,
        wanderTimer : 0,
        pathIdx : 0,
        blobbyCoord : null,
        targetCoord : null,
        oldTargetCoord : makeVector(0,0),
        wanderInterval : 40,
        path : [],

        init : function() {
            this.changeStateTo(this.states.Wandering);
            this.addComponent("N_blobby, PathFinding, MovablePlayerEnemy, Animated, HasTarget, Collision")
                .attr({ z: 12 });
            this.setAnimation(this.animation.monsterLeft);
            this.setAnimation(this.animation.monsterRight);
            this.setAnimation(this.animation.monsterUp);
            this.setAnimation(this.animation.monsterDown);
            this.setAnimation(this.animation.monsterDownLeft);
            this.setAnimation(this.animation.monsterDownRight);
            this.setAnimation(this.animation.monsterUpLeft);
            this.setAnimation(this.animation.monsterUpRight);
            this.path = [];
            //this.stop();


            this.bind("EnterFrame", function() {
                    //update the coordinate of blobby and target every frame
                    this.blobbyCoord = getTileCoord(this);
                    this.targetCoord = getTileCoord(this.target);

                    if (this.stateIs(this.states.Wandering)) {
                        if (this.targetDetected()){

                            this.updatePath();
                            this.wanderTimer = 0;

                        } else {
                            this.playWanderingMusic();
                            //if blobby reached the next tile or didn't move, set a new random speed
                            if(this.isStaying() || tileModule.reached(this, this.nextStep)) {
                                this.wanderInterval --;
                                if(this.wanderInterval < 0) {
                                    this.wanderInterval = 40;
                                    this.setRandomV();
                                }
                            } else {
                                //if still moving, update
                                this.updatePosition();
                            }
                        }

                    } else if (this.stateIs(this.states.Seeking)) {

                        this.accelerate();

                        this.animateByDir();

                        if (!this.coordEqual(this.blobbyCoord, this.targetCoord)){

                            if(tileModule.reached(this, this.nextStep)){ //monster almost move into tile
                                if(!this.updatePath()){
                                    //update nextStep and velocity(turn around).
                                    if(this.nextStepIdx < this.getPath().length - 1){
                                        this.nextStepIdx ++;
                                    }
                                    this.setNextStep();
                                    this.setVtoNextStep();
                                }

                            } else {
                                this.updatePosition();
                            }

                        }else{
                            this.beforeEating();
                            this.changeStateTo(this.states.Eating);
                        }

                        //If attacked by weapons, monster is shocking
                        if (this.isAttacked()) {
                            //MyAudio.stop("blobbyTracking");
                            MyAudio.playSound("damage");

                            this.fallback();

                            this.setVtoNextStep();
                            //speed of steping back should be faster
                            this.scaleSpeed(2);
                            // if the monster is pushed to the wall and has no speed, let it wander
                            if(this.velocity.x === 0 && this.velocity.y === 0) {
                                this.changeStateTo(this.states.Wandering);
                            } else{//otherwise, let it dash back
                                this.changeStateTo(this.states.Shocking);
                            }

                            if (this.target.items.length > 0)
                                this.target.getCurrentItem().beingUsed = false;

                        }

                    } else if (this.stateIs(this.states.Shocking)) {
                        //monster falls back until 3 tiles away
                        if(tileModule.reached(this, this.nextStep)){ //monster almost move into tile
                            //start to wander again
                            this.startToWander();
                        } else{
                            //if still falling back, update position
                            this.updatePosition();
                        }

                    } else if (this.stateIs(this.states.Eating)) { //blobby catches the player

                        this.animateByDir();

                        this.updatePosition();

                        this.timer++;
                        if(this.timer > 30){
                            this.timer = 0;
                            this.startToWander();
                        }
                    }
            })
        },

        isAttacked : function() {
            if (this.target.items.length > 0)
                return this.target.getCurrentItem().beingUsed === true && this.target.nextToAndFace(this);
            return false;
        },

        beforeEating : function(){
            // Take damage
            MyAudio.playSound("growl2");
            this.target.takeDamage(this.damage);

            this.scaleSpeed(0.2525);
        },

        getPath : function(){
            return this.path;
        },

        stateIs : function(state) {
            return this.curState === state;
        },

        changeStateTo : function(state) {
            this.curState = state;
        },

        isStaying : function() {
            return this.velocity.x === 0 && this.velocity.y === 0;
        },

        //play moving animation according to direction
        animateByDir : function(){
            //blobby face left
            if(this.direction === direction.left){
                this.flip("X");
                this.playAnimation(this.animation.monsterLeft);
            }
            //blobby face right
            if(this.direction === direction.right){
                this.unflip("X");
                this.playAnimation(this.animation.monsterRight);
            }
            //blobby face up
            if(this.direction === direction.up){
                this.playAnimation(this.animation.monsterUp);
            }
            //blobby face down
            if(this.direction === direction.down){
                this.playAnimation(this.animation.monsterDown);
            }
            //blobby face down left
            if(this.direction === direction.downLeft){
                this.unflip("X");
                this.playAnimation(this.animation.monsterDownLeft);
            }
            //blobby face down right
            if(this.direction === direction.downRight){
                this.flip("X");
                this.playAnimation(this.animation.monsterDownRight);
            }
            //blobby face up left
            if(this.direction === direction.upLeft){
                this.flip("X");
                this.playAnimation(this.animation.monsterUpLeft);
            }
            //blobby face up right
            if(this.direction === direction.upRight){
                this.unflip("X");
                this.playAnimation(this.animation.monsterUpRight);
            }
        },

        fallback : function(){
            var increment = 0;
            var cnt = 3;
            //initialization to current coordinate
            this.nextStep._x = this.blobbyCoord._x;
            this.nextStep._y = this.blobbyCoord._y;
            if(this.velocity.x === 0 ){
                increment = this.velocity.y / Crafty.math.abs(this.velocity.y);
                for(var i = this.blobbyCoord._y; cnt >= 0; i -= increment, cnt--){
                    //when there is no wall behind
                    if(!this.isTileBlocked(this.blobbyCoord._x, i)) {
                        //when monster is shocking, it steps back 3 tiles
                        this.nextStep._x = this.blobbyCoord._x;
                        this.nextStep._y = i;
                    } else {
                        break;
                    }
                }
            } else if(this.velocity.y === 0){
                increment = this.velocity.x / Crafty.math.abs(this.velocity.x);
                for(var i = this.blobbyCoord._x; cnt >= 0; i -= increment, cnt--){
                    if(!this.isTileBlocked(i, this.blobbyCoord._y) ){
                        //when monster is shocking, it steps back 3 tiles
                        this.nextStep._x = i;
                        this.nextStep._y = this.blobbyCoord._y;
                    }else{
                        break;
                    }
                }
            }
        },

        startToWander : function(){
            this.changeStateTo(this.states.Wandering);
            this.nextStep = null;
            this.velocity.x = 0;
            this.velocity.y = 0;
        },

        playWanderingMusic : function(){
            if(this.wanderTimer % 300 === 0) {
                //alert("play");
                if(Crafty.math.randomInt(0,1)){
                    MyAudio.playSound("growl3");
                } else {
                    MyAudio.playSound("growl5");
                }
            }
            this.wanderTimer ++;
        },

        accelerate : function(){

            var diagFactor = 1;

            if(this.velocity.y !== 0 && this.velocity.x !== 0){
                diagFactor = 0.7;
            }

            if(this.velocity.x > 0) {
                if(this.velocity.x >= this.chasingSpeed) {
                    this.velocity.x = this.chasingSpeed * diagFactor;
                } else {
                    this.velocity.x += this.acceleration * diagFactor;
                    this.currentSpeed += this.acceleration;
                }
            } else if(this.velocity.x < 0) {
                if(this.velocity.x <= -this.chasingSpeed) {
                    this.velocity.x = -this.chasingSpeed * diagFactor;
                } else {
                    this.velocity.x -= this.acceleration * diagFactor;
                    this.currentSpeed += this.acceleration;
                }
            } else if(this.velocity.y > 0) {
                if(this.velocity.y >= this.chasingSpeed) {
                    this.velocity.y = this.chasingSpeed * diagFactor;
                } else {
                    this.velocity.y += this.acceleration * diagFactor;
                    this.currentSpeed += this.acceleration;
                }
            } else if(this.velocity.y < 0) {
                if(this.velocity.y <= -this.chasingSpeed) {
                    this.velocity.y = -this.chasingSpeed * diagFactor;
                } else {
                    this.velocity.y -= this.acceleration * diagFactor;
                    this.currentSpeed += this.acceleration;
                }
            }

        },



        setNextStep : function() {
            assertTrue("nextStepIdx less than 0", this.nextStepIdx >= 0);
            assertTrue("nextStepIdx out of bound: " + this.nextStepIdx + " / " + this.path.length, this.nextStepIdx <= this.path.length - 1);
            assertFalse("empty path", this.getPath().length === 0);
            this.nextStep = this.getPath()[this.nextStepIdx];
        },

        //Set velocity according to the next step
        setVtoNextStep : function(){

            this.velocity.x = 0;
            this.velocity.y = 0;

            if (this.blobbyCoord._y < this.nextStep._y){
                this.velocity.y = this.currentSpeed;
                this.direction = direction.down;
            }else if (this.blobbyCoord._y > this.nextStep._y){
                this.velocity.y = - this.currentSpeed;
                this.direction = direction.up;
            }

            if (this.blobbyCoord._x < this.nextStep._x){
                this.velocity.x = this.currentSpeed;
                if(this.velocity.y < 0) {
                    this.velocity.x *= 0.5;
                    this.velocity.y *= 0.5;
                    this.direction = direction.upRight;
                } else if(this.velocity.y > 0){
                    this.velocity.x *= 0.5;
                    this.velocity.y *= 0.5;
                    this.direction = direction.downRight;
                } else{
                    this.direction = direction.right;
                }

            }else if (this.blobbyCoord._x > this.nextStep._x){
                this.velocity.x = - this.currentSpeed;
                if(this.velocity.y < 0) {
                    this.velocity.x *= 0.5;
                    this.velocity.y *= 0.5;
                    this.direction = direction.upLeft;
                } else if(this.velocity.y > 0){
                    this.velocity.x *= 0.5;
                    this.velocity.y *= 0.5;
                    this.direction = direction.downLeft;
                } else{
                    this.direction = direction.left;
                }
            }

            if(this.blobbyCoord._x === this.nextStep._x && this.blobbyCoord._y === this.nextStep._y){
                this.velocity.x = 0;
                this.velocity.y = 0;
                this.changeStateTo(this.states.Wandering);
            }
        },

        updatePath : function() {

            if(this.coordEqual(this.blobbyCoord, this.targetCoord)){
                this.beforeEating();
                this.changeStateTo(this.states.Eating);
                return true;
            }else{
                if(!this.coordEqual(this.targetCoord, this.oldTargetCoord) || this.curState === this.states.Wandering){
                    this.path = this.findPath(this.blobbyCoord, this.targetCoord);
                    if(this.path === []) {
                        return false;
                    }
                    this.oldTargetCoord._x = this.path[this.path.length - 1]._x;
                    this.oldTargetCoord._y = this.path[this.path.length - 1]._y;
                    //reset target path information
                    this.nextStepIdx = 0;
                    this.setNextStep();
                    this.setVtoNextStep();
                    //change state
                    this.changeStateTo(this.states.Seeking);
                    return true;
                } else {
                    return false;
                }

            }

        },

        moveOneTile : function(direction) {
            if(direction === GLOBAL.direction.down) {
                this.velocity.y = this.wanderingSpeed;
                this.velocity.x = 0;
                this.nextStep = makeVector(this.blobbyCoord._x, this.blobbyCoord._y + 1);
            } else if(direction === GLOBAL.direction.up) {
                this.velocity.y = -this.wanderingSpeed;
                this.velocity.x = 0;
                this.nextStep = makeVector(this.blobbyCoord._x, this.blobbyCoord._y - 1);
            } else if(direction === GLOBAL.direction.left) {
                this.velocity.x = -this.wanderingSpeed;
                this.velocity.y = 0;
                this.nextStep = makeVector(this.blobbyCoord._x - 1, this.blobbyCoord._y);
            } else if(direction === GLOBAL.direction.right) {
                this.velocity.x = this.wanderingSpeed;
                this.velocity.y = 0;
                this.nextStep = makeVector(this.blobbyCoord._x + 1, this.blobbyCoord._y);
            } else if(direction === GLOBAL.direction.downLeft) {
                this.velocity.y = this.wanderingSpeed;
                this.velocity.x = -this.wanderingSpeed;
                this.nextStep = makeVector(this.blobbyCoord._x - 1, this.blobbyCoord._y + 1);
            } else if(direction === GLOBAL.direction.downRight) {
                this.velocity.y = this.wanderingSpeed;
                this.velocity.x = this.wanderingSpeed;
                this.nextStep = makeVector(this.blobbyCoord._x + 1, this.blobbyCoord._y + 1);
            } else if(direction === GLOBAL.direction.upLeft) {
                this.velocity.x = -this.wanderingSpeed;
                this.velocity.y = -this.wanderingSpeed;
                this.nextStep = makeVector(this.blobbyCoord._x - 1, this.blobbyCoord._y - 1);
            } else if(direction === GLOBAL.direction.upRight) {
                this.velocity.x = this.wanderingSpeed;
                this.velocity.y = -this.wanderingSpeed;
                this.nextStep = makeVector(this.blobbyCoord._x + 1, this.blobbyCoord._y - 1);
            }
            this.direction = direction;
            this.currentSpeed = this.wanderingSpeed;
            this.animateByDir();
        },

        //Set velocity according to the next step
        setRandomV : function(){
            var randomDirection;
            randomDirection = Crafty.math.randomInt(1,8);

            if (randomDirection === direction.down){
                if(this.isTileBlocked(this.blobbyCoord._x, this.blobbyCoord._y + 1)) {
                    return;
                }
            }else if (randomDirection === direction.up){
                if(this.isTileBlocked(this.blobbyCoord._x, this.blobbyCoord._y - 1)) {
                    return;
                }
            }else if (randomDirection === direction.right){
                if(this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y)) {
                    return;
                }
            }else if (randomDirection === direction.left){
                if(this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y)) {
                    return;
                }
            }else if (randomDirection === direction.downLeft){
                if(this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y + 1)
                    || this.isTileBlocked(this.blobbyCoord._x, this.blobbyCoord._y + 1)
                    || this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y)) {
                    return;
                }
            }else if (randomDirection === direction.downRight){
                if(this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y + 1)
                    || this.isTileBlocked(this.blobbyCoord._x, this.blobbyCoord._y + 1)
                    || this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y)) {
                    return;
                }
            }else if (randomDirection === direction.upRight){
                if(this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y - 1)
                    || this.isTileBlocked(this.blobbyCoord._x, this.blobbyCoord._y - 1)
                    || this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y)) {
                    return;
                }
            }else if (randomDirection === direction.upLeft){
                if(this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y - 1)
                    || this.isTileBlocked(this.blobbyCoord._x, this.blobbyCoord._y - 1)
                    || this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y)) {
                    return;
                }
            }
            this.moveOneTile(randomDirection);
        },

        targetDetected : function(){

            if(this.matrix === null) {
                return false;
            }

            if(tileModule.isAdjacent(this.blobbyCoord, this.targetCoord)) {
                return true;
            }

            if(this.targetCoord._x - this.blobbyCoord._x === 2
                && this.targetCoord._y - this.blobbyCoord._y === 1
                && !this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y)
                && !this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y + 1)) {
                return true;

            }else if(this.targetCoord._x - this.blobbyCoord._x === 2
                && this.targetCoord._y - this.blobbyCoord._y === -1
                && !this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y)
                && !this.isTileBlocked(this.blobbyCoord._x + 1, this.blobbyCoord._y - 1)) {
                return true;

            }else if(this.targetCoord._x - this.blobbyCoord._x === -2
                && this.targetCoord._y - this.blobbyCoord._y === 1
                && !this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y)
                && !this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y + 1)) {
                return true;

            }else if(this.targetCoord._x - this.blobbyCoord._x === -2
                && this.targetCoord._y - this.blobbyCoord._y === -1
                && !this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y)
                && !this.isTileBlocked(this.blobbyCoord._x - 1, this.blobbyCoord._y - 1)) {
                return true;

            }

            var start = -1;
            var end = -1;
            //Blobby and player are in a line.
            if (this.blobbyCoord._x === this.targetCoord._x){
                //Check tiles between Blobby and player in different ways
                if (this.blobbyCoord._y < this.targetCoord._y){
                    start = this.blobbyCoord._y;
                    end = this.targetCoord._y;
                }else{
                    start = this.targetCoord._y;
                    end = this.blobbyCoord._y;
                }
                for(var j = start; j < end; j++){
                    //If blocked, not detected.
                    if(this.isTileBlocked(this.blobbyCoord._x, j)) {
                        return false;
                    }
                }
                //All tiles are clear, then detected.
                return true;
            }else if (this.blobbyCoord._y === this.targetCoord._y){
                if (this.blobbyCoord._x < this.targetCoord._x){
                    start = this.blobbyCoord._x;
                    end = this.targetCoord._x;
                }else{
                    start = this.targetCoord._x;
                    end = this.blobbyCoord._x;
                }
                for(var i = start; i < end; i++){
//                    console.log("x: " + i + " y: " + this.blobbyCoord._y);
                    if(this.isTileBlocked(i, this.blobbyCoord._y)) {
                        return false;
                    }
                }
                return true;
            }else{
                return false;
            }

        }

    });

    Crafty.c("EvilLamp", {
        init:function() {
            this.attr({x: this._x - GLOBAL.tileW, y: this._y - GLOBAL.tileW});
            this.addComponent("Lamp, HasTarget, N_evilLamp, Animated");
            this.setAnimation(this.animation.evilLampOn);
            this.setAnimation(this.animation.evilLampOff);
            this.isOn = false;

            var on = false;

            this.bind("EnterFrame", function() {
                //If lamp has been turned on
                if (this.isOn) {
                    //If Player is next to the lamp
                    if (on && this.target.withinRange(this, 2)) {
                        this.target.takeDamage(.9);
                    }
                    else if (this.target.withinRange(this, 1)) {
                        if (!on) {
                            this.playAnimation(this.animation.evilLampOn, 20);
                            on = true;
                        }
                    }
                    else {
                        if (on) {
                            on = false;
                            this.playAnimation(this.animation.evilLampOff, 20);
                        }
                    }
                }
            })
        }
    });


}) (GLOBAL.direction);