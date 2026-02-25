document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const itemsCollection = db.collection('shoppingItems');

    // Referencias
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

    // --- TEMA ---
    const updateTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        elements.themeToggle.innerHTML = theme === 'dark' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
        lucide.createIcons();
    };
    
    let currentTheme = localStorage.getItem('theme') || 'light';
    updateTheme(currentTheme);

    elements.themeToggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', currentTheme);
        updateTheme(currentTheme);
    });

    // --- QUICK ADD ---
    const frequentItems = [
        { name: 'Leche', icon: '🥛' }, { name: 'Pan', icon: '🍞' },
        { name: 'Huevos', icon: '🥚' }, { name: 'Aceite', icon: '🌻' },
        { name: 'Pollo', icon: '🍗' }, { name: 'Yerba', icon: '🌿' }
    ];

    frequentItems.forEach(item => {
        const chip = document.createElement('button');
        chip.className = 'quick-add-chip';
        chip.innerHTML = `${item.icon} ${item.name}`;
        chip.addEventListener('click', () => {
            elements.searchInput.value = item.name;
            renderItems();
        });
        elements.quickAddContainer.appendChild(chip);
    });

    // --- LÓGICA RENDERIZADO ---
    const renderItems = () => {
        const query = elements.searchInput.value.toLowerCase();
        const hideCompleted = elements.hideCompletedSwitch.checked;
        
        let filtered = allItems.filter(doc => {
            const data = doc.data();
            const match = data.name?.toLowerCase().includes(query) || 
                          data.location?.toLowerCase().includes(query) ||
                          data.category?.toLowerCase().includes(query);
            return match && (!hideCompleted || !data.completed);
        });

        elements.shoppingListContainer.innerHTML = '';
        if (filtered.length === 0) {
            elements.shoppingListContainer.innerHTML = '<div class="empty-list-message">No se encontraron productos.</div>';
            return;
        }

        const grouped = {};
        let totalGeneral = 0;

        filtered.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            const loc = data.location || 'Otros';
            if (!grouped[loc]) grouped[loc] = [];
            grouped[loc].push(data);
            
            const subtotal = (parseFloat(data.unitPrice) || 0) * (parseFloat(data.quantity) || 1);
            if (!data.completed) totalGeneral += subtotal;
        });

        // Actualizar Estadísticas
        elements.grandTotalValue.textContent = `$${totalGeneral.toFixed(2)}`;
        elements.grandTotalContainer.textContent = `Total Pendiente: $${totalGeneral.toFixed(2)}`;
        updateBudgetProgress(totalGeneral);

        Object.keys(grouped).sort().forEach(loc => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'location-group';
            groupDiv.innerHTML = `
                <div class="group-header"><h2>${loc}</h2></div>
                <div class="shopping-list"></div>
            `;
            const list = groupDiv.querySelector('.shopping-list');
            grouped[loc].forEach(item => {
                list.appendChild(createItemCard(item));
            });
            elements.shoppingListContainer.appendChild(groupDiv);
        });

        lucide.createIcons();
    };

    const createItemCard = (item) => {
        const card = document.createElement('div');
        card.className = `shopping-item ${item.completed ? 'completed' : ''}`;
        const total = (item.unitPrice || 0) * (item.quantity || 1);

        card.innerHTML = `
            <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
            <div class="item-content">
                <span class="item-name">${item.name}</span>
                <span class="item-meta">${item.quantity} un. • ${item.category || 'Sin categoría'}</span>
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

        card.querySelector('.edit').addEventListener('click', () => {
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

        card.querySelector('.delete').addEventListener('click', () => {
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
            elements.budgetProgressBar.style.background = pct > 90 ? 'var(--danger)' : 'linear-gradient(to right, var(--primary), var(--secondary))';
        } else {
            elements.budgetProgressBar.style.width = '0%';
            elements.budgetStats.textContent = 'Sin presupuesto fijado';
        }
    };

    // --- EVENTOS ---
    elements.addItemButton.addEventListener('click', async () => {
        const data = {
            name: elements.itemInput.value.trim(),
            quantity: elements.quantityInput.value || 1,
            unitPrice: parseFloat(elements.unitPriceInput.value) || 0,
            location: elements.locationInput.value.trim() || 'General',
            category: elements.categoryInput.value.trim(),
            observations: elements.observationsInput.value.trim(),
            completed: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!data.name) return;

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
        let text = "🛒 *MI LISTA DE COMPRAS*\n\n";
        const pending = allItems.filter(d => !d.data().completed);
        pending.forEach(d => {
            const data = d.data();
            text += `• *${data.name}* (${data.quantity}) - _${data.location}_\n`;
        });
        navigator.clipboard.writeText(text);
        alert('Copiado para WhatsApp!');
    });

    elements.searchInput.addEventListener('input', renderItems);
    elements.hideCompletedSwitch.addEventListener('change', renderItems);

    // Real-time
    itemsCollection.orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        allItems = snapshot.docs;
        renderItems();
    });
});
