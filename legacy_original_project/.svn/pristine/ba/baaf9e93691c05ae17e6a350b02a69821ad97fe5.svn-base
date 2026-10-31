// game.js
// Contains the game initializations.

(function() {

    window.onload = (function () {
        Crafty.init(GLOBAL.viewport.w, GLOBAL.viewport.h);
        Crafty.canvas.init();

        // Set background color to black
        document.body.setAttribute("bgcolor", "#000000");

        // Center game screen
        var cr_stage = document.getElementById("cr-stage");
        cr_stage.style.top = "-325px";
        document.body.removeChild(cr_stage);

        var horizon = document.createElement("div");
        horizon.style.position = "absolute";
        horizon.style.top = "50%";
        horizon.style.width = "100%";
        document.body.appendChild(horizon);
        horizon.appendChild(cr_stage);

        if (document.getElementsByTagName("table")[1] == undefined)
            generateDebugTable();

        MyAudio.bindMuteToKey();
        // Add menu music here.
        //MyAudio.playMusic("start");

        Crafty.scene("loadScreen");
    });

    // create a table to display
    function generateDebugTable() {
        var table = document.createElement("table");
        table.border = "1px";
        table.style.position = "fixed";
        table.style.bottom = "5%";
        table.style.left = "50%";

//        document.body.appendChild(table);

        var key = document.createElement("tr");
        var value = document.createElement("tr");
//        table.appendChild(key);
//        table.appendChild(value);

        // display on the screen
        var lightingKey = document.createElement("th");
        lightingKey.innerHTML = "Light On/Off";
        var lightingValue = document.createElement("th");
        lightingValue.innerHTML = "Y";
//        key.appendChild(lightingKey);
//        value.appendChild(lightingValue);

        // display on the screen
        var muteKey = document.createElement("th");
        muteKey.innerHTML = "Mute On/Off";
        var muteValue = document.createElement("th");
        muteValue.innerHTML = "U";
//        key.appendChild(muteKey);
//        value.appendChild(muteValue);

        // display on the screen
        var pauseKey = document.createElement("th");
        pauseKey.innerHTML = "PAUSE";
        var pauseValue = document.createElement("th");
        pauseValue.innerHTML = "P";
//        key.appendChild(pauseKey);
//        value.appendChild(pauseValue);

        // display on the screen
        var health = document.createElement("th");
        health.innerHTML = "HEALTH";
//        key.appendChild(health);
        // GLOBAL
        healthValue = document.createElement("th");
//        value.appendChild(healthValue);
        healthValue.innerHTML = "None";
    }

})();

/*
TODO: Make player sprite update immediately after taking damage
 Needs to refactor animations and sprites to centralize sprite selection.
TODO: Fix bug of undefined (other) tile when attacking
TODO: Realign all damage flash properties for new hp system.
TODO: Fix sprites
TODO: Make players warp towards each other when damaged by blobby (A-star).
TODO: Randomly locate chests with gems
TODO: Fix sound problems (footsteps, blobby).
TODO: Limit sound channels to 5
TODO: Tutorials
TODO: Review code for each file
TODO: JSLint
TODO: Profile and optimize
TODO: Minimize enterframe and onHit events
TODO: Move delay events to new format with repeatCount
TODO: Debug.
TODO: Optimize.
*/
