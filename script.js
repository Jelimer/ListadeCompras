document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const itemsCollection = db.collection('shoppingItems');

    const elements = {
        itemInput: document.getElementById('itemInput'),
        quantityInput: document.getElementById('quantityInput'),
        unitPriceInput: document.getElementById('unitPriceInput'),
        locationInput: document.getElementById('locationInput'),
        categoryInput: document.getElementById('categoryInput'),
        addItemButton: document.getElementById('addItemButton'),
        resetListButton: document.getElementById('resetListButton'),
        shoppingListContainer: document.getElementById('shoppingListContainer'),
        locationSuggestions: document.getElementById('location-suggestions'),
        categorySuggestions: document.getElementById('category-suggestions'),
        searchInput: document.getElementById('searchInput'),
        hideCompletedSwitch: document.getElementById('hideCompletedSwitch'),
        themeToggle: document.getElementById('themeToggle'),
        budgetInput: document.getElementById('budgetInput'),
        budgetProgressBar: document.getElementById('budgetProgressBar'),
        budgetStats: document.getElementById('budgetStats'),
        grandTotalValue: document.getElementById('grandTotalValue')
    };

    let allItems = [];
    let editingItemId = null;
    let locationOrder = JSON.parse(localStorage.getItem('locationOrder')) || [];
    let myChart = null;

    // --- GRÁFICO LIMPIO ---
    const updateChart = (data) => {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        const labels = Object.keys(data);
        const values = Object.values(data);

        if (myChart) myChart.destroy();

        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'],
                    hoverOffset: 15,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10, weight: 'bold' } } },
                    tooltip: { enabled: true }
                },
                cutout: '70%'
            }
        });
    };

    // --- REORDENAR LUGARES ---
    new Sortable(elements.shoppingListContainer, {
        animation: 150,
        handle: '.group-header',
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            const newOrder = Array.from(elements.shoppingListContainer.querySelectorAll('.location-group'))
                .map(g => g.dataset.location);
            locationOrder = newOrder;
            localStorage.setItem('locationOrder', JSON.stringify(newOrder));
        }
    });

    const renderItems = () => {
        const query = elements.searchInput.value.toLowerCase();
        const hideCompleted = elements.hideCompletedSwitch.checked;
        
        // Sugerencias separadas
        const locations = [...new Set(allItems.map(d => d.data().location).filter(l => l))];
        const categories = [...new Set(allItems.map(d => d.data().category).filter(c => c))];
        elements.locationSuggestions.innerHTML = locations.map(l => `<option value="${l}">`).join('');
        elements.categorySuggestions.innerHTML = categories.map(c => `<option value="${c}">`).join('');

        let filtered = allItems.filter(doc => {
            const data = doc.data();
            const match = (data.name + data.location + data.category).toLowerCase().includes(query);
            return match && (!hideCompleted || !data.completed);
        });

        elements.shoppingListContainer.innerHTML = '';
        const grouped = {};
        const categoryTotals = {};
        let totalGeneral = 0;

        filtered.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            const loc = data.location || 'General';
            if (!grouped[loc]) grouped[loc] = [];
            grouped[loc].push(data);
            
            const subtotal = (data.unitPrice || 0) * (data.quantity || 1);
            if (!data.completed) {
                totalGeneral += subtotal;
                categoryTotals[data.category || 'General'] = (categoryTotals[data.category || 'General'] || 0) + subtotal;
            }
        });

        elements.grandTotalValue.textContent = `$${totalGeneral.toFixed(2)}`;
        updateBudgetUI(totalGeneral);
        updateChart(categoryTotals);

        // Ordenar Lugares
        const sortedLocs = Object.keys(grouped).sort((a, b) => {
            let ia = locationOrder.indexOf(a), ib = locationOrder.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });

        sortedLocs.forEach(loc => {
            // ORDEN ALFABÉTICO + COMPLETADOS AL FINAL
            const items = grouped[loc].sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                return a.name.localeCompare(b.name);
            });

            const groupDiv = document.createElement('div');
            groupDiv.className = 'location-group';
            groupDiv.dataset.location = loc;
            groupDiv.innerHTML = `
                <div class="group-header">
                    <div class="group-title">
                        <i data-lucide="more-vertical" style="opacity:0.3"></i>
                        <h2>${loc}</h2>
                    </div>
                    <span class="stat-meta">${items.length} productos</span>
                </div>
                <div class="shopping-list"></div>
            `;
            const list = groupDiv.querySelector('.shopping-list');
            items.forEach(item => list.appendChild(createCard(item)));
            elements.shoppingListContainer.appendChild(groupDiv);
        });
        lucide.createIcons();
    };

    const createCard = (item) => {
        const div = document.createElement('div');
        div.className = `shopping-item ${item.completed ? 'completed' : ''}`;
        
        // Mejor búsqueda de imágenes (Google-like result via Unsplash Source)
        const imgUrl = `https://loremflickr.com/200/200/${encodeURIComponent(item.name.split(' ')[0])},food/all`;

        div.innerHTML = `
            <img src="${imgUrl}" class="product-img" onerror="this.src='https://via.placeholder.com/65?text=🛒'">
            <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
            <div class="item-info">
                <span class="item-name">${item.name}</span>
                <span class="item-sub">${item.quantity} un. • ${item.category || 'General'}</span>
            </div>
            <div class="item-price">$${((item.unitPrice || 0) * (item.quantity || 1)).toFixed(2)}</div>
            <div class="item-actions">
                <button class="btn-icon edit-btn"><i data-lucide="pencil"></i></button>
                <button class="btn-icon del-btn"><i data-lucide="trash-2"></i></button>
            </div>
        `;

        div.querySelector('.item-checkbox').addEventListener('change', () => {
            itemsCollection.doc(item.id).update({ completed: !item.completed });
        });

        div.querySelector('.edit-btn').addEventListener('click', () => {
            editingItemId = item.id;
            elements.itemInput.value = item.name;
            elements.quantityInput.value = item.quantity;
            elements.unitPriceInput.value = item.unitPrice;
            elements.locationInput.value = item.location;
            elements.categoryInput.value = item.category;
            elements.addItemButton.querySelector('span').textContent = 'Actualizar';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        div.querySelector('.del-btn').addEventListener('click', () => {
            if(confirm(`¿Eliminar ${item.name}?`)) itemsCollection.doc(item.id).delete();
        });

        return div;
    };

    const updateBudgetUI = (total) => {
        const budget = parseFloat(elements.budgetInput.value) || 0;
        if (budget > 0) {
            const pct = Math.min((total / budget) * 100, 100);
            elements.budgetProgressBar.style.width = `${pct}%`;
            elements.budgetProgressBar.style.background = pct > 90 ? 'var(--danger)' : 'var(--primary)';
            elements.budgetStats.textContent = `Disponible: $${(budget - total).toFixed(2)}`;
        } else {
            elements.budgetProgressBar.style.width = '0%';
            elements.budgetStats.textContent = 'Sin presupuesto';
        }
    };

    elements.addItemButton.addEventListener('click', async () => {
        if (!elements.itemInput.value.trim()) return;
        const data = {
            name: elements.itemInput.value.trim(),
            quantity: elements.quantityInput.value || 1,
            unitPrice: parseFloat(elements.unitPriceInput.value) || 0,
            location: elements.locationInput.value.trim() || 'General',
            category: elements.categoryInput.value.trim() || 'General',
            completed: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingItemId) {
            await itemsCollection.doc(editingItemId).update(data);
            editingItemId = null;
            elements.addItemButton.querySelector('span').textContent = 'Añadir';
        } else {
            await itemsCollection.add(data);
        }

        [elements.itemInput, elements.unitPriceInput, elements.locationInput, elements.categoryInput].forEach(i => i.value = '');
        elements.quantityInput.value = 1;
    });

    elements.budgetInput.addEventListener('input', () => {
        localStorage.setItem('budget', elements.budgetInput.value);
        renderItems();
    });
    elements.budgetInput.value = localStorage.getItem('budget') || '';

    elements.resetListButton.addEventListener('click', async () => {
        const snap = await itemsCollection.where('completed', '==', true).get();
        if (snap.empty) return;
        if (confirm('¿Limpiar carrito?')) {
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
    });

    elements.searchInput.addEventListener('input', renderItems);
    elements.hideCompletedSwitch.addEventListener('change', renderItems);

    // Dark Mode
    elements.themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        lucide.createIcons();
    });

    itemsCollection.orderBy('timestamp', 'desc').onSnapshot(snap => {
        allItems = snap.docs;
        renderItems();
    });
});
