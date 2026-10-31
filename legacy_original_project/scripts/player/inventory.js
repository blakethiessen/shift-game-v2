
(function() {
    Crafty.c("Inventory", {
        currentItemNumber: 0,
        init: function() {
            this.items = [];
            this.inventoryActive = false;
            this.activationTime = 0;
//            this.items.push(Crafty.e("2D, Canvas, I_redFlashLight, Persist, FlashLight").attr( {z: 9, visible: false} ));

            for (var i = 0; i < this.items.length; i++) {
                this.items[i].removeComponent("Interactable");
            }

            function updateInventoryPosition() {
                if (this.items[this.currentItemNumber] != null) {
                    this.items[this.currentItemNumber].attr( {x: this._x, y: this._y - GLOBAL.tileW} );
                    if (this.inventoryActive && this.activationTime + 1 < new Date().getSeconds()) {
                        this.inventoryActive = false;
                        this.items[this.currentItemNumber].attr({ visible: false, x: 0, y: 0 });
                    }
                }
            }
            this.bind("PlayerMoving", updateInventoryPosition);
            this.bind("InventoryActive", updateInventoryPosition);
        },

        cycleAndDisplayItems: function() {
            this.inventoryActive = true;
            MyAudio.playSound("inventory");

            // Rotate items
            if (this.items.length >= 1) {
                if (this.currentItemNumber < this.items.length - 1) {
                    this.items[this.currentItemNumber].visible = false;
                    this.currentItemNumber++;
                    this.items[this.currentItemNumber].visible = true;
                }
                else {
                    this.items[this.currentItemNumber].visible = false;
                    this.currentItemNumber = 0;
                    this.items[this.currentItemNumber].visible = true;
                }
            }

            Crafty.trigger("InventoryActive", null);

            this.activationTime = new Date().getSeconds();
        },

        cycleItems: function() {
            if (this.items.length >= 1) {
                if (this.currentItemNumber < this.items.length - 1) {
                    this.currentItemNumber++;
                }
                else {
                    this.currentItemNumber = 0;
                }
            }
        },

        useCurrentItem: function(player, playerDirection, interactingObject) {
            if (this.getCurrentItem() != null) {
                if (this.getCurrentItem().use(player, playerDirection, interactingObject)) {
                    this.deleteCurrentItem();
                }
            }
        },

        deleteCurrentItem: function() {
            var removedItemArr = this.items.splice(this.currentItemNumber, 1);
            this.cycleItems();

            removedItemArr[0].destroy();
        },

        getCurrentItem: function() {
            if (this.items.length > 0)
                return this.items[this.currentItemNumber];

            return null;
        },

        removeCurrentItem: function() {
            if (this.items.length > 0) {
                MyAudio.playSound("itemDrop");
                var removedItemArr = this.items.splice(this.currentItemNumber, 1);
                this.cycleItems();

                removedItemArr[0].removeComponent("Persist");
                removedItemArr[0].addComponent("Interactable");

                if (removedItemArr[0].turnOff !== undefined)
                    removedItemArr[0].turnOff(this);

                return removedItemArr[0];
            }

            return null;
        },

        addNewItem: function(item) {
            // Remove interactable so it doesn't autoset as the interactable item
            // when you have your inventory open.
            item.removeComponent("Interactable");
//            if (this.items.length <= 4) {
            MyAudio.playSound("itemPickup");
            item.addComponent("Persist");
            item.z = 8;
            this.items.push(item);
            this.items[this.items.length - 1].visible = false;

//            }
//            else {
//                var oldItem = this.items.splice(this.currentItemNumber, 1, item);
//                oldItem[0].attr( {visible: true} );
//                // Draw the oldItem on the floor.
//                Crafty.e("2D, Canvas, " + oldItem)
//                    .attr( {x: item._x, y: item._y, z: item.z} );
//            }
        },

        dePersistifyInventory: function() {
            for (var i = 0; i < this.items.length; i++) {
                this.items[i].removeComponent("Persist");
            }
        }
    });
})();