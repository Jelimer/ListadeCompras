window.addEventListener('error', function(event) {
    alert('Error global detectado: ' + event.message);
});

window.addEventListener('unhandledrejection', function(event) {
    alert('Error de promesa no manejado: ' + event.reason);
});

document.addEventListener('DOMContentLoaded', () => {
    // Referencias del DOM
    const loader = document.getElementById('loader');
    const container = document.querySelector('.container');
    const shoppingListContainer = document.getElementById('shoppingListContainer');
    const grandTotalContainer = document.getElementById('grandTotalContainer');
    const resetListButton = document.getElementById('resetListButton');

    // --- Controles de Filtros ---
    const searchInput = document.getElementById('searchInput');
    const locationFilter = document.getElementById('locationFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const clearFiltersButton = document.getElementById('clearFiltersButton');

    // --- Formulario Principal ---
    const formTitle = document.getElementById('formTitle');
    const itemInput = document.getElementById('itemInput');
    const quantityInput = document.getElementById('quantityInput');
    const unitPriceInput = document.getElementById('unitPriceInput');
    const locationInput = document.getElementById('locationInput');
    const categoryInput = document.getElementById('categoryInput');
    const observationsInput = document.getElementById('observationsInput');
    const saveItemButton = document.getElementById('saveItemButton');
    const cancelEditButton = document.getElementById('cancelEditButton');
    const locationSuggestions = document.getElementById('location-suggestions');
    const categorySuggestions = document.getElementById('category-suggestions');

    // --- Variables de estado ---
    let editingItemId = null;
    let allItems = [];
    let db, itemsCollection;
    let initialLoad = true;
    let myChart;

    // --- Funciones Auxiliares ---
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    const showLoader = (show) => {
        loader.style.display = show ? 'flex' : 'none';
        container.classList.toggle('content-hidden', show);
    };

    const resetForm = () => {
        editingItemId = null;
        formTitle.textContent = 'Añadir Producto';
        itemInput.value = '';
        quantityInput.value = '1';
        unitPriceInput.value = '';
        locationInput.value = '';
        categoryInput.value = '';
        observationsInput.value = '';
        saveItemButton.textContent = 'Guardar Producto';
        cancelEditButton.classList.add('hidden');
    };

    // --- Lógica de Firebase ---
    const addItemToFirestore = async (item) => itemsCollection.add(item).catch(e => console.error("Error al añadir item: ", e));
    const updateItemInFirestore = async (id, updates) => itemsCollection.doc(id).update(updates).catch(e => console.error("Error al actualizar item: ", e));
    const deleteItemFromFirestore = async (id) => itemsCollection.doc(id).delete().catch(e => console.error("Error al eliminar item: ", e));

    showLoader(true);

    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        itemsCollection = db.collection('shoppingItems');

        itemsCollection.orderBy('completed').orderBy('order').onSnapshot(snapshot => {
            allItems = snapshot.docs;
            updateFilterOptions();
            renderItems();
            if (initialLoad) {
                showLoader(false);
                initialLoad = false;
            }
        });
    } catch (error) {
        console.error("Error al inicializar Firebase: ", error);
        shoppingListContainer.innerHTML = '<div class="empty-list-message">Error de conexión.</div>';
        showLoader(false);
    }

    // --- Lógica de Gráfico (ECharts) ---
    const initializeChart = () => {
        const chartDom = document.getElementById('chartContainer');
        if (chartDom) {
            myChart = echarts.init(chartDom, 'dark');
            myChart.on('click', (params) => {
                if (params.name) {
                    locationFilter.value = params.name;
                    renderItems();
                }
            });
        }
    };
    initializeChart();

    const updateChart = (docs) => {
        if (!myChart) return;

        const costByLocation = {};
        docs.forEach(doc => {
            const item = doc.data();
            if (!item.completed) {
                const location = item.location?.trim() || 'Sin Ubicación';
                const price = parseFloat(item.unitPrice) || 0;
                const quantity = parseFloat(item.quantity) || 0;
                costByLocation[location] = (costByLocation[location] || 0) + (price * quantity);
            }
        });

        const pieChartData = Object.entries(costByLocation).filter(([, cost]) => cost > 0).map(([name, value]) => ({ name, value }));
        const pendingItemsCount = docs.filter(doc => !doc.data().completed).length;

        myChart.setOption({
            title: { text: 'Coste por Ubicación', subtext: `${pendingItemsCount} artículos pendientes`, left: 'center', textStyle: { color: '#dcdcdc' }, subtextStyle: { color: '#a9a9a9' } },
            tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/><b>${formatCurrency(p.value)}</b> (${p.percent}%)` },
            legend: { orient: 'vertical', left: 'left', textStyle: { color: '#dcdcdc' } },
            series: [{ name: 'Coste', type: 'pie', radius: '50%', data: pieChartData, label: { color: '#dcdcdc' }, labelLine: { lineStyle: { color: '#dcdcdc' } } }],
            backgroundColor: 'transparent'
        });
    };

    // --- Lógica de Filtros y Renderizado ---
    const updateFilterOptions = () => {
        const locations = new Set(allItems.map(doc => doc.data().location?.trim()).filter(Boolean));
        const categories = new Set(allItems.map(doc => doc.data().category?.trim()).filter(Boolean));
        const populateDropdown = (select, options) => {
            const val = select.value;
            select.innerHTML = `<option value="">${select.id === 'locationFilter' ? 'Todas las ubicaciones' : 'Todas las categorías'}</option>`;
            options.forEach(opt => select.add(new Option(opt, opt)));
            select.value = val;
        };
        populateDropdown(locationFilter, locations);
        populateDropdown(categoryFilter, categories);
    };

    const renderItems = () => {
        const filters = { search: searchInput.value.toLowerCase(), location: locationFilter.value, category: categoryFilter.value };
        const filteredDocs = allItems.filter(doc => {
            const item = doc.data();
            const searchStr = [item.name, item.location, item.category, item.observations].join(' ').toLowerCase();
            return (!filters.search || searchStr.includes(filters.search)) &&
                   (!filters.location || item.location === filters.location) &&
                   (!filters.category || item.category === filters.category);
        });

        updateChart(filteredDocs);
        updateDatalists(allItems);
        shoppingListContainer.innerHTML = '';

        if (filteredDocs.length === 0) {
            shoppingListContainer.innerHTML = '<div class="empty-list-message">No hay productos que coincidan.</div>';
            grandTotalContainer.innerHTML = '';
            return;
        }

        let grandTotal = 0;
        const groupedItems = filteredDocs.reduce((acc, doc) => {
            const item = { id: doc.id, ...doc.data() };
            const location = item.location?.trim() || 'Varios';
            (acc[location] = acc[location] || []).push(item);
            return acc;
        }, {});

        Object.keys(groupedItems).sort((a, b) => a === 'Varios' ? 1 : b === 'Varios' ? -1 : a.localeCompare(b)).forEach(location => {
            const items = groupedItems[location];

            let subtotal = 0;
            items.forEach(item => {
                const price = parseFloat(item.unitPrice) || 0;
                const quantity = parseFloat(item.quantity) || 0;
                if (!item.completed) {
                    subtotal += price * quantity;
                }
            });

            grandTotal += subtotal;
            shoppingListContainer.appendChild(createGroupContainer(location, items, items.every(i => i.completed), subtotal));
        });

        grandTotalContainer.innerHTML = `<h3>Total General: ${formatCurrency(grandTotal)}</h3>`;
    };

    const createGroupContainer = (location, items, isCompleted, subtotal) => {
        const groupContainer = document.createElement('div');
        groupContainer.className = `location-group ${isCompleted ? 'group-completed' : ''}`;
        const header = document.createElement('div');
        header.className = 'group-header';

        const title = document.createElement('h2');
        title.textContent = location;

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = `Buscar en ${location}...`;
        searchInput.className = 'group-search-input';
        searchInput.addEventListener('click', e => e.stopPropagation()); // Evitar que el clic colapse el grupo
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const list = groupContainer.querySelector('.shopping-list');
            const items = list.querySelectorAll('.shopping-item:not(.list-header)');
            items.forEach(item => {
                const itemText = item.querySelector('.item-text').textContent.toLowerCase();
                item.classList.toggle('hidden', !itemText.includes(searchTerm));
            });
        });

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';

        const subtotalSpan = document.createElement('span');
        subtotalSpan.className = 'group-subtotal';
        subtotalSpan.innerHTML = formatCurrency(subtotal);

        const addButton = document.createElement('button');
        addButton.className = 'add-item-in-group-button';
        addButton.innerHTML = '+';
        addButton.title = `Añadir item a ${location}`;
        addButton.addEventListener('click', (e) => { e.stopPropagation(); promptForItemInLocation(location); });

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.innerHTML = '▼';

        controls.appendChild(subtotalSpan); 
        controls.appendChild(addButton);
        controls.appendChild(toggleIcon);

        header.appendChild(title);
        header.appendChild(searchInput);
        header.appendChild(controls);

        header.addEventListener('click', () => groupContainer.classList.toggle('collapsed'));

        const list = document.createElement('ul');
        list.className = 'shopping-list';
        const listHeader = document.createElement('li');
        listHeader.className = 'shopping-item list-header';
        listHeader.innerHTML = `<span class="item-main">Producto</span><span class="item-quantity">Cantidad</span><span class="item-price">Precio Unit.</span><span class="item-total">Total</span><span class="item-observations">Observaciones</span><span class="item-actions">Acciones</span>`;
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
        li.innerHTML = `
            <div class="item-main">
                <span class="drag-handle">&#x2261;</span>
                <input type="checkbox" ${item.completed ? 'checked' : ''}>
                <span class="item-text">${item.name}</span>
            </div>
            <span class="item-quantity">${item.quantity || ''}</span>
            <span class="item-price">${formatCurrency(unitPrice)}</span>
            <span class="item-total">${formatCurrency(quantity * unitPrice)}</span>
            <span class="item-observations">${item.observations || ''}</span>
            <div class="item-actions">
                <button class="edit-button" title="Editar">...</button>
                <button class="delete-button" title="Eliminar">...</button>
            </div>`;
        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => updateItemInFirestore(item.id, { completed: e.target.checked }));
        li.querySelector('.edit-button').addEventListener('click', () => handleEditItem(item));
        li.querySelector('.delete-button').addEventListener('click', () => handleDeleteItem(item));
        return li;
    };

    const updateDatalists = (docs) => {
        const locations = new Set(docs.map(doc => doc.data().location?.trim()).filter(Boolean));
        const categories = new Set(docs.map(doc => doc.data().category?.trim()).filter(Boolean));
        const populate = (datalist, options) => {
            datalist.innerHTML = '';
            options.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                datalist.appendChild(option);
            });
        };
        populate(locationSuggestions, locations);
        populate(categorySuggestions, categories);
    };

    // --- Manejadores de Eventos ---
    clearFiltersButton.addEventListener('click', () => {
        searchInput.value = '';
        locationFilter.value = '';
        categoryFilter.value = '';
        renderItems();
    });

    [searchInput, locationFilter, categoryFilter].forEach(el => el.addEventListener('input', renderItems));

    const handleEditItem = (item) => {
        editingItemId = item.id;
        formTitle.textContent = 'Editar Producto';
        itemInput.value = item.name;
        quantityInput.value = item.quantity || '1';
        unitPriceInput.value = item.unitPrice || '';
        locationInput.value = item.location || '';
        categoryInput.value = item.category || '';
        observationsInput.value = item.observations || '';
        saveItemButton.textContent = 'Actualizar Producto';
        cancelEditButton.classList.remove('hidden');
        itemInput.focus();
    };

    const handleDeleteItem = (item) => {
        Swal.fire({
            title: '¿Estás seguro?',
            text: `¿Realmente quieres eliminar "${item.name}"?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar!',
        }).then((result) => {
            if (result.isConfirmed) {
                deleteItemFromFirestore(item.id);
                Swal.fire('¡Eliminado!', `"${item.name}" ha sido eliminado.`, 'success');
            }
        });
    };

    const promptForItemInLocation = (location) => {
        Swal.fire({
            title: `Añadir item a ${location}`,
            html: `
                <input id="swal-name" class="swal2-input" placeholder="Nombre del Producto">
                <input id="swal-quantity" class="swal2-input" placeholder="Cantidad" type="number" value="1">
                <input id="swal-price" class="swal2-input" placeholder="Precio Unitario" type="number" step="0.01">
                <input id="swal-category" class="swal2-input" placeholder="Categoría">
                <input id="swal-observations" class="swal2-input" placeholder="Observaciones">
            `,
            focusConfirm: false,
            showCancelButton: true,
            preConfirm: () => ({
                name: document.getElementById('swal-name').value,
                quantity: document.getElementById('swal-quantity').value,
                unitPrice: document.getElementById('swal-price').value,
                category: document.getElementById('swal-category').value,
                observations: document.getElementById('swal-observations').value,
            })
        }).then((result) => {
            if (result.isConfirmed && result.value.name) {
                const itemData = {
                    ...result.value,
                    location,
                    unitPrice: parseFloat(result.value.unitPrice) || 0,
                    completed: false,
                    order: allItems.length,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                };
                addItemToFirestore(itemData);
            }
        });
    };

    saveItemButton.addEventListener('click', async () => {
        const itemName = itemInput.value.trim();
        if (!itemName) return;

        const itemData = {
            name: itemName,
            quantity: quantityInput.value.trim() || '1',
            unitPrice: parseFloat(unitPriceInput.value) || 0,
            location: locationInput.value.trim(),
            category: categoryInput.value.trim(),
            observations: observationsInput.value.trim(),
        };

        if (editingItemId) {
            await updateItemInFirestore(editingItemId, itemData);
        } else {
            itemData.completed = false;
            itemData.order = allItems.length;
            itemData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
            await addItemToFirestore(itemData);
        }
        resetForm();
    });

    cancelEditButton.addEventListener('click', resetForm);

    resetListButton.addEventListener('click', async () => {
        const result = await Swal.fire({ title: '¿Estás seguro?', text: "Esto marcará todos los artículos completados como no completados.", icon: 'warning', showCancelButton: true });
        if (result.isConfirmed) {
            const batch = db.batch();
            allItems.forEach(doc => {
                if(doc.data().completed) batch.update(doc.ref, { completed: false });
            });
            await batch.commit();
            Swal.fire('¡Reiniciado!', 'La lista ha sido reiniciada.', 'success');
        }
    });
});