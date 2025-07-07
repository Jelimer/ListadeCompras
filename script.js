document.addEventListener('DOMContentLoaded', () => {
    // Tu configuración de Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyB-FqW5XJ3bBm4CPxXKNBfHiLLWt8wE_nY",
        authDomain: "listadecomprasapp-734cf.firebaseapp.com",
        projectId: "listadecomprasapp-734cf",
        storageBucket: "listadecomprasapp-734cf.firebasestorage.app",
        messagingSenderId: "816059785698",
        appId: "1:816059785698:web:c7b9559f25ce5a273559bb",
        measurementId: "G-EDHEG28Y4T"
    };

    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const itemsCollection = db.collection('shoppingItems');

    const itemInput = document.getElementById('itemInput');
    const quantityInput = document.getElementById('quantityInput');
    const locationInput = document.getElementById('locationInput');
    const observationsInput = document.getElementById('observationsInput');
    const addItemButton = document.getElementById('addItemButton');
    const resetListButton = document.getElementById('resetListButton');
    const shoppingListTableBody = document.querySelector('#shoppingListTable tbody');

    let editingItemId = null; // Variable para almacenar el ID del item que se está editando

    // Función para guardar un item en Firestore
    async function addItemToFirestore(item) {
        try {
            await itemsCollection.add(item);
            console.log("Document successfully written!");
        } catch (error) {
            console.error("Error writing document: ", error);
        }
    }

    // Función para actualizar un item en Firestore
    async function updateItemInFirestore(id, updates) {
        try {
            await itemsCollection.doc(id).update(updates);
            console.log("Document successfully updated!");
        } catch (error) {
            console.error("Error updating document: ", error);
        }
    }

    // Función para eliminar un item de Firestore
    async function deleteItemFromFirestore(id) {
        try {
            await itemsCollection.doc(id).delete();
            console.log("Document successfully deleted!");
        } catch (error) {
            console.error("Error removing document: ", error);
        }
    }

    // Renderizar items desde Firestore
    function renderItems(itemsFromFirestore) {
        shoppingListTableBody.innerHTML = '';
        itemsFromFirestore.forEach(itemDoc => {
            const item = itemDoc.data();
            const tr = document.createElement('tr');
            tr.dataset.id = itemDoc.id; // Usar el ID del documento de Firestore

            // Celda para el checkbox y el nombre del producto
            const productCell = document.createElement('td');
            const productContent = document.createElement('div');
            productContent.classList.add('product-content'); // Nueva clase para el div

            const dragHandle = document.createElement('span');
            dragHandle.classList.add('drag-handle');
            dragHandle.innerHTML = '&#x2261;'; // Icono de hamburguesa o similar

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.completed;
            checkbox.addEventListener('change', async () => {
                const newCompletedStatus = checkbox.checked;
                // Al cambiar el estado de completado, actualizamos el orden para que se mueva al final de su grupo
                await updateItemInFirestore(itemDoc.id, {
                    completed: newCompletedStatus,
                    order: firebase.firestore.FieldValue.serverTimestamp() // Nuevo timestamp para reordenar
                });
            });

            const itemText = document.createElement('span');
            itemText.classList.add('item-text');
            itemText.textContent = item.name;
            if (item.completed) {
                itemText.classList.add('completed');
            }
            productContent.appendChild(dragHandle);
            productContent.appendChild(checkbox);
            productContent.appendChild(itemText);
            productCell.appendChild(productContent);
            tr.appendChild(productCell);

            // Celda para la cantidad
            const quantityCell = document.createElement('td');
            const quantitySpan = document.createElement('span');
            quantitySpan.textContent = item.quantity || '';
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

            // Celda para las acciones (eliminar y editar)
            const actionsCell = document.createElement('td');

            const editButton = document.createElement('button');
            editButton.classList.add('edit-button');
            editButton.textContent = 'Editar';
            editButton.addEventListener('click', () => {
                editingItemId = itemDoc.id;
                itemInput.value = item.name;
                quantityInput.value = item.quantity || '';
                locationInput.value = item.location || '';
                observationsInput.value = item.observations || '';
                addItemButton.textContent = 'Actualizar';
            });

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('delete-button');
            deleteButton.textContent = 'Eliminar';
            deleteButton.addEventListener('click', () => {
                deleteItemFromFirestore(itemDoc.id);
            });
            actionsCell.appendChild(editButton);
            actionsCell.appendChild(deleteButton);
            tr.appendChild(actionsCell);

            shoppingListTableBody.appendChild(tr);
        });
    }

    addItemButton.addEventListener('click', async () => {
        const itemName = itemInput.value.trim();
        const itemQuantity = quantityInput.value.trim();
        const itemLocation = locationInput.value.trim();
        const itemObservations = observationsInput.value.trim();

        if (itemName) {
            if (editingItemId) {
                // Actualizar item existente
                await updateItemInFirestore(editingItemId, {
                    name: itemName,
                    quantity: itemQuantity,
                    location: itemLocation,
                    observations: itemObservations
                });
                editingItemId = null; // Resetear el modo edición
                addItemButton.textContent = 'Añadir'; // Volver al texto original del botón
            } else {
                // Añadir nuevo item con un campo de orden
                // Obtener el orden más alto de los elementos NO completados
                const snapshot = await itemsCollection.where('completed', '==', false).orderBy('order', 'desc').limit(1).get();
                let newOrder = 0;
                if (!snapshot.empty) {
                    newOrder = snapshot.docs[0].data().order + 1;
                }

                addItemToFirestore({
                    name: itemName,
                    completed: false,
                    quantity: itemQuantity,
                    location: itemLocation,
                    observations: itemObservations,
                    order: newOrder, // Nuevo campo de orden
                    timestamp: firebase.firestore.FieldValue.serverTimestamp() // Mantener timestamp para desempate o referencia
                });
            }
            itemInput.value = '';
            quantityInput.value = '';
            locationInput.value = '';
            observationsInput.value = '';
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

    resetListButton.addEventListener('click', async () => {
        const snapshot = await itemsCollection.where('completed', '==', true).get();
        if (snapshot.empty) {
            console.log("No completed items to reset.");
            return;
        }

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { completed: false });
        });

        try {
            await batch.commit();
            console.log("Successfully reset completed items.");
        } catch (error) {
            console.error("Error resetting items: ", error);
        }
    });

    // Listener en tiempo real de Firestore (ordenado por el nuevo campo 'order')
    itemsCollection.orderBy('completed', 'asc').orderBy('order', 'asc').onSnapshot(snapshot => {
        renderItems(snapshot.docs);
    }, error => {
        console.error("Error getting documents: ", error);
    });

    // Inicializar Sortable.js
    new Sortable(shoppingListTableBody, {
        animation: 150,
        ghostClass: 'sortable-ghost', // Clase para el elemento fantasma
        handle: '.drag-handle', // Solo arrastrar desde el handle
        onEnd: async function (evt) {
            const newOrderIds = Array.from(shoppingListTableBody.children).map(tr => tr.dataset.id);
            const batch = db.batch();

            // Obtener los documentos actuales para saber su estado de completado
            const currentItemsSnapshot = await itemsCollection.get();
            const currentItemsMap = new Map();
            currentItemsSnapshot.docs.forEach(doc => {
                currentItemsMap.set(doc.id, doc.data());
            });

            // Asignar nuevos valores de orden basados en la posición visual
            newOrderIds.forEach((id, index) => {
                const docRef = itemsCollection.doc(id);
                const itemData = currentItemsMap.get(id);
                // Solo actualizamos el orden si el elemento no está completado
                // o si lo estamos moviendo dentro de los completados
                if (itemData && !itemData.completed) {
                    batch.update(docRef, { order: index });
                } else if (itemData && itemData.completed) {
                    // Si está completado, le damos un orden alto para que se quede al final
                    // Esto es para asegurar que el drag-and-drop funcione dentro de los completados
                    batch.update(docRef, { order: index + 1000000 }); // Un número grande
                }
            });

            try {
                await batch.commit();
                console.log("Order updated successfully!");
            } catch (error) {
                console.error("Error updating order: ", error);
            }
        },
    });
});