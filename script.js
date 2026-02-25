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
    let collapsedGroups = new Set(JSON.parse(localStorage.getItem('collapsedGroups')) || []);
    let myChart = null;

    const updateTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        elements.themeToggle.innerHTML = theme === 'dark' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
        lucide.createIcons();
        if(myChart) renderItems(); 
    };
    updateTheme(localStorage.getItem('theme') || 'light');

    // --- GRÁFICO COMBINADO (Cantidades con Espaciado) ---
    const updateChart = (stackedData, categories) => {
        const canvas = document.getElementById('categoryChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const locations = Object.keys(stackedData);
        if (locations.length === 0) {
            if (myChart) myChart.destroy();
            return;
        }

        const colorPalette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e'];
        const catColors = {};
        categories.forEach((cat, i) => catColors[cat] = colorPalette[i % colorPalette.length]);

        const datasets = categories.map(cat => ({
            label: cat,
            data: locations.map(loc => stackedData[loc][cat] || 0),
            backgroundColor: catColors[cat],
            borderRadius: 6,
            barPercentage: 0.4, // Menos porcentaje de ocupación = más espacio entre lugares
            categoryPercentage: 0.6 // Menos porcentaje de categoría = más aire visual
        }));

        if (myChart) myChart.destroy();

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        myChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: locations, datasets: datasets },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: isDark ? '#f8fafc' : '#0f172a', boxWidth: 10, font: { size: 10, weight: 'bold' } } },
                    tooltip: { enabled: true, mode: 'index', intersect: false }
                },
                scales: {
                    x: { 
                        stacked: true, 
                        grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, 
                        ticks: { 
                            color: isDark ? '#94a3b8' : '#64748b',
                            stepSize: 1,
                            precision: 0
                        } 
                    },
                    y: { stacked: true, grid: { display: false }, ticks: { color: isDark ? '#f8fafc' : '#0f172a', font: { weight: 'bold' } } }
                }
            }
        });
    };

    const renderItems = () => {
        const query = elements.searchInput.value.toLowerCase();
        const hideCompleted = elements.hideCompletedSwitch.checked;
        
        const locationsList = [...new Set(allItems.map(d => d.data().location).filter(l => l))];
        const categoriesList = [...new Set(allItems.map(d => d.data().category).filter(c => c))];
        elements.locationSuggestions.innerHTML = locationsList.map(l => `<option value="${l}">`).join('');
        elements.categorySuggestions.innerHTML = categoriesList.map(c => `<option value="${c}">`).join('');

        let filtered = allItems.filter(doc => {
            const data = doc.data();
            const textMatch = (data.name + (data.location || '') + (data.category || '')).toLowerCase().includes(query);
            return textMatch && (!hideCompleted || !data.completed);
        });

        const scrollPos = window.scrollY;
        elements.shoppingListContainer.innerHTML = '';
        
        const grouped = {};
        const stackedData = {}; 
        const distinctCategories = new Set();
        let totalGeneral = 0;

        filtered.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            const loc = data.location || 'General';
            const cat = data.category || 'Varios';
            
            if (!grouped[loc]) grouped[loc] = [];
            grouped[loc].push(data);
            
            const quantity = parseFloat(data.quantity) || 1;
            const subtotal = (parseFloat(data.unitPrice) || 0) * quantity;
            
            if (!data.completed) {
                totalGeneral += subtotal;
                if (!stackedData[loc]) stackedData[loc] = {};
                stackedData[loc][cat] = (stackedData[loc][cat] || 0) + quantity;
                distinctCategories.add(cat);
            }
        });

        elements.grandTotalValue.textContent = `$${totalGeneral.toFixed(2)}`;
        updateBudgetUI(totalGeneral);
        updateChart(stackedData, Array.from(distinctCategories).sort());

        const sortedLocs = Object.keys(grouped).sort((a, b) => {
            let ia = locationOrder.indexOf(a), ib = locationOrder.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });

        sortedLocs.forEach(loc => {
            const items = grouped[loc].sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                return a.name.localeCompare(b.name);
            });

            const groupDiv = document.createElement('div');
            const isCollapsed = collapsedGroups.has(loc);
            groupDiv.className = `location-group ${isCollapsed ? 'collapsed' : ''}`;
            groupDiv.dataset.location = loc;
            groupDiv.innerHTML = `
                <div class="group-header">
                    <div class="group-title">
                        <i data-lucide="grip-vertical" style="opacity:0.4"></i>
                        <i data-lucide="chevron-down" class="collapse-icon"></i>
                        <h2>${loc}</h2>
                    </div>
                    <span style="font-weight:800; opacity:0.5; font-size:0.8rem">${items.length} items</span>
                </div>
                <div class="shopping-list"></div>
            `;

            // EVENTO DE COLAPSO REFORZADO
            groupDiv.querySelector('.group-header').addEventListener('click', (e) => {
                groupDiv.classList.toggle('collapsed');
                if (groupDiv.classList.contains('collapsed')) {
                    collapsedGroups.add(loc);
                } else {
                    collapsedGroups.delete(loc);
                }
                localStorage.setItem('collapsedGroups', JSON.stringify(Array.from(collapsedGroups)));
            });

            const list = groupDiv.querySelector('.shopping-list');
            items.forEach(item => list.appendChild(createCard(item)));
            elements.shoppingListContainer.appendChild(groupDiv);
        });
        
        lucide.createIcons();
        window.scrollTo(0, scrollPos);
    };

    const createCard = (item) => {
        const div = document.createElement('div');
        div.className = `shopping-item ${item.completed ? 'completed' : ''}`;
        const total = (item.unitPrice || 0) * (item.quantity || 1);
        const imgUrl = `https://loremflickr.com/200/200/${encodeURIComponent(item.name.split(' ')[0])},grocery/all`;

        div.innerHTML = `
            <img src="${imgUrl}" class="product-img" loading="lazy" onerror="this.src='https://via.placeholder.com/65?text=🛒'">
            <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
            <div class="item-info">
                <span class="item-name" title="${item.name}">${item.name}</span>
                <span class="item-sub">${item.quantity} un. • ${item.category || 'General'}</span>
            </div>
            <div class="item-price">$${total.toFixed(2)}</div>
            <div class="item-actions">
                <button class="btn-icon edit-btn"><i data-lucide="edit-3"></i></button>
                <button class="btn-icon del-btn"><i data-lucide="trash-2"></i></button>
            </div>
        `;

        div.querySelector('.item-checkbox').addEventListener('change', (e) => {
            e.stopPropagation();
            itemsCollection.doc(item.id).update({ completed: !item.completed });
        });

        div.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            editingItemId = item.id;
            elements.itemInput.value = item.name;
            elements.quantityInput.value = item.quantity;
            elements.unitPriceInput.value = item.unitPrice;
            elements.locationInput.value = item.location;
            elements.categoryInput.value = item.category;
            elements.addItemButton.querySelector('span').textContent = 'Actualizar';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        div.querySelector('.del-btn').addEventListener('click', (e) => {
            e.stopPropagation();
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
            elements.budgetStats.textContent = `Restante: $${(budget - total).toFixed(2)}`;
        } else {
            elements.budgetProgressBar.style.width = '0%';
            elements.budgetStats.textContent = 'Sin límite';
        }
    };

    elements.addItemButton.addEventListener('click', async () => {
        const name = elements.itemInput.value.trim();
        if (!name) return;
        const data = {
            name,
            quantity: parseFloat(elements.quantityInput.value) || 1,
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
        if (confirm('¿Limpiar comprados?')) {
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
    });

    new Sortable(elements.shoppingListContainer, {
        animation: 150,
        handle: '.group-title',
        onEnd: () => {
            const newOrder = Array.from(elements.shoppingListContainer.querySelectorAll('.location-group'))
                .map(g => g.dataset.location);
            locationOrder = newOrder;
            localStorage.setItem('locationOrder', JSON.stringify(newOrder));
        }
    });

    elements.searchInput.addEventListener('input', renderItems);
    elements.hideCompletedSwitch.addEventListener('change', renderItems);

    elements.themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        updateTheme(isDark ? 'light' : 'dark');
    });

    itemsCollection.orderBy('timestamp', 'desc').onSnapshot(snap => {
        allItems = snap.docs;
        renderItems();
    });
});
