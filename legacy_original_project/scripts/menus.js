// menus.js
// Contains the component
// definitions of all menu items.

(function() {
    var LARGE_HEADER_SIZE = 52;
    var LARGE_HEADER_CHAR_WIDTH = 29;
    var MEDIUM_HEADER_SIZE = 40;
    var MEDIUM_HEADER_CHAR_WIDTH = 23;
    var SMALL_HEADER_SIZE = 28;
    var SMALL_HEADER_CHAR_WIDTH = 16;
    var FRAME_WIDTH = 260;
    var FRAME_HEIGHT = 240;
    var MAIN_MENU_ITEM_ADJUSTMENT = 6;
    var INDICATOR_PADDING = 25;
    var CONTROLS_ITEM_SPACING = 30;

    var keyJustBound = false;

    // Components
    Crafty.c("_button", {
        init: function() {
            this.addComponent("2D, DOM, Mouse")
                .css("cursor","pointer")
                .css("width", "auto")
                .css("height", "auto")
                .bind("Click", function() {
                    this.activate();
                });
        },
        bindWithCycler: function(leftSelectionIndicator, rightSelectionIndicator) {
            this.bind("MouseOver", function() {
                leftSelectionIndicator.x = this._x - INDICATOR_PADDING;
                rightSelectionIndicator.x = this._x + this._w + INDICATOR_PADDING / 2;
                leftSelectionIndicator.y = this._y + this._h / 2 - leftSelectionIndicator._h / 2;
                rightSelectionIndicator.y = this._y + this._h / 2 - rightSelectionIndicator._h / 2;
                MyAudio.playSound("menuCycle");
            });
        }
    });

    Crafty.c("_controlSetupButton", {
        actionName: null,
        itemCharLength: null,
        currentSettingsObj: null,
        additionalSpaces: "",
        init: function() {
            this.addComponent("_button, _menuHeader");
        },
        initialize: function(actionName, defaultKey, itemCharLength, settingsObject) {
            this.actionName = actionName;
            this.itemCharLength = itemCharLength;
            this.currentSettingsObj = settingsObject;
            var numOfAdditionalSpaces = this.resetKeyAndSpacing(defaultKey);
            this.setHeaderSize("small", this._text.length - this.additionalSpaces.length + numOfAdditionalSpaces);

            return this;
        },
        resetKeyAndSpacing: function(assignedKey) {
            var numOfAdditionalSpaces = this.itemCharLength - this.actionName.length - assignedKey.length;
            this.additionalSpaces = "";
            for (var i = 0; i < numOfAdditionalSpaces; i++) {
                // nbsp = non-breaking space. Used in HTML for spaces more than one long.
                this.additionalSpaces += "&nbsp";
            }
            this.text(this.actionName + ": " + this.additionalSpaces + assignedKey);

            return numOfAdditionalSpaces;
        },
        activate: function() {
            if (!keyJustBound) {
                MyAudio.playSound("menuSelect");
                this.textColor("#FF0000", 1.0);

                // Hold input from other sources until
                // one input has been received for key.
                function bindKey(e) {
                    if (e.key !== Crafty.keys.ESC) {
                        this.currentSettingsObj[this.actionName] = e.key;
                        this.resetKeyAndSpacing(controlsKeyMap.getKeyString(e.key));
                    }
                    if (this.actionName === "Mute") {
                        MyAudio.unbindMute();
                        MyAudio.bindMuteToKey();
                    }

                    this.unbind("KeyUp", bindKey);
                    keyJustBound = true;
                    this.textColor("#FFFFFF", 1.0);
                }

                this.bind("KeyUp", bindKey);
            }
            else {
                keyJustBound = false;
            }
        }
    });

    Crafty.c("_menuHeader", {
        textLength: null,
        init: function() {
            this.addComponent("2D, DOM, Text")
                .textFont({ family: "FixedSys" })
                .textColor('#FFFFFF', 1.0)
                .css("text-align", "center");
        },
        setHeaderSize: function(type, manualTextCharLength) {
            var textCharLength;
            if (manualTextCharLength !== undefined) {
                textCharLength = manualTextCharLength;
            }
            else {
                textCharLength = this._text.length;
            }

            switch (type) {
                case "small":
                    this.textFont({ size: SMALL_HEADER_SIZE + "px" })
                        .attr({ w: textCharLength * SMALL_HEADER_CHAR_WIDTH, h: SMALL_HEADER_SIZE });
                    break;
                case "medium":
                    this.textFont({ size: MEDIUM_HEADER_SIZE + "px" })
                        .attr({ w: textCharLength * MEDIUM_HEADER_CHAR_WIDTH, h: MEDIUM_HEADER_SIZE });
                    break;
                case "large":
                default:
                    this.textFont({ size: LARGE_HEADER_SIZE + "px" })
                        .attr({ w: textCharLength * LARGE_HEADER_CHAR_WIDTH, h: LARGE_HEADER_SIZE });
            }

            return this;
        },
        adjustSpaces: function() {

        },
        setFont: function(size, color) {
           this.textFont({ size: size })
               .textColor(color, 1.0);
        }
    });

    Crafty.c("_screenSwitchButton", {
        init: function() {
            this.addComponent("_button, Text")
                .textFont({ size: MEDIUM_HEADER_SIZE + 'px', family: 'FixedSys' })
                .textColor('#FFFFFF', 1.0)
                .attr({ h: MEDIUM_HEADER_SIZE })
                .css("text-align", "center");
        },
        setWidth: function() {
            this.w = this._text.length * MEDIUM_HEADER_CHAR_WIDTH;

            return this;
        },
        activate: function() {
            MyAudio.playSound("menuSelect");
            Crafty.scene(this.connectedScreen);
        }
    })

    Crafty.c("startButton", {
        connectedScreen: "tutorialScreen",
        init: function() {
            this.addComponent("_screenSwitchButton")
               .text("START")
               .setWidth();
        }
    });

    Crafty.c("optionsButton", {
        connectedScreen: "optionsScreen",
        init: function() {
            this.addComponent("_screenSwitchButton")
                .text("OPTIONS")
                .setWidth();
        }
    });

    Crafty.c("creditsButton", {
        connectedScreen: "creditsScreen",
        init: function() {
            this.addComponent("_screenSwitchButton")
                .text("CREDITS")
                .setWidth();
        }
    });

    Crafty.c("indicator", {
        init: function(){
            this.requires("2D, DOM, Image").image("images/indicator2.png");
            this.flip("x");
        }});

    Crafty.c("_backButton", {
        connectedScreen: null,
        init: function() {
            this.addComponent("2D, DOM, I_backButton, Mouse");
            this.css("cursor","pointer");
            this.bind("MouseOver", function() {
                this.css("background-position", "0 0");
            });
            this.bind("MouseOut", function() {
                this.css("background-position", "-240px 0");
            });
            this.bind("Click", function() {
                this.activate();
            });
        }
    });

    Crafty.c("backButton", {
        init: function() {
            this.addComponent("_backButton");
            this.connectedScreen = "startScreen";
        },
        activate: function() {
            MyAudio.playSound("menuSelect");
            Crafty.scene(this.connectedScreen);
       }
    });

    Crafty.c("musicStartingBackButton", {
        init: function() {
            this.addComponent("_backButton");
            this.connectedScreen = "optionsScreen";
        },
        activate: function() {
            MyAudio.playSound("menuSelect");
            MyAudio.playMusic("start");
            Crafty.scene(this.connectedScreen);
        }
    });
    
    Crafty.c("spectrumSlider", {
        pressed: false,
        marker: null,
        init: function() {
            this.addComponent("I_soundSlider, Mouse");
        },
        initialize: function(startingSliderXPercentage, sliderFunction) {
            this.marker = Crafty.e("2D, DOM, N_playerDown");
           
            this.marker.attr({
                x: this._x + this._w * startingSliderXPercentage - this.marker._w / 2,
                y: this._y - 2
            } );

            this.bind("MouseDown", function(e) {
                this.pressed = true;
                this.marker.x = e.realX - this.marker._w / 2;
            });

            this.bind("MouseUp", function(e) {
                this.pressed = false;
                sliderFunction(this);
            });

            this.bind("MouseMove", function(e) {
                if (this.pressed) {
                    this.marker.x = e.realX;
                }
            });
        },
        bindWithCycler: function(leftSelectionIndicator, rightSelectionIndicator) {
            this.bind("MouseOver", function() {
                leftSelectionIndicator.y = this._y;
                rightSelectionIndicator.y = this._y;
            });
        }
    });

    // The MenuCycler uses an array of buttons
    // and allows for keyboard control navigation
    // of menu items.
    Crafty.c("MenuCycler", {
        currentButton: 0,
        buttonsArray: null,
        leftSelectionIndicator: null,
        rightSelectionIndicator: null,
        numOfColumns: 1,
        numOfButtonsWithinLRSelectableColumns: null,
        initialize: function(buttonsArray, numOfColumns, numOfButtonsWithinLRSelectableColumns) {
            this.requires("2D");

            this.numOfColumns = numOfColumns;
            this.numOfButtonsWithinLRSelectableColumns = numOfButtonsWithinLRSelectableColumns;
            this.buttonsArray = buttonsArray;

            this.leftSelectionIndicator = Crafty.e("2D, DOM, Image, indicator");
            this.rightSelectionIndicator = Crafty.e("2D, DOM, Image, indicator");
            this.rightSelectionIndicator.flip("X");

            this.moveIndicator();

            // Bind buttons with indicators so mousing over will move the indicators.
            for (var i = 0; i < buttonsArray.length; i++) {
                buttonsArray[i].bindWithCycler(this.leftSelectionIndicator, this.rightSelectionIndicator);
            }

            var cycler = this;
            if (this.numOfColumns > 1) {
                cycler.bind("KeyUp", cycler.cycleMenuWithHorizontalNav);
            }
            else {
                cycler.bind("KeyUp", cycler.cycleMenu);
            }
        },
        cycleMenu: function(e) {
            if (e.keyCode === Crafty.keys.UP_ARROW || e.keyCode === Crafty.keys.W) {
                MyAudio.playSound("menuCycle");
                if (this.currentButton > 0) {
                    this.currentButton--;
                }
                else {
                    this.currentButton = this.buttonsArray.length - 1;
                }
                this.moveIndicator();
            }
            else if (e.keyCode === Crafty.keys.DOWN_ARROW || e.keyCode === Crafty.keys.S) {
                MyAudio.playSound("menuCycle");
                if (this.currentButton < this.buttonsArray.length - 1) {
                    this.currentButton++;
                }
                else {
                    this.currentButton = 0;
                }
                this.moveIndicator();
            }
            else if (e.keyCode === Crafty.keys.ENTER) {
                this.buttonsArray[this.currentButton].activate();
            }
        },
        moveIndicator: function() {
            this.leftSelectionIndicator.x = this.buttonsArray[this.currentButton]._x - INDICATOR_PADDING;
            this.rightSelectionIndicator.x = this.buttonsArray[this.currentButton]._x +
                this.buttonsArray[this.currentButton]._w + INDICATOR_PADDING / 2;
            this.leftSelectionIndicator.y = this.buttonsArray[this.currentButton]._y +
                this.buttonsArray[this.currentButton]._h / 2 - this.leftSelectionIndicator._h / 2;
            this.rightSelectionIndicator.y = this.buttonsArray[this.currentButton]._y +
                this.buttonsArray[this.currentButton]._h / 2 - this.rightSelectionIndicator._h / 2;
        }
    });

    Crafty.c("ControlsMenuCycler", {
        init: function() {
            this.addComponent("MenuCycler");
        },
        cycleMenuWithHorizontalNav: function(e) {
            if (e.keyCode !== Crafty.keys.ESC) {
                if (!keyJustBound) {
                    this.cycleMenu(e);

                    if (e.keyCode === Crafty.keys.LEFT_ARROW || e.keyCode === Crafty.keys.A) {
                        MyAudio.playSound("menuCycle");
                        if (this.currentButton >= this.numOfButtonsWithinLRSelectableColumns / this.numOfColumns) {
                            this.currentButton -= this.numOfButtonsWithinLRSelectableColumns / this.numOfColumns;
                            this.moveIndicator();
                        }
                    }
                    else if (e.keyCode === Crafty.keys.RIGHT_ARROW || e.keyCode === Crafty.keys.D) {
                        MyAudio.playSound("menuCycle");
                        if (this.currentButton < this.numOfButtonsWithinLRSelectableColumns / this.numOfColumns) {
                            this.currentButton += this.numOfButtonsWithinLRSelectableColumns / this.numOfColumns;
                            this.moveIndicator();
                        }
                    }
                }
                else {
                    keyJustBound = false;
                }
            }
        }
    })

    // Scenes
    //var assetsObj = {
    //    "sprites": {
    //        "images/spritesheet.png",
    //
    //    }
    //};
    Crafty.scene("loadScreen", function() {
        //Crafty.load(["images/spritesheet.png", "images/credits.png", "images/indicator2.png"], function() {
            Crafty.scene("startScreen");
        //});

        //Crafty.background("#000000");
        //Crafty.e("2D, DOM, Text")
        //    .attr({ x: GLOBAL.viewport.w / 2,
        //        y: GLOBAL.viewport.h / 2 })
        //    .text("Loading")
        //    .css({ "text-align": "center"});
    });

    Crafty.scene("startScreen", function() {
        Crafty.viewport.reload();

        Crafty.background("#000000");

        var buttonsArray = [];

        var title = Crafty.e("2D, DOM, I_mainLogo");
        title.attr({
                x: GLOBAL.viewport.w / 2 - title.w / 2, //250,
                y: GLOBAL.viewport.h / 4 - title.h / 2 //75
            });
        // outer frame: #F9F8F6
        var outerFrame = Crafty.e("2D, DOM")
            .css("border", "7px solid #F9F8F6");
        outerFrame.attr({
                x: GLOBAL.viewport.w / 2 - FRAME_WIDTH / 2 - 4, //390,
                y: GLOBAL.viewport.h / 3 * 2 - FRAME_HEIGHT / 2 - 4, //298
                w: FRAME_WIDTH,
                h: FRAME_HEIGHT
            });
        var innerFrame = Crafty.e("2D, DOM")
            .css("border", "5px solid #35494F");
        innerFrame.attr({
                x: outerFrame.x + 15,
                y: outerFrame.y + 15,
                w: FRAME_WIDTH - 27,
                h: FRAME_HEIGHT - 27
            });

        buttonsArray[0] = Crafty.e("startButton");
        buttonsArray[0].attr({
                x: innerFrame._x + innerFrame._w / 2 - buttonsArray[0]._w / 2 + 4,
                y: innerFrame._y + innerFrame._h / 4 - buttonsArray[0]._h / 2 - MAIN_MENU_ITEM_ADJUSTMENT
            });
        buttonsArray[1] = Crafty.e("optionsButton");
        buttonsArray[1].attr({
                x: innerFrame._x + innerFrame._w / 2 - buttonsArray[1]._w / 2 + 4,
                y: innerFrame._y + innerFrame._h / 2 - buttonsArray[1]._h / 2
            });
        buttonsArray[2] = Crafty.e("creditsButton");
        buttonsArray[2].attr({
                x: innerFrame._x + innerFrame._w / 2 - buttonsArray[2]._w / 2 + 4,
                y: innerFrame._y + innerFrame._h / 4 * 3 - buttonsArray[2]._h / 2 + MAIN_MENU_ITEM_ADJUSTMENT
            });

        Crafty.e("2D, MenuCycler").initialize(buttonsArray, 1);
    });

    Crafty.scene("optionsScreen", function() {
        var optionsHeader = Crafty.e("_menuHeader")
            .text("- OPTIONS -");
        optionsHeader.setHeaderSize("large")
            .attr({
                x: GLOBAL.viewport.w / 2 - optionsHeader._w / 2,
                y: GLOBAL.viewport.h / 4 - optionsHeader._h / 2
            });

        var buttonsArray = [];

        var soundButton = Crafty.e("_screenSwitchButton");
        soundButton.text("SOUND")
            .setWidth()
            .attr({
            x: GLOBAL.viewport.w / 2 - soundButton._w / 2,
            y: GLOBAL.viewport.h / 3
        })

        soundButton.connectedScreen = "soundScreen";
        buttonsArray.push(soundButton);

        var controlsButton = Crafty.e("_screenSwitchButton");
        controlsButton.text("CONTROLS")
            .setWidth()
            .attr({
            x: GLOBAL.viewport.w / 2 - controlsButton._w / 2,
            y: GLOBAL.viewport.h / 3 + MEDIUM_HEADER_SIZE * 1.5
        });

        controlsButton.connectedScreen = "controlsScreen";
        buttonsArray.push(controlsButton);

        Crafty.e("2D, MenuCycler").initialize(buttonsArray, 1);

        var backButton = Crafty.e("backButton");
        backButton.y = 610;

        Crafty.e("2D, DOM").bind("KeyUp", function(e) {
            if (e.keyCode === Crafty.keys.ESC) {
                backButton.activate();
            }
        });
    });

    Crafty.scene("soundScreen", function() {
        function setSFXVolToSliderPos(slider) {
            // Set SFX volume.
            var volume = ((slider.marker._x - slider._x) / slider._w).toFixed(2);
            console.log("SFX volume set to: " + volume);
            MyAudio.setSFXVolume(parseFloat(volume));
            MyAudio.playSound("shift");
        }

        function setMusicVolToSliderPos(slider) {
            // Set music volume.
            var volume = ((slider.marker._x - slider._x) / slider._w).toFixed(2);
            console.log("Music set to: " + volume);
            MyAudio.setMusicVolume(parseFloat(volume));
            MyAudio.playMusicVolumeTest("ambience2");
        }

        // Header
        var volumeSectionHeader = Crafty.e("2D, DOM, _menuHeader")
            .text("- VOLUME -");
        volumeSectionHeader.setHeaderSize("medium")
            .attr( {
                x: GLOBAL.viewport.w / 2 - volumeSectionHeader._w / 2,
                y: GLOBAL.viewport.h / 4 - volumeSectionHeader._h / 2
            } );

        var buttonsArray = [];

        // Sound Effects Section
        var sfxHeader = Crafty.e("2D, DOM, _menuHeader")
            .text("Effects");
        sfxHeader.setHeaderSize("small")
            .attr( {
            x: GLOBAL.viewport.w / 2 - sfxHeader._w / 2,
            y: GLOBAL.viewport.h / 3 - sfxHeader._h / 2
            } )

        var sfxSlider = Crafty.e("2D, DOM, spectrumSlider");
        sfxSlider.attr( {
                x: sfxHeader._x + sfxHeader._w / 2 - sfxSlider._w / 2,
                y: sfxHeader._y + 40
            } );
        sfxSlider.initialize(MyAudio.getSFXVolume(), setSFXVolToSliderPos);
        buttonsArray.push(sfxSlider);
        
        // Music Section
        var musicHeader = Crafty.e("2D, DOM, _menuHeader")
            .text("Music");
        musicHeader.setHeaderSize("small")
            .attr( {
                x: GLOBAL.viewport.w / 2 - musicHeader._w / 2,
                y: GLOBAL.viewport.h / 2.2 - musicHeader._h / 2
            } )

        var musicSlider = Crafty.e("2D, DOM, spectrumSlider");
        musicSlider.attr( {
                x: musicHeader._x + musicHeader._w / 2 - musicSlider._w / 2,
                y: musicHeader._y + 40
            } );
        musicSlider.initialize(MyAudio.getMusicVolume(), setMusicVolToSliderPos);
        buttonsArray.push(musicSlider);

        // When the mouse goes up anywhere else, we check which slider
        // was pressed and set the volume accordingly.
        Crafty.e("2D, DOM, Mouse")
            .attr( {z: -1, w: GLOBAL.viewport.w, h: GLOBAL.viewport.h} )
            .bind("MouseUp", function() {
            if (sfxSlider.pressed) {
                sfxSlider.pressed = false;

                setSFXVolToSliderPos(sfxSlider);
            }
            else if (musicSlider.pressed) {
                musicSlider.pressed = false;

                setMusicVolToSliderPos(musicSlider);
            }
        });

        // Other stuff
        var backButton = Crafty.e("musicStartingBackButton");
        backButton.y = 610;
        
        var menuCycler = Crafty.e("2D, MenuCycler");
        menuCycler.initialize(buttonsArray);

        function moveSliderMarker(slider, amount, updateFunction) {
            if (amount < 0) {
                if (slider._x < slider.marker._x + amount * slider._w)
                    slider.marker.x += amount * slider._w;
                else
                    slider.marker.x = slider._x;
            }
            else if (amount > 0) {
                if (slider._x + slider._w > slider.marker._x + amount * slider._w)
                    slider.marker.x += amount * slider._w;
                else
                    slider.marker.x = slider._x + slider._w - slider.marker._w / 2;
            }

            updateFunction(slider);
        }

        // Key binder.
        Crafty.e("2D, DOM").bind("KeyUp", function(e) {
            if (e.keyCode === Crafty.keys.ESC) {
                backButton.activate();
            }            
            else if (e.keyCode === Crafty.keys.LEFT_ARROW || e.keyCode === Crafty.keys.A) {
                if (menuCycler.currentButton === 0)
                    moveSliderMarker(sfxSlider, -0.2, setSFXVolToSliderPos);
                else if (menuCycler.currentButton === 1) {
                    moveSliderMarker(musicSlider, -0.2, setMusicVolToSliderPos);
                }
            }
            else if (e.keyCode === Crafty.keys.RIGHT_ARROW || e.keyCode === Crafty.keys.D) {
                if (menuCycler.currentButton === 0)
                    moveSliderMarker(sfxSlider, 0.2, setSFXVolToSliderPos);
                else if (menuCycler.currentButton === 1) {
                    moveSliderMarker(musicSlider, 0.2, setMusicVolToSliderPos);
                }
            }
        });

        // Stop the music from playing in the options screen
        // so the volume levels can be set.
        window.setTimeout(function() {
            MyAudio.stop();
        }, 300);
    });

    Crafty.scene("controlsScreen", function() {
        var controlsHeader = Crafty.e("_menuHeader")
            .text("- CONTROLS -");
        controlsHeader.setHeaderSize("medium")
            .attr({
            x: GLOBAL.viewport.w / 2 - controlsHeader._w / 2,
            y: GLOBAL.viewport.h / 4 - controlsHeader._h / 2
        })

        var buttonsArray = [];
        var buttonArrayPos = 0;

        function addControlsSet(headerTitle, x, y, itemCharLength, controlsObject) {
            var counter = 0;
            var header = Crafty.e("_menuHeader")
                .text(headerTitle)
                .setHeaderSize("small")
                .css("text-decoration", "underline")
            header.attr({
                    x: x - header._w / 2,
                    y: y - header._h / 2
                });

            for (var property in controlsObject) {
                buttonsArray[buttonArrayPos] = Crafty.e("_controlSetupButton");
                buttonsArray[buttonArrayPos].css("text-align", "left")
                    .initialize(property, controlsKeyMap.getKeyString(controlsObject[property]),
                        itemCharLength, controlsObject)
                    .attr({ x: header._x - (buttonsArray[buttonArrayPos]._w - header._w) / 2,
                            y: header._y + (counter + 1) * CONTROLS_ITEM_SPACING });

                buttonArrayPos++;
                counter++;
            }
        }

        // TODO(Blake): Deal w/magic numbers.
        addControlsSet("Left Player", controlsHeader._x - 60, controlsHeader._y + 60, 21, GLOBAL.p1Keys);
        addControlsSet("Right Player", controlsHeader._x + controlsHeader._w + 60, controlsHeader._y + 60, 21, GLOBAL.p2Keys);
        addControlsSet("Common", controlsHeader._x + controlsHeader._w / 2, GLOBAL.viewport.h / 4 * 3 - 40, 29, GLOBAL.commonKeys);

        Crafty.e("2D, ControlsMenuCycler").initialize(buttonsArray, 2, 14);

        var backButton = Crafty.e("backButton");
        backButton.y = 610;
        backButton.connectedScreen = "optionsScreen";

        Crafty.e("2D, DOM").bind("KeyUp", function(e) {
            if (e.keyCode === Crafty.keys.ESC) {
                if (!keyJustBound) {
                    backButton.activate();
                }
                else {
                    keyJustBound = false;
                }
            }
        });
    });

    Crafty.scene("creditsScreen", function(){
        Crafty.e("2D, DOM, Image").image("images/credits.png")
            .attr({
                x : 250
            });
        var backButton = Crafty.e("backButton")
            .attr({
                y: 610
            });

        Crafty.e("2D, DOM").bind("KeyUp", function(e) {
            if (e.keyCode === Crafty.keys.ESC) {
                backButton.activate();
            }
        });
    });

    Crafty.scene("gameOverScreen", function(){
        MyAudio.stop("blobbyTracking");
        MyAudio.stop("walk");
        MyAudio.stop("heartBeat");
        MyAudio.stopMusicRotation();

        flashFX.stopContinuousFlash();

        GLOBAL.player1 = null;
        GLOBAL.player2 = null;

        flashFX.flash("#000", .1, .01, undefined, undefined, function() {
            lightFX.deleteCanvas();

            GLOBAL.firstLevel = true;

            Crafty.unbind("EnterFrame", "lightingFX");
            Crafty.e("2D, DOM, I_gameOver")
                .attr({
                    x : 0
                });

            Crafty.e("2D, DOM").bind("KeyUp", function(e) {
                if (e.keyCode === Crafty.keys.ESC || e.keyCode === Crafty.keys.ENTER || e.keyCode === Crafty.keys.SPACE) {
                    flashFX.deleteCanvas();
                    Crafty.scene("startScreen");
                }
            });
        });
    });

    Crafty.scene("endingScreen", function(){
        MyAudio.stop("blobbyTracking");
        MyAudio.stop("walk");
        lightFX.deleteCanvas();

        GLOBAL.firstLevel = true;

        Crafty.e("2D, DOM, I_theEnd")
            .attr({
                x: 0
            });

        Crafty.e("2D, DOM").bind("KeyUp", function(e) {
            if (e.keyCode === Crafty.keys.ESC || e.keyCode === Crafty.keys.ENTER || e.keyCode === Crafty.keys.SPACE) {
                flashFX.deleteCanvas();
                Crafty.scene("startScreen");
            }
        });
    });

})();