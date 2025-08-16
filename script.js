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
                <button class="edit-button">Editar</button>
                <button class="delete-button">Eliminar</button>
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