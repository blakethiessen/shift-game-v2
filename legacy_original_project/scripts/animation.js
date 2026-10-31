
(function (){

    Crafty.c("Animated", {
        animation : {
            player1Left : makeAnimation("player_Left", 47,50,57),
            player1Right : makeAnimation("player_Right", 51,54,52),
            player1Up : makeAnimation("player_Up", 47,50,56),
            player1Down : makeAnimation("player_Down", 47,50,52),
            player1UpLeft : makeAnimation("player_UpLeft", 51,54,60),
            player1UpRight : makeAnimation("player_UpRight", 55,58,60),
            player1DownLeft : makeAnimation("player_DownLeft", 51,54,56),
            player1DownRight : makeAnimation("player_DownRight", 55,58,56),
            player1DeathDown: makeAnimation("player_Death_Down", 55,58,52),
            player1DeathUp: makeAnimation("player_Death_Up", 55,58,53),
            player1DeathRight: makeAnimation("player_Death_Right", 55,58,54),
            player1DeathLeft: makeAnimation("player_Death_Left", 55,58,55),
            player2Left : makeAnimation("player_Left", 47 - 13,50 - 13,57),
            player2Right : makeAnimation("player_Right", 51 - 13,54 - 13,52),
            player2Up : makeAnimation("player_Up", 47 - 13,50 - 13,56),
            player2Down : makeAnimation("player_Down", 47 - 13,50 - 13,52),
            player2UpLeft : makeAnimation("player_UpLeft", 51 - 13,54 - 13,60),
            player2UpRight : makeAnimation("player_UpRight", 55 - 13,58 - 13,60),
            player2DownLeft : makeAnimation("player_DownLeft", 51 - 13,54 - 13,56),
            player2DownRight : makeAnimation("player_DownRight", 55 - 13,58 - 13,56),
            player2DeathDown: makeAnimation("player_Death_Down", 55 - 13,58 - 13,52),
            player2DeathUp: makeAnimation("player_Death_Up", 55 - 13,58 - 13,53),
            player2DeathRight: makeAnimation("player_Death_Right", 55 - 13,58 - 13,54),
            player2DeathLeft: makeAnimation("player_Death_Left", 55 - 13,58 - 13,55),
            monsterLeft : makeAnimation("monster_left", 60,63,53),
            monsterRight : makeAnimation("monster_right", 60,63,53),
            monsterUp : makeAnimation("monster_up", 60,64,55),
            monsterDown : makeAnimation("monster_down", 60,64,52),
            monsterUpLeft : makeAnimation("monster_UpLeft", 60,63,54),
            monsterUpRight : makeAnimation("monster_UpRight", 60,63,54),
            monsterDownLeft : makeAnimation("monster_DownLeft", 60,63,56),
            monsterDownRight : makeAnimation("monster_DownRight", 60,63,56),
            evilLampOn : makeAnimation("evil_lamp_on", 60,65,50),
            evilLampOff : makeAnimation("evil_lamp_off", 65,60,50),
            fire1: makeAnimation("fire", 60, 62, 57),
            fire2: makeAnimation("fire2", 65, 69, 57),

            dimSplitIdle: makeAnimation("dimSplitIdle", 0, 8, 53),
            dimSplitOrthoSpread: [makeAnimation("dimSplitOrthoSpread1", 0, 5, 54),
                                  makeAnimation("dimSplitOrthoSpread2", 3, 8, 54),
                                  makeAnimation("dimSplitOrthoSpread3", 6, 11, 54),
                                  makeAnimation("dimSplitOrthoSpread4", 9, 14, 54),
                                  makeAnimation("dimSplitOrthoSpread5", 12, 17, 54)],
            dimSplitSpawnVertical: [makeAnimation("dimSplitSpawnVertical1", 0, 5, 56),
                                    makeAnimation("dimSplitSpawnVertical2", 4, 9, 56),
                                    makeAnimation("dimSplitSpawnVertical3", 8, 13, 56),
                                    makeAnimation("dimSplitSpawnVertical4", 12, 17, 56),
                                    makeAnimation("dimSplitSpawnVertical5", 16, 22, 56)],
            dimSplitDiagonalSpread: [makeAnimation("dimSplitDiagonalSpread1", 0, 5, 57),
                                     makeAnimation("dimSplitDiagonalSpread2", 6, 10, 57),
                                     makeAnimation("dimSplitDiagonalSpread3", 1, 15, 57),
                                     makeAnimation("dimSplitDiagonalSpread4", 16, 20, 57),
                                     makeAnimation("dimSplitDiagonalSpread5", 21, 26, 57)],
            dimSplitSpawnHorizontal: [makeAnimation("dimSplitSpawnHorizontal1", 19, 25, 53),
                                      makeAnimation("dimSplitSpawnHorizontal2", 24, 30, 53),
                                      makeAnimation("dimSplitSpawnHorizontal3", 29, 35, 53),
                                      makeAnimation("dimSplitSpawnHorizontal4", 34, 40, 53),
                                      makeAnimation("dimSplitSpawnHorizontal5", 39, 42, 53)]
        },

        actionAnimation : {
            playerTile : {
                left : makeActionAnimation("pl", GLOBAL.playerActLeft),
                right : makeActionAnimation("pr", GLOBAL.playerActRight),
                up : makeActionAnimation("pu", GLOBAL.playerActUp),
                down : makeActionAnimation("pd", GLOBAL.playerActDown)
            },
            leftTile : {
                left : makeActionAnimation("ll", GLOBAL.leftActLeft),
                right : makeActionAnimation("lr", GLOBAL.leftActRight),
                up : makeActionAnimation("lu", GLOBAL.leftActUp),
                down : makeActionAnimation("ld", GLOBAL.leftActDown)
            },
            rightTile : {
                left : makeActionAnimation("rl", GLOBAL.rightActLeft),
                right : makeActionAnimation("rr", GLOBAL.rightActRight),
                up : makeActionAnimation("ru", GLOBAL.rightActUp),
                down : makeActionAnimation("rd", GLOBAL.rightActDown)
            },
            upTile : {
                left : makeActionAnimation("ul", GLOBAL.upActLeft),
                right : makeActionAnimation("ur", GLOBAL.upActRight),
                up : makeActionAnimation("uu", GLOBAL.upActUp),
                down : makeActionAnimation("ud", GLOBAL.upActDown)
            },
            downTile : {
                left : makeActionAnimation("dl", GLOBAL.downActLeft),
                right : makeActionAnimation("dr", GLOBAL.downActRight),
                up : makeActionAnimation("du", GLOBAL.downActUp),
                down : makeActionAnimation("dd", GLOBAL.downActDown)
            }
        },

        init : function() {
            this.addComponent("SpriteAnimation");
        },

        //22,36,29 are offsets for action animations of different kind

        setPTileActionAnimation : function(anim, baseCoord){
            this.adjustCoordByState(this,anim,baseCoord);

            this.adjustCoordByPlayer(this,anim);

            var i = 0;

            if(this.action === "broom") {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][1] = anim.frames[i][1] + 22 - baseCoord[1];
                }
            } else if(this.action === "fryingPan") {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][1] = anim.frames[i][1] + 36 - baseCoord[1];
                }
            } else if(this.action === "plunger") {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][1] = anim.frames[i][1] + 29 - baseCoord[1];
                }
            }

            this.reel(anim.name, GLOBAL.defaultAnimationDurationMs, anim.frames);
        },

        setActionAnimation : function(player, anim, baseCoord){
            var i = 0;
            this.adjustCoordByPlayer(player, anim);

            if(player.action === "broom") {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][1] = anim.frames[i][1] + 22 - baseCoord[1];
                }
            } else if(player.action === "fryingPan") {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][1] = anim.frames[i][1] + 36 - baseCoord[1];
                }
            } else if(player.action === "plunger") {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][1] = anim.frames[i][1] + 29 - baseCoord[1];
                }
            }

            this.reel(anim.name, GLOBAL.defaultAnimationDurationMs, anim.frames);
        },

        setAnimation : function(anim){
            this.reel(anim.name, GLOBAL.defaultAnimationDurationMs, anim.xFrom, anim.y, anim.xTo - anim.xFrom);
        },

        setTearAnimations : function(anim) {
            var length = anim.xTo - anim.xFrom;
            var frames = [];
            var i = 0;
            for (i = 0; i < length; i++) {
                frames.push([anim.xFrom + i, anim.y]);
            }
            for (i = length - 1; i > 0; i--) {
                frames.push([anim.xFrom + i, anim.y]);
            }

            anim.frames = frames;
            this.reel(anim.name, GLOBAL.defaultAnimationDurationMs, anim.frames);
            this.linkedTear.reel(anim.name, GLOBAL.defaultAnimationDurationMs, anim.frames);
        },

        setPlayerAnimation : function(anim){
            this.reel(anim.name, GLOBAL.defaultAnimationDurationMs, anim.xFrom, this.getYbyState(anim.y, anim.name), anim.xTo - anim.xFrom);
        },

        // TODO: Remove speed parameter from all calls.
        playAnimation : function(anim, speed) {
            if (speed === undefined) {
                speed = 10;
            }
            if (!this.isPlaying(anim.name))
                this.animate(anim.name, speed);
        },

        playAnimationByString : function(animString) {
            this.animate(animString, 20);
        },

        playLoopAnimation : function(anim, speed){
            if (speed === undefined) {
                speed = 10;
            }
            if (!this.isPlaying(anim.name))
                this.animate(anim.name, speed,-1);
        },

        //this function is used to adjust the coordinates of frames when player is in different states. This now should be getXbyState instead of getY
        getYbyState : function(y, name) {
            if(name === "player_Up" || name === "player2_Up") {

                return y + GLOBAL.playerNormalY;

            }else if(name === "player_UpLeft" || name === "player2_UpLeft"
                || name === "player_UpRight" || name === "player2_UpRight") {

                return y + GLOBAL.playerNormalY;
            }else {
                if(this.curState === this.states.Normal) {
                    return y + GLOBAL.playerNormalY;
                } else if(this.curState === this.states.Bruised) {
                    return y + GLOBAL.playerBruisedY;
                } else if(this.curState === this.states.Injured) {
                    return y + GLOBAL.playerInjuredY;
                } else if(this.curState === this.states.Dying) {
                    return y + GLOBAL.playerDyingY;
                } else {
                    alert("WTF");
                    return 0;
                }
            }
        },

        adjustCoordByPlayer : function(player, anim) {
            var i = 0;
            if(player.whichPlayer === 2) {

                for(i = 0; i < anim.frames.length; i++) {
                    if(anim.frames[i][0] < 24) {
                        anim.frames[i][0] += GLOBAL.evilSprite;
                    }
                }

            } else {

                for(i = 0; i < anim.frames.length; i++) {
                    if(anim.frames[i][0] >= 24) {
                        anim.frames[i][0] -= GLOBAL.evilSprite;
                    }
                }

            }
        },

        adjustCoordByState : function(player, anim, baseCoord) {
            var i = 0;
            if(player.curState === player.states.Normal) {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][0] = anim.frames[i][0] + 0 - baseCoord[0];
                }
                if(anim.name !== "pu") {
                    anim.frames[anim.frames.length-1][1] = 12;
                }
            } else if(player.curState === player.states.Bruised) {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][0] = anim.frames[i][0] + 6 - baseCoord[0];
                }
                if(anim.name !== "pu") {
                    anim.frames[anim.frames.length-1][1] = 13;
                }
            } else if(player.curState === player.states.Injured) {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][0] = anim.frames[i][0] + 12 - baseCoord[0];
                }
                if(anim.name !== "pu") {
                    anim.frames[anim.frames.length-1][1] = 14;
                }
            } else if(player.curState === player.states.Dying) {
                for(i = 0; i < anim.frames.length-1; i++) {
                    anim.frames[i][0] = anim.frames[i][0] + 18 - baseCoord[0];
                }
                if(anim.name !== "pu") {
                    anim.frames[anim.frames.length-1][1] = 15;
                }
            }
        }
    });

    function makeActionAnimation(name, frames){
        return {
            name : name,
            frames : frames
        };
    }

    function makeAnimation(name, xFrom, xTo, y){
        return {
            name : name,
            xFrom : xFrom,
            xTo : xTo,
            y : y
        };
    }

    function makeAnimFromLeft(name, leftSprite, frameNum) {
        return makeAnimation(name, leftSprite[0], leftSprite[0] + frameNum, leftSprite[1]);
    }
})();