(function () {

    Crafty.c("ChestBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("This chest is locked! To open it, activate all of the pressure plates and levers in the room.");
        },
        interact: function(player) {

        }
    });

    Crafty.c("SpawnBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("This door will take you back to the first room you entered in. You don’t have to complete the tutorial in reverse!");
        },
        interact: function(player) {

        }

    });

    Crafty.c("StatueBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("Good job on finishing the tutorials, now your goal is to find the 3 colored gems and place them in this statue. The black doors at the beginning can only be unlocked with the black key hidden in this statue!");
        },
        interact: function(player) {

        }
    });

    Crafty.c("KeyBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("The door ahead is locked! There’s a key somewhere in here... Either player may unlock a door, as both doors will remain unlocked afterwards.");
        },
        interact: function(player) {

        }
    });

    Crafty.c("EvillampBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("That’s not a real lamp! Beware standing too close to it for too long!");
        },
        interact: function(player) {

        }
    });

    Crafty.c("MonsterBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("Woah! There are dangerous monsters in the evil dimension. Caution up ahead.");
        },
        interact: function(player) {

        }
    });

    Crafty.c("PressureBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("This door is locked by a pressure mechanism and cannot be opened with a key! Find the pressure plate and activate it to move on.");
        },
        interact: function(player) {

        }
    });

    Crafty.c("PushableBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("Boxes in the world are moveable by your character. Things that you push in one dimension also move in the other!");
        },
        interact: function(player) {

        }
    });

    Crafty.c("WallOverlayBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("Not all of the features of the world are the same in both dimensions. Those transparent looking walls are safe to walk on, but beware shifting dimensions on them!");
        },
        interact: function(player) {

        }
    });

    Crafty.c("FlashlightBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("This flashlight will be your friend. Pick it up by interacting with it and pressing “Q” or “,” when the text appears.");
        },
        interact: function(player) {

        }
    });

    Crafty.c("FoodBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("Health is shared between both players. Food will heal you both for 25% of your health. Pick it up by interacting and pressing “Q” or “,” when the text appears. “E” or “.” will eat it, restoring health.");
        },
        interact: function(player) {

        }
    });

    Crafty.c("BlackBook", {
        init: function() {
            this.addComponent("Interactable, PopUpText")
                .setPopUpText("This door is your ultimate goal and salvation from the colliding of the dimensions! It is locked though; only a special black key may open it. Explore the world and find the key to escape!");
        },
        interact: function(player) {

        }
    });

})();