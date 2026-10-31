
(function() {

    Crafty.c("PathFinding", {
        init: function() {
            this.requires("HasTarget");
        },
        findPath : function(start, target) {
            var openList = [];
            var closedList = [];
            var path = [];

            var startingNode = this.makeNode(start._x, start._y);
            var targetNode = this.makeNode(target._x, target._y);

            openList.push(startingNode);

            while (openList.length > 0) {

                var curNode = this.getNodeWithLowestCost(openList);

                if (this.coordEqual(curNode, targetNode)) {
                    //TargetNode is not a real node, we just use it to compare the coordinate.
                    path = this.retrievePath(curNode, startingNode);
                    break;
                }

                // Remove the curNode from the openList.
                openList.splice(arrayObjectIndexOf(openList, curNode), 1);
                closedList.push(curNode);

                var adjacentNodes = this.makeAdjacentNodes(curNode);

                for (var i = 0; i < adjacentNodes.length; i++) {
                    var deltaG = this.calculateDeltaG(curNode, adjacentNodes[i]);
                    if(this.isWalkable(curNode, adjacentNodes[i]) && !doesArrayHaveTile(closedList, adjacentNodes[i])){
                        if(!doesArrayHaveTile(openList, adjacentNodes[i])) {

                            adjacentNodes[i].parent = curNode;
                            this.calculateScore(adjacentNodes[i], deltaG, targetNode);
                            openList.push(adjacentNodes[i]);
                        }
                        else if (adjacentNodes[i].G > curNode.G + deltaG) {
                            adjacentNodes[i].parent = curNode;
                            this.recalculateScore(adjacentNodes[i], deltaG);
                        }
                    }
                }
            }

            return path;
        },

        coordEqual : function(a, b){
            return a._x === b._x && a._y === b._y;
        },

        getNodeWithLowestCost : function(list){
            var node = list[0];
            for(var i = 1; i < list.length; i++){
                if(list[i].F < node.F){
                    node = list[i];
                }
            }
            return node;
        },

        retrievePath : function(targetNode, startingNode){
            var path = [];
            var curNode = targetNode;
            while(curNode !== startingNode ) {
                path.unshift(curNode);
                curNode = curNode.parent;
            }
            return path;
        },

        calculateScore : function(curNode, deltaG, targetNode){
            curNode.G = curNode.parent.G + deltaG;
            // Manhattan method (doesn't take diagonals into account)
            curNode.H = 10 * (Crafty.math.abs(targetNode._x - curNode._x) + Crafty.math.abs(targetNode._y - curNode._y));
            curNode.F = curNode.G + curNode.H;
        },

        recalculateScore : function(curNode, deltaG){
            curNode.G = curNode.parent.G + deltaG;
            curNode.F = curNode.G + curNode.H;
        },

        calculateDeltaG : function(nodeA, nodeB){
            if(nodeA._x === nodeB._x || nodeA._y === nodeB._y) {
                return 10;
            } else {
                return 14;
            }
        },

        makeAdjacentNodes : function(curNode){
            var adjacentNodes = [];
            adjacentNodes.push(this.makeNode(curNode._x + 1, curNode._y + 1));
            adjacentNodes.push(this.makeNode(curNode._x + 1, curNode._y - 1));
            adjacentNodes.push(this.makeNode(curNode._x - 1, curNode._y + 1));
            adjacentNodes.push(this.makeNode(curNode._x - 1, curNode._y - 1));
            adjacentNodes.push(this.makeNode(curNode._x + 1, curNode._y));
            adjacentNodes.push(this.makeNode(curNode._x - 1, curNode._y));
            adjacentNodes.push(this.makeNode(curNode._x, curNode._y + 1));
            adjacentNodes.push(this.makeNode(curNode._x, curNode._y - 1));
            return adjacentNodes;
        },

        isWalkable : function(prevNode, curNode) {
            if(this.matrix[curNode._x][curNode._y] === null) {
                return false;
            }
            assertTrue("matrix undefined", this.matrix !== undefined);
            assertTrue("matrix null", this.matrix !== null);

            assertTrue("matrix c c undefined", this.matrix[curNode._x][curNode._y] !== undefined);
            assertTrue("matrix c c null", this.matrix[curNode._x][curNode._y] !== null);
            assertTrue("matrix c p undefined", this.matrix[curNode._x][prevNode._y] !== undefined);
            assertTrue("matrix c p null", this.matrix[curNode._x][prevNode._y] !== null);
            assertTrue("matrix p c undefined", this.matrix[prevNode._x][curNode._y] !== undefined);
            assertTrue("matrix p c null", this.matrix[prevNode._x][curNode._y] !== null);

            assertTrue("matrix c c base undefined", this.matrix[curNode._x][curNode._y].base !== undefined);
            assertTrue("matrix c c base null", this.matrix[curNode._x][curNode._y].base !== null);
            assertTrue("matrix c p base undefined", this.matrix[curNode._x][prevNode._y].base !== undefined);
            assertTrue("matrix c p base null", this.matrix[curNode._x][prevNode._y].base !== null);
            assertTrue("matrix p c base undefined", this.matrix[prevNode._x][curNode._y].base !== undefined);
            assertTrue("matrix p c base null", this.matrix[prevNode._x][curNode._y].base !== null);

            if (this.isTileBlocked(curNode._x, curNode._y)
                || (prevNode._x !== curNode._x && this.isTileBlocked(prevNode._x, curNode._y))
                || (prevNode._y !== curNode._y && this.isTileBlocked(curNode._x, prevNode._y))) {
                return false;
            }
            else {
                return true;
            }
        },

        //constructor for nodes in A* algorithm

        makeNode : function(x, y) {
            return {
                _x : x,
                _y : y,
                F : 0, //Total path score
                G : 0, //Direct path score
                H : 0,  //Heuristic path score
                parent : null
            }
        }

    });

    function doesArrayHaveTile(array, tile) {
        for (var i = 0; i < array.length; i++) {
            if (array[i]._x === tile._x &&
                array[i]._y === tile._y) {
                return true;
            }
        }

        return false;
    }

})();