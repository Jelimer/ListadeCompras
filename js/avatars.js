/**
 * js/avatars.js
 * Catálogo de Avatares e Iconos Locales 100% Offline para Lista de Compra | PRO.
 * Compatible con UMD (Navegadores y Node.js).
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShoppingAvatars = factory();
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // Mapeo canónico de 11 categorías temáticas a iconos de Lucide (Requisitos F10, T1_F10_2, T1_F10_3)
  const CATEGORY_ICONS = {
    'Frutas': 'apple',
    'Lácteos': 'milk',
    'Carnes': 'beef',
    'Panadería': 'croissant',
    'Limpieza': 'sparkles',
    'Bebidas': 'coffee',
    'Despensa': 'utensils',
    'Congelados': 'snowflake',
    'Cuidado Personal': 'heart-pulse',
    'Mascotas': 'dog',
    'General': 'package'
  };

  // Diccionario de normalización de sinónimos comunes del supermercado
  const SYNONYM_MAP = {
    // Frutas y Verduras
    'fruta': 'Frutas',
    'frutas': 'Frutas',
    'verdura': 'Frutas',
    'verduras': 'Frutas',
    'vegetal': 'Frutas',
    'vegetales': 'Frutas',
    'huerta': 'Frutas',
    'fresco': 'Frutas',
    'frescos': 'Frutas',
    'manzana': 'Frutas',
    'manzanas': 'Frutas',
    'platano': 'Frutas',
    'plátano': 'Frutas',
    'platanos': 'Frutas',
    'plátanos': 'Frutas',
    'tomate': 'Frutas',
    'tomates': 'Frutas',

    // Lácteos y Huevos
    'lacteo': 'Lácteos',
    'lacteos': 'Lácteos',
    'lácteo': 'Lácteos',
    'lácteos': 'Lácteos',
    'leche': 'Lácteos',
    'queso': 'Lácteos',
    'quesos': 'Lácteos',
    'yogur': 'Lácteos',
    'yogurt': 'Lácteos',
    'huevo': 'Lácteos',
    'huevos': 'Lácteos',
    'manteca': 'Lácteos',
    'mantequilla': 'Lácteos',
    'crema': 'Lácteos',

    // Carnes y Pescados
    'carne': 'Carnes',
    'carnes': 'Carnes',
    'carniceria': 'Carnes',
    'carnicería': 'Carnes',
    'pollo': 'Carnes',
    'pescado': 'Carnes',
    'pescados': 'Carnes',
    'marisco': 'Carnes',
    'mariscos': 'Carnes',
    'cerdo': 'Carnes',
    'vaca': 'Carnes',
    'res': 'Carnes',
    'embutido': 'Carnes',
    'embutidos': 'Carnes',
    'jamon': 'Carnes',
    'jamón': 'Carnes',

    // Panadería y Masas
    'pan': 'Panadería',
    'panes': 'Panadería',
    'panaderia': 'Panadería',
    'panadería': 'Panadería',
    'factura': 'Panadería',
    'facturas': 'Panadería',
    'pasteleria': 'Panadería',
    'pastelería': 'Panadería',
    'medialuna': 'Panadería',
    'medialunas': 'Panadería',
    'harina': 'Panadería',
    'galleta': 'Panadería',
    'galletas': 'Panadería',
    'bolleria': 'Panadería',
    'bollería': 'Panadería',

    // Limpieza y Hogar
    'limpieza': 'Limpieza',
    'hogar': 'Limpieza',
    'detergente': 'Limpieza',
    'lavandina': 'Limpieza',
    'cloro': 'Limpieza',
    'jabon': 'Limpieza',
    'jabón': 'Limpieza',
    'desinfectante': 'Limpieza',
    'papel': 'Limpieza',
    'rollos': 'Limpieza',
    'lavavajillas': 'Limpieza',

    // Bebidas y Licores
    'bebida': 'Bebidas',
    'bebidas': 'Bebidas',
    'gaseosa': 'Bebidas',
    'gaseosas': 'Bebidas',
    'refresco': 'Bebidas',
    'refrescos': 'Bebidas',
    'agua': 'Bebidas',
    'jugo': 'Bebidas',
    'jugos': 'Bebidas',
    'vino': 'Bebidas',
    'vinos': 'Bebidas',
    'cerveza': 'Bebidas',
    'cervezas': 'Bebidas',
    'cafe': 'Bebidas',
    'café': 'Bebidas',
    'te': 'Bebidas',
    'té': 'Bebidas',
    'infusion': 'Bebidas',
    'infusiones': 'Bebidas',

    // Despensa y Almacén
    'despensa': 'Despensa',
    'almacen': 'Despensa',
    'almacén': 'Despensa',
    'arroz': 'Despensa',
    'fideo': 'Despensa',
    'fideos': 'Despensa',
    'pasta': 'Despensa',
    'pastas': 'Despensa',
    'aceite': 'Despensa',
    'aceites': 'Despensa',
    'conserva': 'Despensa',
    'conservas': 'Despensa',
    'enlatado': 'Despensa',
    'enlatados': 'Despensa',
    'salsa': 'Despensa',
    'salsas': 'Despensa',
    'legumbre': 'Despensa',
    'legumbres': 'Despensa',

    // Congelados
    'congelado': 'Congelados',
    'congelados': 'Congelados',
    'helado': 'Congelados',
    'helados': 'Congelados',
    'hielo': 'Congelados',

    // Cuidado Personal y Salud
    'farmacia': 'Cuidado Personal',
    'higiene': 'Cuidado Personal',
    'salud': 'Cuidado Personal',
    'perfumeria': 'Cuidado Personal',
    'perfumería': 'Cuidado Personal',
    'shampoo': 'Cuidado Personal',
    'champu': 'Cuidado Personal',
    'dentifrico': 'Cuidado Personal',
    'pasta dental': 'Cuidado Personal',
    'medicamento': 'Cuidado Personal',
    'medicamentos': 'Cuidado Personal',
    'cuidado personal': 'Cuidado Personal',

    // Mascotas
    'mascota': 'Mascotas',
    'mascotas': 'Mascotas',
    'perro': 'Mascotas',
    'perros': 'Mascotas',
    'gato': 'Mascotas',
    'gatos': 'Mascotas',
    'veterinaria': 'Mascotas',
    'alimento balanceado': 'Mascotas',

    // General / Varios
    'general': 'General',
    'varios': 'General',
    'otro': 'General',
    'otros': 'General'
  };

  /**
   * Normaliza cualquier string de categoría a su forma canónica.
   * @param {string} rawCategory
   * @returns {string} Categoría canónica
   */
  function normalizeCategory(rawCategory) {
    if (!rawCategory || typeof rawCategory !== 'string') return 'General';
    const clean = rawCategory.trim().toLowerCase();
    if (SYNONYM_MAP[clean]) {
      return SYNONYM_MAP[clean];
    }
    // Comprobar coincidencia exacta con mayúsculas en las 11 categorías
    for (const cat of Object.keys(CATEGORY_ICONS)) {
      if (cat.toLowerCase() === clean) return cat;
    }
    return 'General';
  }

  /**
   * Obtiene el nombre del icono Lucide asociado.
   * Cumple con los tests T1_F10_2 y T1_F10_3.
   * @param {string} category
   * @returns {string} Nombre del icono en Lucide (ej: 'apple', 'milk', 'package')
   */
  function getCategoryIcon(category) {
    const canonical = normalizeCategory(category);
    return CATEGORY_ICONS[canonical] || 'package';
  }

  /**
   * Genera un identificador slug seguro para clases CSS y data attributes.
   * @param {string} canonicalCategory
   * @returns {string} slug (ej: 'frutas', 'lacteos', 'cuidado-personal')
   */
  function getCategorySlug(canonicalCategory) {
    return canonicalCategory
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-');
  }

  /**
   * Genera un SVG en línea autónomo (100% offline, sin dependencias de red).
   * Cumple con el test T1_F10_5.
   * @param {string} category
   * @returns {string} Marcado SVG
   */
  function renderAvatarSVG(category) {
    const canonical = normalizeCategory(category);
    const slug = getCategorySlug(canonical);
    const icon = getCategoryIcon(canonical);

    return `<svg class="icon-${slug}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#icon-${icon}" /></svg>`;
  }

  /**
   * Genera el bloque HTML del contenedor avatar para la tarjeta de producto.
   * Utiliza las clases de badge temáticas definidas en style.css.
   * @param {string} category
   * @param {string} [name='']
   * @returns {string} Marcado HTML del avatar
   */
  function getAvatarMarkup(category, name) {
    const canonical = normalizeCategory(category);
    const slug = getCategorySlug(canonical);
    const icon = getCategoryIcon(canonical);

    return `<div class="product-avatar avatar-${slug}" aria-hidden="true" title="${canonical}">` +
             `<i data-lucide="${icon}"></i>` +
           `</div>`;
  }

  return {
    CATEGORY_ICONS,
    SYNONYM_MAP,
    normalizeCategory,
    getCategoryIcon,
    getCategorySlug,
    renderAvatarSVG,
    getAvatarMarkup
  };
}));
