document.addEventListener('DOMContentLoaded', () => {
    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const itemsCollection = db.collection('shoppingItems');

    // Referencias del DOM
    const itemInput = document.getElementById('itemInput');
    const quantityInput = document.getElementById('quantityInput');
    const unitPriceInput = document.getElementById('unitPriceInput');
    const locationInput = document.getElementById('locationInput');
    const observationsInput = document.getElementById('observationsInput');
    const addItemButton = document.getElementById('addItemButton');
    const resetListButton = document.getElementById('resetListButton');
    const shoppingListContainer = document.getElementById('shoppingListContainer');
    const locationSuggestions = document.getElementById('location-suggestions');
    const categorySuggestions = document.getElementById('category-suggestions');
    const searchInput = document.getElementById('searchInput');
    const categoryInput = document.getElementById('categoryInput');
    const hideCompletedSwitch = document.getElementById('hideCompletedSwitch');
    const copyListButton = document.getElementById('copyListButton');

    // Variables de estado
    let editingItemId = null;
    let allItems = []; // Caché local para todos los items

    // --- MAPA DE ICONOS ---
    const categoryIcons = {
        'fruta': '🍎', 'verdura': '🥬', 'carne': '🥩', 'pollo': '🍗',
        'pescado': '🐟', 'pan': '🍞', 'leche': '🥛', 'queso': '🧀',
        'huevo': '🥚', 'bebida': '🥤', 'agua': '💧', 'vino': '🍷',
        'cerveza': '🍺', 'limpieza': '🧹', 'papel': '🧻', 'jabon': '🧼',
        'arroz': '🍚', 'fideo': '🍝', 'pasta': '🍝', 'harina': '🥡',
        'azucar': '🍬', 'sal': '🧂', 'aceite': '🌻', 'galleta': '🍪',
        'cafe': '☕', 'te': '🍵', 'yerba': '🌿', 'yogur': '🥣'
    };

    const getCategoryIcon = (name, category) => {
        const searchText = (name + ' ' + (category || '')).toLowerCase();
        for (const [key, icon] of Object.entries(categoryIcons)) {
            if (searchText.includes(key)) return icon;
        }
        return '🛒'; // Icono por defecto
    };

    // --- FUNCIÓN UTILITARIA ---
    const formatCurrency = (number) => {
        // Formatea el número como moneda argentina (ARS), que usa '.' para miles y ',' para decimales.
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(number);
    };

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

    // --- FUNCIONES AUXILIARES DE UI ---
    const updateLocationSuggestions = (items) => {
        if (!locationSuggestions) return;
        const locations = new Set(items.map(doc => doc.data().location).filter(l => l));
        locationSuggestions.innerHTML = '';
        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            locationSuggestions.appendChild(option);
        });
    };

    // --- RENDERIZADO DE LA LISTA ---
    const renderItems = () => {
        const searchQuery = searchInput.value.toLowerCase();
        const hideCompleted = hideCompletedSwitch.checked;
        let filteredDocs = allItems;

        if (searchQuery) {
            filteredDocs = allItems.filter(doc => {
                const item = doc.data();
                const name = item.name || '';
                const location = item.location || '';
                const observations = item.observations || '';
                const category = item.category || '';

                return (
                    name.toLowerCase().includes(searchQuery) ||
                    location.toLowerCase().includes(searchQuery) ||
                    observations.toLowerCase().includes(searchQuery) ||
                    category.toLowerCase().includes(searchQuery)
                );
            });
        }
        
        // Aplicar filtro de ocultar completados
        if (hideCompleted) {
            filteredDocs = filteredDocs.filter(doc => !doc.data().completed);
        }

        updateChart(filteredDocs);
        updateLocationSuggestions(allItems);
        shoppingListContainer.innerHTML = '';
        const grandTotalContainer = document.getElementById('grandTotalContainer');
        grandTotalContainer.innerHTML = '';

        if (allItems.length === 0) {
            shoppingListContainer.innerHTML = '<div class="empty-list-message">Tu lista de compras está vacía. ¡Añade tu primer producto!</div>';
            updateChart([]);
            return;
        }
        // Mensaje si filtramos todo
        if (filteredDocs.length === 0 && hideCompleted) {
             shoppingListContainer.innerHTML = '<div class="empty-list-message">Todo comprado. ¡Buen trabajo! 🎉</div>';
             return;
        }

        let grandTotal = 0;
        const groupedItems = {};

        filteredDocs.forEach(doc => {
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

            const subtotal = items.reduce((acc, item) => {
                const quantity = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unitPrice) || 0;
                if (!item.completed) {
                    return acc + (quantity * price);
                }
                return acc;
            }, 0);
            grandTotal += subtotal;

            const allCompleted = items.every(item => item.completed);
            const groupContainer = createGroupContainer(location, items, allCompleted, subtotal);
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

        grandTotalContainer.innerHTML = `<h3>Total General: ${formatCurrency(grandTotal)}</h3>`;
    };

    const createGroupContainer = (location, items, isCompleted, subtotal) => {
        const groupContainer = document.createElement('div');
        groupContainer.className = `location-group ${isCompleted ? 'group-completed' : ''}`;

        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = `<h2>${location}</h2><span class="group-subtotal">${formatCurrency(subtotal)}</span><span class="toggle-icon">▼</span>`;
        header.addEventListener('click', () => groupContainer.classList.toggle('collapsed'));

        const list = document.createElement('ul');
        list.className = 'shopping-list';

        const listHeader = document.createElement('li');
        listHeader.className = 'shopping-item list-header';
        listHeader.innerHTML = `
            <span class="item-main">Producto</span>
            <span class="item-quantity">Cantidad</span>
            <span class="item-price">Precio Unit.</span>
            <span class="item-total">Total</span>
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

        const quantity = parseFloat(item.quantity) || 1;
        const unitPrice = parseFloat(item.unitPrice) || 0;
        const total = quantity * unitPrice;
        const icon = getCategoryIcon(item.name, item.category);

        li.innerHTML = `
            <div class="item-main">
                <span class="drag-handle">&#x2261;</span>
                <input type="checkbox" ${item.completed ? 'checked' : ''}>
                <span class="item-text">${icon} ${item.name}</span>
            </div>
            <span class="item-quantity">${item.quantity || ''}</span>
            <span class="item-price">${formatCurrency(unitPrice)}</span>
            <span class="item-total">${formatCurrency(total)}</span>
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
            unitPriceInput.value = item.unitPrice || '';
            locationInput.value = item.location || '';
            observationsInput.value = item.observations || '';
            if(categoryInput) categoryInput.value = item.category || '';
            addItemButton.textContent = 'Actualizar';
            itemInput.focus();
        });

        li.querySelector('.delete-button').addEventListener('click', () => {
            Swal.fire({
                title: '¿Estás seguro?',
                text: `¿Realmente quieres eliminar "${item.name}"?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: 'var(--secondary-color)',
                cancelButtonColor: 'var(--primary-color)',
                confirmButtonText: 'Sí, eliminar!',
                cancelButtonText: 'Cancelar',
                background: 'var(--surface-color)',
                color: 'var(--text-color)'
            }).then((result) => {
                if (result.isConfirmed) {
                    deleteItemFromFirestore(item.id);
                    Swal.fire({
                        title: '¡Eliminado!',
                        text: `"${item.name}" ha sido eliminado.`,
                        icon: 'success',
                        background: 'var(--surface-color)',
                        color: 'var(--text-color)'
                    });
                }
            });
        });

        return li;
    };

    // --- MANEJADORES DE EVENTOS ---
    
    // Switch de ocultar completados
    hideCompletedSwitch.addEventListener('change', renderItems);

    // Botón de Copiar a WhatsApp
    copyListButton.addEventListener('click', () => {
        const activeItems = allItems.map(doc => doc.data()).filter(item => !item.completed);
        
        if (activeItems.length === 0) {
             Swal.fire({
                title: 'Lista vacía',
                text: 'No hay productos pendientes para copiar.',
                icon: 'info',
                background: 'var(--surface-color)',
                color: 'var(--text-color)'
            });
            return;
        }

        let clipboardText = "🛒 *Lista de Compras* 🛒\n\n";
        
        // Agrupar por ubicación para el texto
        const grouped = {};
        activeItems.forEach(item => {
            const loc = item.location?.trim() || 'Varios';
            if (!grouped[loc]) grouped[loc] = [];
            grouped[loc].push(item);
        });

        for (const [location, items] of Object.entries(grouped)) {
            clipboardText += `*📍 ${location}*\n`;
            items.forEach(item => {
                const qty = item.quantity > 1 ? `(${item.quantity}) ` : '';
                clipboardText += `- ${qty}${item.name}`;
                if (item.observations) clipboardText += ` _[${item.observations}]_`;
                clipboardText += "\n";
            });
            clipboardText += "\n";
        }

        clipboardText += `Generado el ${new Date().toLocaleDateString()}`;

        navigator.clipboard.writeText(clipboardText).then(() => {
            Swal.fire({
                title: '¡Copiado!',
                text: 'La lista se ha copiado al portapapeles lista para WhatsApp.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false,
                background: 'var(--surface-color)',
                color: 'var(--text-color)'
            });
        }).catch(err => {
            console.error('Error al copiar: ', err);
            Swal.fire('Error', 'No se pudo copiar al portapapeles', 'error');
        });
    });

    addItemButton.addEventListener('click', async () => {
        const itemName = itemInput.value.trim();
        if (!itemName) return;

        const itemData = {
            name: itemName,
            quantity: quantityInput.value.trim() || '1',
            unitPrice: parseFloat(unitPriceInput.value) || 0,
            location: locationInput.value.trim(),
            observations: observationsInput.value.trim(),
            category: categoryInput ? categoryInput.value.trim() : ''
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

        [itemInput, unitPriceInput, locationInput, observationsInput, categoryInput].forEach(i => { if(i) i.value = ''; });
        quantityInput.value = '1';
    });

    const getNextOrder = async (location) => {
        const locationStr = location?.trim() || '';
        const snapshot = await itemsCollection.where('location', '==', locationStr).get();
        if (snapshot.empty) {
            return 0;
        }
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
        if (snapshot.empty) {
            Swal.fire({
                title: 'Nada que reiniciar',
                text: 'No hay artículos completados para reiniciar.',
                icon: 'info',
                confirmButtonText: 'OK',
                background: 'var(--surface-color)',
                color: 'var(--text-color)'
            });
            return;
        }

        Swal.fire({
            title: '¿Estás seguro?',
            text: "Esto marcará todos los artículos completados como no completados.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--secondary-color)',
            cancelButtonColor: 'var(--primary-color)',
            confirmButtonText: 'Sí, reiniciar!',
            cancelButtonText: 'Cancelar',
            background: 'var(--surface-color)',
            color: 'var(--text-color)'
        }).then(async (result) => {
            if (result.isConfirmed) {
                const batch = db.batch();
                snapshot.docs.forEach(doc => {
                    batch.update(itemsCollection.doc(doc.id), { completed: false });
                });
                try {
                    await batch.commit();
                    Swal.fire({
                        title: '¡Reiniciado!',
                        text: 'La lista ha sido reiniciada.',
                        icon: 'success',
                        background: 'var(--surface-color)',
                        color: 'var(--text-color)'
                    });
                } catch (error) {
                    console.error("Error al reiniciar items: ", error);
                    Swal.fire({
                        title: 'Error',
                        text: 'No se pudo reiniciar la lista.',
                        icon: 'error',
                        background: 'var(--surface-color)',
                        color: 'var(--text-color)'
                    });
                }
            }
        });
    });

    [itemInput, quantityInput, unitPriceInput, locationInput, observationsInput, categoryInput].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addItemButton.click();
        });
    });

    // Listener de Firestore en tiempo real
    itemsCollection.orderBy('completed').orderBy('order').onSnapshot(snapshot => {
        allItems = snapshot.docs;
        renderItems();
    });

    // Listener para el buscador en tiempo real
    searchInput.addEventListener('input', renderItems);

// --- ECHARTS CHART LOGIC ---
let myChart = null;

const initializeChart = () => {
    const chartDom = document.getElementById('chartContainer');
    if (chartDom) {
        myChart = echarts.init(chartDom, 'dark');
    }
};

document.addEventListener('DOMContentLoaded', initializeChart);

const updateChart = (docs) => {
    if (!myChart) {
        initializeChart();
    }
    if (!myChart) return;

    const costByLocation = {};
    docs.forEach(doc => {
        const item = doc.data();
        const location = item.location?.trim() || 'Sin Ubicación';
        if (costByLocation[location] === undefined) {
            costByLocation[location] = 0;
        }
        if (!item.completed) {
            const quantity = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.unitPrice) || 0;
            costByLocation[location] += quantity * price;
        }
    });

    const sortedLocations = Object.entries(costByLocation)
        .filter(([, cost]) => cost > 0)
        .sort((a, b) => a[1] - b[1]);

    const locationNames = sortedLocations.map(entry => entry[0]);
    const costValues = sortedLocations.map(entry => entry[1]);

    const option = {
        title: {
            text: 'Coste por Ubicación',
            left: 'center',
            textStyle: { color: '#dcdcdc' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: (params) => {
                const data = params[0];
                if (typeof data.value !== 'number' || isNaN(data.value)) {
                    return `${data.name}<br/><b>Datos no disponibles</b>`;
                }
                return `${data.name}<br/><b>${formatCurrency(data.value)}</b>`;
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'value',
            boundaryGap: [0, 0.01],
            axisLabel: { color: '#dcdcdc' }
        },
        yAxis: {
            type: 'category',
            data: locationNames,
            axisLabel: { color: '#dcdcdc' }
        },
        series: [
            {
                name: 'Coste',
                type: 'bar',
                data: costValues,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                        { offset: 0, color: '#0f3460' },
                        { offset: 1, color: '#e94560' }
                    ])
                },
                label: {
                    show: true,
                    position: 'right',
                    formatter: (params) => formatCurrency(params.value),
                    color: '#dcdcdc'
                }
            }
        ],
        backgroundColor: 'transparent'
    };

    myChart.setOption(option, true);
};
});
