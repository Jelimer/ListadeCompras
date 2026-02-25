document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const itemsCollection = db.collection('shoppingItems');

    const elements = {
        itemInput: document.getElementById('itemInput'),
        quantityInput: document.getElementById('quantityInput'),
        unitPriceInput: document.getElementById('unitPriceInput'),
        locationInput: document.getElementById('locationInput'),
        observationsInput: document.getElementById('observationsInput'),
        categoryInput: document.getElementById('categoryInput'),
        addItemButton: document.getElementById('addItemButton'),
        resetListButton: document.getElementById('resetListButton'),
        shoppingListContainer: document.getElementById('shoppingListContainer'),
        locationSuggestions: document.getElementById('location-suggestions'),
        searchInput: document.getElementById('searchInput'),
        hideCompletedSwitch: document.getElementById('hideCompletedSwitch'),
        copyListButton: document.getElementById('copyListButton'),
        themeToggle: document.getElementById('themeToggle'),
        budgetInput: document.getElementById('budgetInput'),
        budgetProgressBar: document.getElementById('budgetProgressBar'),
        budgetStats: document.getElementById('budgetStats'),
        quickAddContainer: document.getElementById('quick-add-container'),
        grandTotalValue: document.getElementById('grandTotalValue'),
        grandTotalContainer: document.getElementById('grandTotalContainer')
    };

    let allItems = [];
    let editingItemId = null;
    let collapsedGroups = new Set();
    let locationOrder = JSON.parse(localStorage.getItem('locationOrder')) || [];

    // Inicializar Sortable para los grupos (lugares)
    new Sortable(elements.shoppingListContainer, {
        animation: 150,
        handle: '.group-title-wrapper',
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            const newOrder = Array.from(elements.shoppingListContainer.querySelectorAll('.location-group'))
                .map(group => group.dataset.location);
            locationOrder = newOrder;
            localStorage.setItem('locationOrder', JSON.stringify(newOrder));
        }
    });

    const updateTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        elements.themeToggle.innerHTML = theme === 'dark' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
        lucide.createIcons();
    };
    updateTheme(localStorage.getItem('theme') || 'light');

    elements.themeToggle.addEventListener('click', () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        updateTheme(newTheme);
    });

    const renderItems = () => {
        const query = elements.searchInput.value.toLowerCase();
        const hideCompleted = elements.hideCompletedSwitch.checked;
        
        let filtered = allItems.filter(doc => {
            const data = doc.data();
            return (data.name?.toLowerCase().includes(query) || 
                    data.location?.toLowerCase().includes(query) ||
                    data.category?.toLowerCase().includes(query)) && 
                   (!hideCompleted || !data.completed);
        });

        const allLocations = [...new Set(allItems.map(d => d.data().location).filter(l => l))];
        elements.locationSuggestions.innerHTML = allLocations.map(l => `<option value="${l}">`).join('');

        elements.shoppingListContainer.innerHTML = '';
        if (filtered.length === 0) {
            elements.shoppingListContainer.innerHTML = '<div class="empty-list-message">No se encontraron productos.</div>';
            return;
        }

        const grouped = {};
        let totalGeneral = 0;

        filtered.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            const loc = data.location || 'General';
            if (!grouped[loc]) grouped[loc] = [];
            grouped[loc].push(data);
            if (!data.completed) totalGeneral += (data.unitPrice || 0) * (data.quantity || 1);
        });

        elements.grandTotalValue.textContent = `$${totalGeneral.toFixed(2)}`;
        elements.grandTotalContainer.textContent = `Total Pendiente: $${totalGeneral.toFixed(2)}`;
        updateBudgetProgress(totalGeneral);

        // Ordenar grupos según el orden guardado (Drag & Drop)
        const sortedLocations = Object.keys(grouped).sort((a, b) => {
            const indexA = locationOrder.indexOf(a);
            const indexB = locationOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        sortedLocations.forEach(loc => {
            const sortedItems = grouped[loc].sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                return a.name.localeCompare(b.name);
            });

            const groupDiv = document.createElement('div');
            groupDiv.className = `location-group ${collapsedGroups.has(loc) ? 'collapsed' : ''}`;
            groupDiv.dataset.location = loc;
            groupDiv.innerHTML = `
                <div class="group-header">
                    <div class="group-title-wrapper" title="Arrastra para reordenar">
                        <i data-lucide="grip-vertical" style="color: var(--text-muted); width: 16px;"></i>
                        <i data-lucide="chevron-down" class="collapse-icon"></i>
                        <h2>${loc}</h2>
                    </div>
                    <span class="badge" style="font-weight: 700; color: var(--text-muted);">${sortedItems.length} items</span>
                </div>
                <div class="shopping-list"></div>
            `;

            groupDiv.querySelector('.group-title-wrapper').addEventListener('click', (e) => {
                // Evitar colapso si se está arrastrando (Sortable maneja esto)
                if (e.defaultPrevented) return;
                groupDiv.classList.toggle('collapsed');
                if (groupDiv.classList.contains('collapsed')) collapsedGroups.add(loc);
                else collapsedGroups.delete(loc);
            });

            const list = groupDiv.querySelector('.shopping-list');
            sortedItems.forEach(item => list.appendChild(createItemCard(item)));
            elements.shoppingListContainer.appendChild(groupDiv);
        });

        lucide.createIcons();
    };

    const createItemCard = (item) => {
        const card = document.createElement('div');
        card.className = `shopping-item ${item.completed ? 'completed' : ''}`;
        const total = (item.unitPrice || 0) * (item.quantity || 1);
        
        // Imagen estable (LoremFlickr)
        const imgUrl = `https://loremflickr.com/150/150/${encodeURIComponent(item.name.split(' ')[0])},grocery/all`;

        card.innerHTML = `
            <img src="${imgUrl}" class="product-img" loading="lazy" onerror="this.src='https://via.placeholder.com/60?text=🛒'">
            <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
            <div class="item-content">
                <span class="item-name">${item.name}</span>
                <span class="item-meta">${item.quantity} un. • ${item.category || 'General'}</span>
            </div>
            <div class="item-price-tag">$${total.toFixed(2)}</div>
            <div class="item-actions">
                <button class="btn-icon edit"><i data-lucide="edit-3"></i></button>
                <button class="btn-icon delete"><i data-lucide="trash-2"></i></button>
            </div>
        `;

        card.querySelector('.item-checkbox').addEventListener('change', (e) => {
            itemsCollection.doc(item.id).update({ completed: e.target.checked });
        });

        card.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            editingItemId = item.id;
            elements.itemInput.value = item.name;
            elements.quantityInput.value = item.quantity;
            elements.unitPriceInput.value = item.unitPrice;
            elements.locationInput.value = item.location;
            elements.categoryInput.value = item.category;
            elements.observationsInput.value = item.observations;
            elements.addItemButton.querySelector('span').textContent = 'Actualizar';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        card.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if(confirm(`¿Eliminar ${item.name}?`)) itemsCollection.doc(item.id).delete();
        });

        return card;
    };

    const updateBudgetProgress = (total) => {
        const budget = parseFloat(elements.budgetInput.value) || 0;
        if (budget > 0) {
            const pct = Math.min((total / budget) * 100, 100);
            elements.budgetProgressBar.style.width = `${pct}%`;
            elements.budgetStats.textContent = `Restante: $${(budget - total).toFixed(2)}`;
            elements.budgetProgressBar.style.background = pct > 90 ? 'var(--danger)' : 'var(--primary)';
        }
    };

    elements.addItemButton.addEventListener('click', async () => {
        const name = elements.itemInput.value.trim();
        if (!name) return;

        const data = {
            name,
            quantity: elements.quantityInput.value || 1,
            unitPrice: parseFloat(elements.unitPriceInput.value) || 0,
            location: elements.locationInput.value.trim() || 'General',
            category: elements.categoryInput.value.trim() || 'General',
            observations: elements.observationsInput.value.trim(),
            completed: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingItemId) {
            await itemsCollection.doc(editingItemId).update(data);
            editingItemId = null;
            elements.addItemButton.querySelector('span').textContent = 'Añadir a la lista';
        } else {
            await itemsCollection.add(data);
        }

        [elements.itemInput, elements.unitPriceInput, elements.locationInput, elements.categoryInput, elements.observationsInput].forEach(i => i.value = '');
        elements.quantityInput.value = 1;
    });

    elements.budgetInput.addEventListener('input', () => {
        localStorage.setItem('budget', elements.budgetInput.value);
        renderItems();
    });
    elements.budgetInput.value = localStorage.getItem('budget') || '';

    elements.resetListButton.addEventListener('click', async () => {
        const snapshot = await itemsCollection.where('completed', '==', true).get();
        if (snapshot.empty) return;
        if (confirm('¿Limpiar los productos comprados?')) {
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
    });

    elements.copyListButton.addEventListener('click', () => {
        let text = "🛒 *LISTA DE COMPRAS* 🛒\n\n";
        const grouped = {};
        
        allItems.forEach(doc => {
            const d = doc.data();
            if (!d.completed) {
                const loc = d.location || 'General';
                if (!grouped[loc]) grouped[loc] = [];
                grouped[loc].push(d);
            }
        });

        for (const loc in grouped) {
            text += `*📍 ${loc.toUpperCase()}*\n`;
            grouped[loc].forEach(item => {
                text += `• ${item.name} (${item.quantity} un.)\n`;
            });
            text += "\n";
        }

        const encodedText = encodeURIComponent(text);
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
    });

    elements.searchInput.addEventListener('input', renderItems);
    elements.hideCompletedSwitch.addEventListener('change', renderItems);

    itemsCollection.orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        allItems = snapshot.docs;
        renderItems();
    });
});
