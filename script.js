document.addEventListener('DOMContentLoaded', () => {
    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const itemsCollection = db.collection('shoppingItems');

    // Referencias del DOM
    const itemInput = document.getElementById('itemInput');
    const quantityInput = document.getElementById('quantityInput');
    const locationInput = document.getElementById('locationInput');
    const observationsInput = document.getElementById('observationsInput');
    const addItemButton = document.getElementById('addItemButton');
    const resetListButton = document.getElementById('resetListButton');
    const undoButton = document.getElementById('undoButton');
    const shoppingListContainer = document.getElementById('shoppingListContainer');
    const locationSuggestions = document.getElementById('location-suggestions');

    // Variables de estado
    let editingItemId = null;
    let lastResetItemsIds = [];
    let undoTimeout = null;

    // --- FUNCIONES DE FIRESTORE ---
    const addItemToFirestore = async (item) => {
        try { await itemsCollection.add(item); } catch (error) {
            console.error("Error al añadir item: ", error);
        }
    };

    const updateItemInFirestore = async (id, updates) => {
        try { await itemsCollection.doc(id).update(updates); } catch (error) {
            console.error("Error al actualizar item: ", error);
        }
    };

    const deleteItemFromFirestore = async (id) => {
        try { await itemsCollection.doc(id).delete(); } catch (error) {
            console.error("Error al eliminar item: ", error);
        }
    };

    // --- RENDERIZADO DE LA LISTA ---
    const renderItems = (docs) => {
        updateChart(docs);
        updateLocationSuggestions(docs);
        shoppingListContainer.innerHTML = '';
        const groupedItems = {};

        docs.forEach(doc => {
            const item = { id: doc.id, ...doc.data() };
            const location = item.location?.trim() || 'Varios';
            if (!groupedItems[location]) groupedItems[location] = [];
            groupedItems[location].push(item);
        });

        const activeGroups = [];
        const completedGroups = [];

        for (const location in groupedItems) {
            const items = groupedItems[location];
            const allCompleted = items.every(item => item.completed);
            if (allCompleted) {
                completedGroups.push({ location, items });
            } else {
                activeGroups.push({ location, items });
            }
        }

        const sortFn = (a, b) => {
            if (a.location === 'Varios') return 1;
            if (b.location === 'Varios') return -1;
            return a.location.localeCompare(b.location);
        };

        activeGroups.sort(sortFn);
        completedGroups.sort(sortFn);

        const sortedGroups = [...activeGroups, ...completedGroups];

        sortedGroups.forEach(({ location, items }) => {
            if (items.length === 0) return;
            const allCompleted = items.every(item => item.completed);
            const groupContainer = createGroupContainer(location, items, allCompleted);
            shoppingListContainer.appendChild(groupContainer);

            const listElement = groupContainer.querySelector('.shopping-list');
            new Sortable(listElement, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                filter: '.list-header',
                onEnd: async (evt) => {
                    const itemElements = Array.from(evt.target.children).filter(el => !el.classList.contains('list-header'));
                    const batch = db.batch();
                    itemElements.forEach((itemEl, index) => {
                        batch.update(itemsCollection.doc(itemEl.dataset.id), { order: index });
                    });
                    try { await batch.commit(); } catch (error) { console.error("Error al reordenar: ", error); }
                }
            });
        });
    };

    const createGroupContainer = (location, items, isCompleted) => {
        const groupContainer = document.createElement('div');
        groupContainer.className = `location-group ${isCompleted ? 'group-completed' : ''}`;

        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = `<h2>${location}</h2><span class="toggle-icon">▼</span>`;
        header.addEventListener('click', () => groupContainer.classList.toggle('collapsed'));

        const list = document.createElement('ul');
        list.className = 'shopping-list';

        const listHeader = document.createElement('li');
        listHeader.className = 'shopping-item list-header';
        listHeader.innerHTML = `
            <span class="item-main">Producto</span>
            <span class="item-quantity">Cantidad</span>
            <span class="item-observations">Observaciones</span>
            <span class="item-actions">Acciones</span>
        `;
        list.appendChild(listHeader);

        items.forEach(item => list.appendChild(createListItem(item)));

        groupContainer.appendChild(header);
        groupContainer.appendChild(list);
        return groupContainer;
    };

    const createListItem = (item) => {
        const li = document.createElement('li');
        li.className = `shopping-item ${item.completed ? 'completed' : ''}`;
        li.dataset.id = item.id;

        li.innerHTML = `
            <div class="item-main">
                <span class="drag-handle">&#x2261;</span>
                <input type="checkbox" ${item.completed ? 'checked' : ''}>
                <span class="item-text">${item.name}</span>
            </div>
            <span class="item-quantity">${item.quantity || ''}</span>
            <span class="item-observations">${item.observations || ''}</span>
            <div class="item-actions">
                <button class="edit-button" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="delete-button" title="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;

        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            updateItemInFirestore(item.id, { completed: e.target.checked });
        });

        li.querySelector('.edit-button').addEventListener('click', () => {
            editingItemId = item.id;
            itemInput.value = item.name;
            quantityInput.value = item.quantity || '1';
            locationInput.value = item.location || '';
            observationsInput.value = item.observations || '';
            addItemButton.textContent = 'Actualizar';
            itemInput.focus();
        });

        li.querySelector('.delete-button').addEventListener('click', () => {
            deleteItemFromFirestore(item.id);
        });

        return li;
    };

    const updateLocationSuggestions = (docs) => {
        const locations = new Set();
        docs.forEach(doc => {
            const location = doc.data().location?.trim();
            if (location) locations.add(location);
        });

        locationSuggestions.innerHTML = '';
        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            locationSuggestions.appendChild(option);
        });
    };

    // --- MANEJADORES DE EVENTOS ---
    addItemButton.addEventListener('click', async () => {
        const itemName = itemInput.value.trim();
        if (!itemName) return;

        const itemData = {
            name: itemName,
            quantity: quantityInput.value.trim() || '1',
            location: locationInput.value.trim(),
            observations: observationsInput.value.trim(),
        };

        if (editingItemId) {
            await updateItemInFirestore(editingItemId, itemData);
            editingItemId = null;
            addItemButton.textContent = 'Añadir';
        } else {
            itemData.completed = false;
            itemData.order = await getNextOrder(itemData.location);
            itemData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
            await addItemToFirestore(itemData);
        }

        [itemInput, locationInput, observationsInput].forEach(i => i.value = '');
        quantityInput.value = '1';
    });

    const getNextOrder = async (location) => {
        const locationStr = location?.trim() || '';
        const snapshot = await itemsCollection.where('location', '==', locationStr).get();
        if (snapshot.empty) {
            return 0;
        }
        // Find the highest order number from the returned documents
        let maxOrder = -1;
        snapshot.docs.forEach(doc => {
            const order = doc.data().order;
            if (order > maxOrder) {
                maxOrder = order;
            }
        });
        return maxOrder + 1;
    };

    resetListButton.addEventListener('click', async () => {
        const snapshot = await itemsCollection.where('completed', '==', true).get();
        if (snapshot.empty) return;

        lastResetItemsIds = snapshot.docs.map(doc => doc.id);

        resetListButton.classList.add('hidden');
        undoButton.classList.remove('hidden');

        undoTimeout = setTimeout(async () => {
            const batch = db.batch();
            lastResetItemsIds.forEach(id => {
                batch.update(itemsCollection.doc(id), { completed: false });
            });
            try { await batch.commit(); } catch (error) { console.error("Error al reiniciar items: ", error); }
            lastResetItemsIds = [];
            undoButton.classList.add('hidden');
            resetListButton.classList.remove('hidden');
        }, 20000);
    });

    undoButton.addEventListener('click', () => {
        clearTimeout(undoTimeout);
        lastResetItemsIds = [];
        undoButton.classList.add('hidden');
        resetListButton.classList.remove('hidden');
    });

    [itemInput, quantityInput, locationInput, observationsInput].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addItemButton.click();
        });
    });

    // Listener de Firestore en tiempo real
    itemsCollection.orderBy('completed').orderBy('order').onSnapshot(snapshot => {
        renderItems(snapshot.docs);
    }, error => {
        console.error("Error al obtener documentos: ", error);
    });
});

// --- ECHARTS CHART LOGIC ---
let myChart = null; // Declare myChart globally or in a scope accessible by updateChart

const initializeChart = () => {
    const chartDom = document.getElementById('chartContainer');
    if (chartDom) {
        myChart = echarts.init(chartDom, 'dark'); // Initialize with 'dark' theme
    }
};

// Call initializeChart when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeChart);


const updateChart = (docs) => {
    if (!myChart) {
        initializeChart(); // Ensure chart is initialized if updateChart is called before DOMContentLoaded
    }
    if (!myChart) return; // If initialization still fails, exit

    const groupedItems = {};
    docs.forEach(doc => {
        const item = doc.data();
        const location = item.location?.trim() || 'Sin Ubicación';
        if (!groupedItems[location]) {
            groupedItems[location] = 0;
        }
        groupedItems[location]++;
    });

    const chartData = Object.keys(groupedItems).map(location => ({
        value: groupedItems[location],
        name: location
    }));

    const option = {
        title: {
            text: 'Compras por Ubicación',
            left: 'center',
            textStyle: {
                color: '#dcdcdc' // Text color for dark theme
            }
        },
        tooltip: {
            trigger: 'item',
            formatter: '{a} <br/>{b} : {c} ({d}%)'
        },
        legend: {
            orient: 'vertical',
            left: 'left',
            textStyle: {
                color: '#dcdcdc' // Text color for dark theme
            }
        },
        series: [
            {
                name: 'Ubicaciones',
                type: 'pie',
                radius: '50%',
                data: chartData,
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                },
                label: {
                    color: '#dcdcdc' // Label color for dark theme
                },
                labelLine: {
                    lineStyle: {
                        color: '#dcdcdc' // Label line color for dark theme
                    }
                }
            }
        ],
        backgroundColor: 'transparent' // Use CSS background
    };

    myChart.setOption(option);
};
