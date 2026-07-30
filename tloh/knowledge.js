document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('network');
    const loadingScreen = document.getElementById('loading-screen');

    // ==========================================
    // CONFIGURATION: LINE LAYERS
    // ==========================================
    // Define layers of lines to draw.
    // 'angle': The angle (in degrees) to snap the curve emergence to.
    // 'color': The hex color for this layer.
    // 'width': Thickness of this layer.
    // 'offset': Optional offset to prevent perfect overlap if desired (not used here, but available).
    const LINE_CONFIG = [
        { angle: 43, color: '#ccdd55', width: 1.5 }, // Layer 1: 45 deg, Greenish
        { angle: 11, color: '#c11d55', width: 1.0 }, // Layer 2: 15 deg, Reddish
        { angle: 31, color: '#44aaff', width: 1.0 }, // Layer 3: 33 deg, Blueish
        { angle: 121, color: '#44aa21', width: 1.0 }, // Layer 4: 121 deg, Greenish
        // Add more layers here as needed
    ];

    // ==========================================
    // LABEL FONT
    // ==========================================
    // vis measures each label once with ctx.measureText and caches the result to
    // size the label's background plate. VT323 is roughly a third narrower than
    // the generic monospace fallback ("Dominique DuFresne: Pirate Queen of Mars"
    // is 320px vs 481px at 20px), so if the webfont is still downloading when the
    // graph initialises, every plate gets drawn badly oversized and only snaps to
    // the right shape when a hover forces a re-measure. Loading the font before
    // the first draw removes the race.
    const LABEL_FONT = 'VT323';
    const LABEL_FONT_SPEC = '20px "' + LABEL_FONT + '"';
    const FONT_WAIT_MS = 3000;

    function whenLabelFontReady() {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        const loaded = document.fonts.load(LABEL_FONT_SPEC).then(() => document.fonts.ready);
        // Never let a slow or blocked font host hold the loading screen hostage:
        // worst case we lay out in the fallback, which is at least self-consistent.
        const cap = new Promise(resolve => setTimeout(resolve, FONT_WAIT_MS));
        return Promise.race([loaded, cap]).catch(() => {});
    }

    Promise.all([
        fetch('knowledge.json?t=' + Date.now()).then(response => {
            if (!response.ok) throw new Error('Failed to load data');
            return response.json();
        }),
        whenLabelFontReady()
    ])
        .then(([rawData]) => {
            const nodesData = Array.isArray(rawData) ? rawData : rawData.nodes;
            const linksData = Array.isArray(rawData) ? [] : (rawData.links || []);

            initGraph(nodesData, linksData);
            loadingScreen.style.display = 'none';
        })
        .catch(err => {
            console.error(err);
            loadingScreen.innerHTML = `<div style="color:red">SYSTEM FAILURE<br>${err.message}<br><small>Check console</small></div>`;
        });

    function initGraph(nodesData, linksData) {
        // Separate key and non-key nodes
        const keyNodes = nodesData.filter(n => n.isKey);
        const normalNodes = nodesData.filter(n => !n.isKey);
        
        // Calculate fixed positions for key nodes in a circle
        const centerX = container.clientWidth / 2;
        const centerY = container.clientHeight / 2;
        const radius = Math.min(centerX, centerY) * 1.8;
        
        const keyPositions = {};
        keyNodes.forEach((node, index) => {
            const angle = (index / keyNodes.length) * 2 * Math.PI - Math.PI / 2;
            keyPositions[node.id] = {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
            };
        });

        // Process Nodes
        const nodes = new vis.DataSet(nodesData.map(node => {
            const isKey = node.isKey || false;
            let nodeConfig = {
                id: node.id,
                label: node.label,
                color: {
                    background: '#000000',
                    border: '#ff9900',
                    highlight: { border: '#ffffff', background: '#ff9900' },
                    hover: { border: '#ffffff', background: '#ff9900' }
                },
                font: {
                    color: '#ff9900',
                    face: LABEL_FONT,
                    size: 20,
                    // Labels can land on the lit planets in the backdrop, so each
                    // gets its own dark plate. Kept just short of opaque so it
                    // reads as a terminal readout rather than a solid block.
                    // vis draws the plate tight to the glyphs with no padding
                    // option, so a light halo still earns its keep at the edges.
                    background: 'rgba(0, 0, 0, 0.85)',
                    strokeColor: '#000000',
                    strokeWidth: 2
                },
                borderWidth: 2,
                shadow: { enabled: true, color: '#ff9900', size: 10, x: 0, y: 0 }
            };

            if (isKey) {
                nodeConfig.shape = 'diamond';
                nodeConfig.size = 50;
                nodeConfig.fixed = { x: true, y: true };
                if (keyPositions[node.id]) {
                    nodeConfig.x = keyPositions[node.id].x;
                    nodeConfig.y = keyPositions[node.id].y;
                }
            } else {
                nodeConfig.shape = 'dot';
                nodeConfig.size = 25;
                nodeConfig.fixed = false;
                
                if (node.image && node.image.trim() !== "") {
                    nodeConfig.shape = 'circularImage';
                    nodeConfig.image = node.image;
                    nodeConfig.size = 40;
                }
            }
            
            return nodeConfig;
        }));

        // Process Links: Enable default lines (they will be the base layer)
        const edges = new vis.DataSet(linksData.map(link => ({
            from: link.from,
            to: link.to,
            color: { color: '#ff9900', highlight: '#ffffff', hover: '#ffffff' },
            width: 2, // Visible base line
            smooth: { 
                type: 'curvedCW', 
                roundness: 0.2 
            }
        })));

        const data = { nodes, edges };

        const options = {
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -10000, 
                    centralGravity: .150,
                    springLength: 100,
                    springConstant: 0.02,
                    damping: 0.1,
                    avoidOverlap: 0.8
                },
                stabilization: { iterations: 300 }
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                multiselect: false,
                zoomView: true,
                dragNodes: true
            }
        };

        const network = new vis.Network(container, data, options);

        // ==========================================
        // CUSTOM MULTI-LAYER DRAWING
        // ==========================================
        
        function snapAngleToStep(angle, stepDegrees) {
            const stepRad = (stepDegrees * Math.PI) / 180;
            return Math.round(angle / stepRad) * stepRad;
        }

        network.on("beforeDrawing", function(ctx) {
            // Named to avoid shadowing the `nodes`/`edges` DataSets above.
            const bodyEdges = network.body.edges;
            const bodyNodes = network.body.nodes;

            // We iterate through each configured layer
            LINE_CONFIG.forEach(layer => {
                ctx.save();
                ctx.strokeStyle = layer.color;
                ctx.lineWidth = layer.width;
                ctx.lineCap = 'round';

                for (let edgeId in bodyEdges) {
                    const edge = bodyEdges[edgeId];
                    const startNode = bodyNodes[edge.fromId];
                    const endNode = bodyNodes[edge.toId];
                    
                    if (startNode && endNode) {
                        const x1 = startNode.x;
                        const y1 = startNode.y;
                        const x2 = endNode.x;
                        const y2 = endNode.y;

                        // Calculate raw angle
                        let angle = Math.atan2(y2 - y1, x2 - x1);
                        
                        // Snap to the configured angle step for this layer
                        const snappedAngle = snapAngleToStep(angle, layer.angle);
                        
                        const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                        const curveLen = Math.min(dist * 0.4, 150);

                        // Calculate Control Points based on SNAPPED angle
                        const cp1x = x1 + Math.cos(snappedAngle) * curveLen;
                        const cp1y = y1 + Math.sin(snappedAngle) * curveLen;

                        const arrivalAngle = snappedAngle + Math.PI;
                        const cp2x = x2 + Math.cos(arrivalAngle) * curveLen;
                        const cp2y = y2 + Math.sin(arrivalAngle) * curveLen;

                        // Draw Bezier Curve
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
                        ctx.stroke();
                    }
                }
                ctx.restore();
            });
        });

        // Modal Logic
        const modal = document.getElementById('node-modal');
        const mTitle = document.getElementById('m-title');
        const mTimestamp = document.getElementById('m-timestamp');
        const mImage = document.getElementById('m-image');
        const mText = document.getElementById('m-text');

        network.on("click", function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const nodeData = nodesData.find(n => n.id === nodeId);
                if (nodeData) openModal(nodeData);
            }
        });

        window.openModal = function(node) {
            mTitle.innerText = node.label;

            if (node.timestamp) {
                // Timestamps are stored in SECONDS, not ms - hence the *1000 below.
                const utcStr = new Date(node.timestamp * 1000).toUTCString();
                mTimestamp.style.display = 'block';
                mTimestamp.innerText = `TIMESTAMP: ${node.timestamp}s | ${utcStr}`;
            } else {
                mTimestamp.style.display = 'none';
            }

            mText.innerText = node.text || "";

            if (node.image) {
                mImage.src = node.image;
                mImage.style.display = 'block';
            } else {
                mImage.style.display = 'none';
            }
            modal.style.display = 'flex';

            // Keep the address bar pointing at whatever is open, so the URL is
            // always copy-pasteable as a link to this node.
            setHash(node);
        };

        window.closeModal = function() {
            modal.style.display = 'none';
            clearHash();
        };

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
        });

        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });

        modal.querySelector('.modal-content').addEventListener('click', function(e) {
            e.stopPropagation();
        });

        // ==========================================
        // DEEP LINKING
        // ==========================================
        // Link to any node as knowledge.html#Node Name - the same
        // "#Section Name" convention story.html already uses in its sidenav.
        // Matching is deliberately forgiving: case, spaces, hyphens and
        // punctuation are all ignored, so every one of these reaches node 3:
        //
        //   #Dominique DuFresne: Pirate Queen of Mars
        //   #dominique-dufresne-pirate-queen-of-mars
        //   #DominiqueDufresnePirateQueenOfMars
        //   #3                                   (bare node id)

        function normalizeString(str) {
            return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
        }

        // location.hash percent-encodes spaces, so "#Node Name" arrives here as
        // "#Node%20Name". Without decoding first, the %20 collapses to a stray
        // "20" in the slug and nothing ever matches.
        function readHash() {
            const raw = window.location.hash.slice(1);
            if (!raw) return '';
            try {
                return decodeURIComponent(raw);
            } catch (err) {
                return raw; // malformed escape sequence, use it as typed
            }
        }

        function findNodeByHash(query) {
            const slug = normalizeString(query);
            if (!slug) return null;

            // 1. Exact label match.
            const exact = nodesData.find(n => normalizeString(n.label) === slug);
            if (exact) return exact;

            // 2. Bare node id, e.g. "#12".
            if (/^\d+$/.test(query.trim())) {
                const byId = nodesData.find(n => n.id === parseInt(query, 10));
                if (byId) return byId;
            }

            // 3. Partial match, shortest label first. Sorting matters: it stops
            //    "#Chrysla" being swallowed by "Colonization of Mars (According
            //    to Chrysla)" just because that node comes first in the file.
            const byLength = (a, b) => a.label.length - b.label.length;
            const starts = nodesData.filter(n => normalizeString(n.label).startsWith(slug)).sort(byLength);
            if (starts.length) return starts[0];

            const contains = nodesData.filter(n => normalizeString(n.label).includes(slug)).sort(byLength);
            return contains[0] || null;
        }

        // replaceState (rather than assigning location.hash) keeps this out of
        // the back-button history AND does not fire a hashchange event, so
        // these two helpers can never loop with the listener below.
        function setHash(node) {
            if (normalizeString(readHash()) === normalizeString(node.label)) return;
            history.replaceState(null, '', '#' + node.label);
        }

        function clearHash() {
            if (!window.location.hash) return;
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        function revealNode(node) {
            openModal(node);
            network.selectNodes([node.id]);
            network.focus(node.id, {
                scale: 1.2,
                animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
            });
        }

        // Fires when someone edits the hash, or follows a second #link from
        // inside an already-open page.
        window.addEventListener('hashchange', function() {
            const query = readHash();
            if (!query) {
                closeModal();
                return;
            }
            const node = findNodeByHash(query);
            if (node) {
                revealNode(node);
            } else {
                console.warn(`No node matches "${query}".`);
            }
        });

        // Wait for the physics layout to settle before focusing, otherwise the
        // camera chases a node that is still drifting. The old code guessed with
        // a pair of overlapping 500ms/1500ms timers; this uses the real event
        // and keeps one timer purely as a fallback.
        let initialHashHandled = false;
        function handleInitialHash() {
            if (initialHashHandled) return;
            initialHashHandled = true;

            const query = readHash();
            if (!query) return;

            const node = findNodeByHash(query);
            if (node) {
                revealNode(node);
            } else {
                console.warn(`No node matches "${query}".`);
            }
        }

        network.once('stabilizationIterationsDone', handleInitialHash);
        setTimeout(handleInitialHash, 2500);
    }
});