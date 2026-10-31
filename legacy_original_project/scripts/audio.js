//Audio.js
//Contains initialization of audio files
//and functions to play audio.

var MyAudio = (function sound(){

    Crafty.audio.add("start","music/chase.ogg");
    Crafty.audio.add("ambience1","music/ambience1.ogg");
    Crafty.audio.add("ambience2","music/ambience2.ogg");
    Crafty.audio.add("ambience3","music/ambience3.ogg");
    Crafty.audio.add("ambience4","music/ambience4.ogg");
    Crafty.audio.add("ambience5","music/ambience5.ogg");
    Crafty.audio.add("ambience6","music/ambience6.ogg");
    Crafty.audio.add("ambience7","music/ambience7.ogg");
    Crafty.audio.add("ambience8","music/ambience8.ogg");
    Crafty.audio.add("bigHit","music/bigHit.ogg");
    Crafty.audio.add("chimes","music/chimes.ogg");
    Crafty.audio.add("crazyPiano","music/crazyPiano.ogg");
    Crafty.audio.add("demonBass","music/demonBass.ogg");
    Crafty.audio.add("demonVoice","music/demonVoice.ogg");
    Crafty.audio.add("eerieSynth","music/eerieSynth.ogg");
    Crafty.audio.add("goblinSound","music/globinSound.ogg");
    Crafty.audio.add("pianoEnd","music/pianoEnd.ogg");
    Crafty.audio.add("piano","music/piano.ogg");
    Crafty.audio.add("swoosh","music/swoosh.ogg");

    Crafty.audio.add("blobbyTracking","soundEffects/blobbyTracking.ogg");
    Crafty.audio.add("damage","soundEffects/playerDamaged.ogg");
    Crafty.audio.add("menuSelect","soundEffects/menuSelect.ogg");
    Crafty.audio.add("inventory","soundEffects/inventoryCycle.ogg");
    Crafty.audio.add("shift","soundEffects/shift.ogg");
    Crafty.audio.add("evilLampAttack","soundEffects/lampEnemyAttack.ogg"); // ADD
    Crafty.audio.add("shortAttack","soundEffects/shortAttack.ogg");
    Crafty.audio.add("longAttack","soundEffects/longAttack.ogg");
    Crafty.audio.add("death","soundEffects/playerDeath.ogg");
    Crafty.audio.add("walk","soundEffects/playerWalking.ogg");
    Crafty.audio.add("eatingFood", "soundEffects/eatingFood.ogg");
    Crafty.audio.add("menuCycle", "soundEffects/menuCycle.ogg");
    Crafty.audio.add("fire", "soundEffects/fire.ogg");
    Crafty.audio.add("doorClosing", "soundEffects/doorClosing.ogg");
    Crafty.audio.add("flashlightOnOff", "soundEffects/flashlightOnOff.ogg");
    Crafty.audio.add("itemDrop", "soundEffects/itemDrop.ogg");
    Crafty.audio.add("itemPickup", "soundEffects/itemPickup.ogg");
    Crafty.audio.add("doorUnlocking", "soundEffects/doorUnlocking.ogg");
   // Crafty.audio.add("doorLocking", "soundEffects/pressureDoorLocking.ogg");
    Crafty.audio.add("error", "soundEffects/error.ogg");
    Crafty.audio.add("safeOpening", "soundEffects/safeOpening.ogg");
    Crafty.audio.add("leverOff", "soundEffects/leverOff.ogg");
    Crafty.audio.add("leverOn", "soundEffects/leverOn.ogg");
    Crafty.audio.add("weaponSwoosh", "soundEffects/weaponSwoosh.ogg");
    Crafty.audio.add("fryingPanHit", "soundEffects/fryingPanHit.ogg"); // ADD

    Crafty.audio.add("heartBeat", "soundEffects/heartBeat.ogg");
    Crafty.audio.add("creaking1", "soundEffects/creaking1.ogg");
    Crafty.audio.add("creaking2", "soundEffects/creaking2.ogg");
    Crafty.audio.add("creaking3", "soundEffects/creaking3.ogg");
    Crafty.audio.add("creaking4", "soundEffects/creaking4.ogg");

    Crafty.audio.add("growl1", "soundEffects/Growl 1.ogg");
    Crafty.audio.add("growl2", "soundEffects/Growl 2.ogg");
    Crafty.audio.add("growl3", "soundEffects/Growl 3.ogg");
    Crafty.audio.add("growl4", "soundEffects/Growl 4.ogg");
    Crafty.audio.add("growl5", "soundEffects/Growl 5.ogg");

    var noThreatMusicList = [
        "ambience1",
        "ambience3",
        "ambience5",
        "ambience6",
        "ambience7",
        "ambience8",
        "demonVoice",
        "eerieSynth",
        "pianoEnd"
    ];
    var threatMusicList = [
        "ambience4",
        "start",
        "demonBass",
        "goblinSound"
    ];

    var currentMusic;
    var musicVolume = .5;
    var sfxVolume = .7;
    var isMuted = false;

    function cycleMusic() {
        setTimeout(function() {
            currentMusic.removeEventListener("ended", cycleMusic);
            if (Crafty("Blobby, EvilLamp").length > 0) {
                currentMusic = Crafty.audio.play(threatMusicList[Math.floor(Math.random() * threatMusicList.length)], 1,.5);
            }
            else {
                currentMusic = Crafty.audio.play(noThreatMusicList[Math.floor(Math.random() * noThreatMusicList.length)], 1,.5);
            }
            currentMusic.addEventListener("ended", cycleMusic);
        }, Math.floor(Math.random() * 30000));
    }

    return {
        //Sound: play one time, return html5 sound object.
        playSound : function (name) {
            Crafty.audio.play(name, 1, sfxVolume);
        }
        ,
        playLoopedSound : function (name) {
            Crafty.audio.play(name, -1, sfxVolume);
        }
        ,
        //Music: last forever, return html5 sound object.
        playMusic : function(name){
            Crafty.audio.play(name, -1, musicVolume);
        }
        ,
        playMusicVolumeTest : function(name) {
            Crafty.audio.play(name, 1, musicVolume);
        },
        stop : function(name){
            Crafty.audio.stop(name);
        }
        ,
        startMusic : function() {
            // If there are threats in the current room.
            if (Crafty("Blobby, EvilLamp").length > 0) {
                currentMusic = Crafty.audio.play(threatMusicList[Math.floor(Math.random() * threatMusicList.length)], 1,.5);
            }
            else {
                currentMusic = Crafty.audio.play(noThreatMusicList[Math.floor(Math.random() * noThreatMusicList.length)], 1,.5);
            }
            currentMusic.addEventListener("ended", cycleMusic);
        },
        stopMusicRotation : function() {
            currentMusic.pause();
        },
        setSFXVolume: function(volume) {
            sfxVolume = volume;
        },
        getSFXVolume: function() {
            return sfxVolume;
        },
        setMusicVolume: function(volume) {
            musicVolume = volume;
        },
        getMusicVolume: function() {
            return musicVolume;
        },
        bindMuteToKey: function() {
            Crafty.bind("KeyUp", this.toggleMute);
        },
        unbindMute: function() {
            Crafty.unbind("KeyUp", this.toggleMute);
        },
        toggleMute: function(e) {
            if (e.key === GLOBAL.commonKeys.Mute) {
                Crafty.audio.toggleMute();
                if (isMuted)
                    isMuted = false;
                else
                    isMuted = true;
            }
        },
        isManuallyMuted: function() {
            return isMuted;
        }
    };
})();


