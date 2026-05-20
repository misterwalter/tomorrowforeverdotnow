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
        { angle: 121, color: '#44aa21', width: 1.0 }, // Layer 3: 33 deg, Blueish
        // Add more layers here as needed
    ];

    fetch('knowledge.json?t=' + Date.now())
        .then(response => {
            if (!response.ok) throw new Error('Failed to load data');
            return response.json();
        })
        .then(rawData => {
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
        const radius = Math.min(centerX, centerY) * 0.8;
        
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
                    face: 'VT323',
                    size: 20,
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
            const edges = network.body.edges;
            const nodes = network.body.nodes;
            
            // We iterate through each configured layer
            LINE_CONFIG.forEach(layer => {
                ctx.save();
                ctx.strokeStyle = layer.color;
                ctx.lineWidth = layer.width;
                ctx.lineCap = 'round';

                for (let edgeId in edges) {
                    const edge = edges[edgeId];
                    const startNode = nodes[edge.fromId];
                    const endNode = nodes[edge.toId];
                    
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

        window.openModal = function(data) {
            mTitle.innerText = data.label;
            
            if (data.timestamp) {
                const d = new Date(data.timestamp);
                const utcStr = d.toUTCString();
                mTimestamp.style.display = 'block';
                mTimestamp.innerText = `TIMESTAMP: ${data.timestamp} ms | ${utcStr}`;
            } else {
                mTimestamp.style.display = 'none';
            }
            
            mText.innerText = data.text || "";
            
            if (data.image) {
                mImage.src = data.image;
                mImage.style.display = 'block';
            } else {
                mImage.style.display = 'none';
            }
            modal.style.display = 'flex';
        };

        window.closeModal = function() {
            modal.style.display = 'none';
        };

        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });

        modal.querySelector('.modal-content').addEventListener('click', function(e) {
            e.stopPropagation();
        });

        // ==========================================
        // AUTO-OPEN NODE FROM URL HASH (BY NAME)
        // ==========================================
        
        function normalizeString(str) {
            return str.toLowerCase().replace(/[^a-z0-9]/g, '');
        }

        function handleUrlHash() {
            const hash = window.location.hash;
            if (!hash) return;

            const rawQuery = hash.substring(1);
            if (!rawQuery) return;

            const targetSlug = normalizeString(rawQuery);
            let targetNode = null;

            targetNode = nodesData.find(n => normalizeString(n.label) === targetSlug);
            if (!targetNode) {
                targetNode = nodesData.find(n => normalizeString(n.label).includes(targetSlug));
            }

            if (targetNode) {
                setTimeout(() => {
                    openModal(targetNode);
                    network.focus(targetNode.id, {
                        scale: 1.2,
                        animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
                    });
                    window.history.replaceState(null, document.title, window.location.pathname);
                }, 1500);
            } else {
                console.warn(`Node with name "${rawQuery}" not found.`);
            }
        }

        setTimeout(handleUrlHash, 500);
        setTimeout(handleUrlHash, 1500);
    }
});