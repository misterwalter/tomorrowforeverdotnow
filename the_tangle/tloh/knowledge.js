document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('network');
    const loadingScreen = document.getElementById('loading-screen');

    fetch('knowledge.json?t=' + new Date().getTime())
        .then(response => {
            if (!response.ok) throw new Error('Failed to load data');
            return response.json();
        })
        .then(rawData => {
            // Handle both old array format and new object format
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
        // Process Nodes
        const nodes = new vis.DataSet(nodesData.map(node => {
            let nodeConfig = {
                id: node.id,
                label: node.label,
                group: node.group,
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

            if (node.image && node.image.trim() !== "") {
                nodeConfig.shape = 'circularImage';
                nodeConfig.image = node.image;
                nodeConfig.size = 40;
            } else {
                nodeConfig.shape = 'dot';
                nodeConfig.size = 20;
            }
            return nodeConfig;
        }));

        // Process Links from JSON (bidirectional display)
        const edges = new vis.DataSet(linksData.map(link => ({
            from: link.from,
            to: link.to,
            color: { color: '#ff9900', highlight: '#ffffff', hover: '#ffffff' },
            width: 0,
            smooth: { type: 'none' }
        })));

        const data = { nodes, edges };

        const options = {
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -3000,
                    centralGravity: 0.5,
                    springLength: 150,
                    springConstant: 0.04,
                    damping: 0.45,
                    avoidOverlap: 0.5
                },
                stabilization: { iterations: 150 }
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

        // Custom Manhattan Routing Drawer
        network.on("beforeDrawing", function(ctx) {
            const edges = network.body.edges;
            const nodes = network.body.nodes;
            
            ctx.save();
            ctx.strokeStyle = '#ff9900';
            ctx.fillStyle = '#ff9900';
            ctx.lineWidth = 2;
            ctx.lineCap = 'square';

            for (let edgeId in edges) {
                const edge = edges[edgeId];
                const startNode = nodes[edge.fromId];
                const endNode = nodes[edge.toId];
                
                if (startNode && endNode) {
                    const x1 = startNode.x, y1 = startNode.y;
                    const x2 = endNode.x, y2 = endNode.y;
                    const bendX = x1, bendY = y2;

                    // Draw L-shaped path
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(bendX, bendY);
                    ctx.lineTo(x2, bendY);
                    ctx.stroke();

                    // Draw joint circle
                    ctx.beginPath();
                    ctx.arc(bendX, bendY, 3, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw crosshair
                    ctx.beginPath();
                    ctx.moveTo(bendX - 4, bendY);
                    ctx.lineTo(bendX + 4, bendY);
                    ctx.moveTo(bendX, bendY - 4);
                    ctx.lineTo(bendX, bendY + 4);
                    ctx.stroke();
                }
            }
            ctx.restore();
        });

        // Modal Logic
        const modal = document.getElementById('node-modal');
        const mTitle = document.getElementById('m-title');
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
    }
});