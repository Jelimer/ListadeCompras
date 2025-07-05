document.addEventListener('DOMContentLoaded', () => {
    const itemInput = document.getElementById('itemInput');
    const locationInput = document.getElementById('locationInput');
    const addItemButton = document.getElementById('addItemButton');
    const shoppingList = document.getElementById('shoppingList');

    let items = JSON.parse(localStorage.getItem('shoppingListItems')) || [];

    function saveItems() {
        localStorage.setItem('shoppingListItems', JSON.stringify(items));
    }

    function renderItems() {
        shoppingList.innerHTML = '';
        items.forEach((item, index) => {
            const li = document.createElement('li');

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

            const locInput = document.createElement('input');
            locInput.type = 'text';
            locInput.classList.add('location-input');
            locInput.placeholder = 'Lugar';
            locInput.value = item.location || '';
            locInput.addEventListener('input', () => {
                item.location = locInput.value;
                saveItems();
            });

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('delete-button');
            deleteButton.textContent = 'Eliminar';
            deleteButton.addEventListener('click', () => {
                items.splice(index, 1);
                saveItems();
                renderItems();
            });

            li.appendChild(checkbox);
            li.appendChild(itemText);
            li.appendChild(locInput);
            li.appendChild(deleteButton);
            shoppingList.appendChild(li);
        });
    }

    addItemButton.addEventListener('click', () => {
        const itemName = itemInput.value.trim();
        const itemLocation = locationInput.value.trim();
        if (itemName) {
            items.push({ name: itemName, completed: false, location: itemLocation });
            itemInput.value = '';
            locationInput.value = '';
            saveItems();
            renderItems();
        }
    });

    // Permite añadir con Enter en el campo de producto
    itemInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItemButton.click();
        }
    });

    // Permite añadir con Enter en el campo de lugar
    locationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItemButton.click();
        }
    });

    renderItems();
});
