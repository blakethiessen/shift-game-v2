(function() {

    Crafty.scene("tutorialScreen", function() {
        Crafty.e("TutorialText");

        Crafty.e("2D, DOM").bind("KeyDown", function(e) {
            Crafty.scene("gameScreen");
        })
    });

    Crafty.c("TutorialText", {
        init : function() {
            this.addComponent("2D, DOM, Text");
            this.attr({
                x : GLOBAL.viewport.w/2 - 250,
                w : 500,
                y : 250
            });
            this.text('"This is a two player game. WASD/Arrow keys" to move. "E/." to interact. <i>Read all the books</i> before leaving the spawn room if you want to live... <br /><br />Press any key to continue.');
            this.css("font-family", "'Arial', cursive");
            this.css("text-align", "center");
        }
    });

}) ();