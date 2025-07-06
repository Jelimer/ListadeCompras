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
    const shoppingListTableBody = document.querySelector('#shoppingListTable tbody');

    // No necesitamos 'items' como array local, ya que Firestore lo manejará
    // let items = JSON.parse(localStorage.getItem('shoppingListItems')) || [];

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
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.completed;
            checkbox.addEventListener('change', () => {
                updateItemInFirestore(itemDoc.id, { completed: checkbox.checked });
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

            // Celda para las acciones (eliminar)
            const actionsCell = document.createElement('td');
            const deleteButton = document.createElement('button');
            deleteButton.classList.add('delete-button');
            deleteButton.textContent = 'Eliminar';
            deleteButton.addEventListener('click', () => {
                deleteItemFromFirestore(itemDoc.id);
            });
            actionsCell.appendChild(deleteButton);
            tr.appendChild(actionsCell);

            shoppingListTableBody.appendChild(tr);
        });
    }

    addItemButton.addEventListener('click', () => {
        const itemName = itemInput.value.trim();
        const itemQuantity = quantityInput.value.trim();
        const itemLocation = locationInput.value.trim();
        const itemObservations = observationsInput.value.trim();

        if (itemName) {
            addItemToFirestore({
                name: itemName,
                completed: false,
                quantity: itemQuantity,
                location: itemLocation,
                observations: itemObservations,
                timestamp: firebase.firestore.FieldValue.serverTimestamp() // Para ordenar
            });
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

    // Listener en tiempo real de Firestore
    itemsCollection.orderBy('timestamp', 'asc').onSnapshot(snapshot => {
        renderItems(snapshot.docs);
    }, error => {
        console.error("Error getting documents: ", error);
    });

    // Inicializar Sortable.js
    new Sortable(shoppingListTableBody, {
        animation: 150,
        ghostClass: 'sortable-ghost', // Clase para el elemento fantasma
        onEnd: async function (evt) {
            const oldIndex = evt.oldIndex;
            const newIndex = evt.newIndex;

            // Obtener los IDs de los documentos en el nuevo orden
            const newOrderIds = Array.from(shoppingListTableBody.children).map(tr => tr.dataset.id);

            // Actualizar el campo 'timestamp' de los documentos afectados para reflejar el nuevo orden
            // Esto es una solución simplificada para el reordenamiento en Firestore.
            // Para un reordenamiento robusto, se necesitaría un campo de 'orden' numérico
            // y actualizar todos los elementos entre oldIndex y newIndex.
            // Aquí, simplemente actualizamos el timestamp del elemento movido.
            const movedItemId = newOrderIds[newIndex];
            await updateItemInFirestore(movedItemId, { timestamp: firebase.firestore.FieldValue.serverTimestamp() });

            // Firestore se encargará de re-renderizar a través del listener
        },
    });
});