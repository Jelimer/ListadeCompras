document.addEventListener('DOMContentLoaded', () => {
    const itemInput = document.getElementById('itemInput');
    const quantityInput = document.getElementById('quantityInput');
    const locationInput = document.getElementById('locationInput');
    const observationsInput = document.getElementById('observationsInput');
    const addItemButton = document.getElementById('addItemButton');
    const shoppingListTableBody = document.querySelector('#shoppingListTable tbody');

    let items = JSON.parse(localStorage.getItem('shoppingListItems')) || [];

    function saveItems() {
        localStorage.setItem('shoppingListItems', JSON.stringify(items));
    }

    function renderItems() {
        shoppingListTableBody.innerHTML = '';
        items.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.dataset.id = index; // Usar el índice como ID para Sortable.js

            // Celda para el checkbox y el nombre del producto
            const productCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.completed;
            checkbox.addEventListener('change', () => {
                item.completed = checkbox.checked;
                if (item.completed) {
                    itemText.classList.add('completed');
                } else {
                    itemText.classList.remove('completed');
                }
                saveItems();
            });

            const itemText = document.createElement('span');
            itemText.classList.add('item-text');
            itemText.textContent = item.name;
            if (item.completed) {
                itemText.classList.add('completed');
            }
            productCell.appendChild(checkbox);
            productCell.appendChild(itemText);
            tr.appendChild(productCell);

            // Celda para la cantidad
            const quantityCell = document.createElement('td');
            const quantitySpan = document.createElement('span');
            quantitySpan.textContent = item.quantity || '1'; // Valor por defecto
            quantityCell.appendChild(quantitySpan);
            tr.appendChild(quantityCell);

            // Celda para el lugar
            const locationCell = document.createElement('td');
            const locationSpan = document.createElement('span');
            locationSpan.textContent = item.location || '';
            locationCell.appendChild(locationSpan);
            tr.appendChild(locationCell);

            // Celda para las observaciones
            const observationsCell = document.createElement('td');
            const observationsSpan = document.createElement('span');
            observationsSpan.textContent = item.observations || '';
            observationsCell.appendChild(observationsSpan);
            tr.appendChild(observationsCell);

            // Celda para las acciones (eliminar)
            const actionsCell = document.createElement('td');
            const deleteButton = document.createElement('button');
            deleteButton.classList.add('delete-button');
            deleteButton.textContent = 'Eliminar';
            deleteButton.addEventListener('click', () => {
                items.splice(index, 1);
                saveItems();
                renderItems();
            });
            actionsCell.appendChild(deleteButton);
            tr.appendChild(actionsCell);

            shoppingListTableBody.appendChild(tr);
        });
    }

    addItemButton.addEventListener('click', () => {
        const itemName = itemInput.value.trim();
        const itemQuantity = parseInt(quantityInput.value) || 1;
        const itemLocation = locationInput.value.trim();
        const itemObservations = observationsInput.value.trim();

        if (itemName) {
            items.push({
                name: itemName,
                completed: false,
                quantity: itemQuantity,
                location: itemLocation,
                observations: itemObservations
            });
            itemInput.value = '';
            quantityInput.value = '1'; // Reset a 1
            locationInput.value = '';
            observationsInput.value = '';
            saveItems();
            renderItems();
        }
    });

    // Permite añadir con Enter en los campos de entrada
    itemInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItemButton.click();
        }
    });
    quantityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItemButton.click();
        }
    });
    locationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItemButton.click();
        }
    });
    observationsInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItemButton.click();
        }
    });

    // Inicializar Sortable.js
    new Sortable(shoppingListTableBody, {
        animation: 150,
        ghostClass: 'sortable-ghost', // Clase para el elemento fantasma
        onEnd: function (evt) {
            const oldIndex = evt.oldIndex;
            const newIndex = evt.newIndex;

            // Reordenar el array de items
            const [movedItem] = items.splice(oldIndex, 1);
            items.splice(newIndex, 0, movedItem);

            saveItems();
            // No es necesario renderizar de nuevo, Sortable.js ya movió el DOM
        },
    });

    renderItems();
});
