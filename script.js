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
    let chartInstance = null;

    const updateTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        elements.themeToggle.innerHTML = theme === 'dark' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
        lucide.createIcons();
        if(chartInstance) renderItems(); 
    };
    updateTheme(localStorage.getItem('theme') || 'light');

    // --- GRÁFICO CON ECHARTS (Separación perfecta y etiquetas) ---
    const updateChart = (stackedData, categories) => {
        const chartDom = document.getElementById('categoryChart');
        if (!chartDom) return;
        
        if (!chartInstance) {
            chartInstance = echarts.init(chartDom);
        }

        const locations = Object.keys(stackedData).sort();
        if (locations.length === 0) {
            chartInstance.clear();
            return;
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const colorPalette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

        const series = categories.map((cat, i) => ({
            name: cat,
            type: 'bar',
            stack: 'total',
            label: {
                show: true,
                position: 'inside',
                formatter: (params) => params.value > 0 ? params.value : '',
                color: '#fff',
                fontSize: 10,
                fontWeight: 'bold'
            },
            emphasis: { focus: 'series' },
            data: locations.map(loc => stackedData[loc][cat] || 0),
            itemStyle: { borderRadius: 4 },
            barMaxWidth: 35, // Grosor máximo de barra para garantizar separación
            color: colorPalette[i % colorPalette.length]
        }));

        const option = {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { 
                bottom: '0%', 
                textStyle: { color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 'bold', fontSize: 10 },
                itemWidth: 8,
                itemHeight: 8,
                pageIconColor: isDark ? '#fff' : '#000'
            },
            grid: { left: '3%', right: '8%', bottom: '15%', top: '5%', containLabel: true },
            xAxis: { 
                type: 'value', 
                minInterval: 1, // Solo enteros
                splitLine: { lineStyle: { type: 'dashed', opacity: 0.1 } },
                axisLabel: { color: isDark ? '#94a3b8' : '#64748b' }
            },
            yAxis: { 
                type: 'category', 
                data: locations,
                axisLabel: { 
                    color: isDark ? '#f8fafc' : '#0f172a', 
                    fontWeight: 'bold',
                    width: 100,
                    overflow: 'break'
                },
                axisLine: { show: false },
                axisTick: { show: false }
            },
            series: series
        };

        chartInstance.setOption(option, true); // True para limpiar configuraciones anteriores
    };

    const renderItems = () => {
        const query = elements.searchInput.value.toLowerCase();
        const hideCompleted = elements.hideCompletedSwitch.checked;
        
        const locs = [...new Set(allItems.map(d => d.data().location).filter(l => l))];
        const cats = [...new Set(allItems.map(d => d.data().category).filter(c => c))];
        elements.locationSuggestions.innerHTML = locs.map(l => `<option value="${l}">`).join('');
        elements.categorySuggestions.innerHTML = cats.map(c => `<option value="${c}">`).join('');

        let filtered = allItems.filter(doc => {
            const data = doc.data();
            return (data.name + (data.location || '') + (data.category || '')).toLowerCase().includes(query) && 
                   (!hideCompleted || !data.completed);
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
            const qty = parseFloat(data.quantity) || 1;
            
            if (!grouped[loc]) grouped[loc] = [];
            grouped[loc].push(data);
            
            if (!data.completed) {
                totalGeneral += (parseFloat(data.unitPrice) || 0) * qty;
                if (!stackedData[loc]) stackedData[loc] = {};
                stackedData[loc][cat] = (stackedData[loc][cat] || 0) + qty;
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
            groupDiv.className = `location-group ${collapsedGroups.has(loc) ? 'collapsed' : ''}`;
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

            groupDiv.querySelector('.group-header').addEventListener('click', () => {
                groupDiv.classList.toggle('collapsed');
                if (groupDiv.classList.contains('collapsed')) collapsedGroups.add(loc);
                else collapsedGroups.delete(loc);
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

        div.querySelector('.item-checkbox').addEventListener('change', () => {
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
        handle: '.group-header',
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

    window.addEventListener('resize', () => {
        if(chartInstance) chartInstance.resize();
    });
});
