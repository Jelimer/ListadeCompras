import {
  Apple,
  Milk,
  Beef,
  Croissant,
  Sparkles,
  Coffee,
  Utensils,
  Snowflake,
  HeartPulse,
  Dog,
  Package,
  LucideIcon
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Frutas': Apple,
  'Lácteos': Milk,
  'Carnes': Beef,
  'Panadería': Croissant,
  'Limpieza': Sparkles,
  'Bebidas': Coffee,
  'Despensa': Utensils,
  'Congelados': Snowflake,
  'Cuidado Personal': HeartPulse,
  'Mascotas': Dog,
  'General': Package,
};

const SYNONYM_MAP: Record<string, string> = {
  'fruta': 'Frutas',
  'frutas': 'Frutas',
  'verdura': 'Frutas',
  'verduras': 'Frutas',
  'vegetal': 'Frutas',
  'vegetales': 'Frutas',
  'lacteo': 'Lácteos',
  'lacteos': 'Lácteos',
  'lácteo': 'Lácteos',
  'lácteos': 'Lácteos',
  'leche': 'Lácteos',
  'queso': 'Lácteos',
  'quesos': 'Lácteos',
  'yogur': 'Lácteos',
  'huevo': 'Lácteos',
  'huevos': 'Lácteos',
  'carne': 'Carnes',
  'carnes': 'Carnes',
  'pollo': 'Carnes',
  'pescado': 'Carnes',
  'res': 'Carnes',
  'cerdo': 'Carnes',
  'pan': 'Panadería',
  'panaderia': 'Panadería',
  'panadería': 'Panadería',
  'facturas': 'Panadería',
  'torta': 'Panadería',
  'limpieza': 'Limpieza',
  'detergente': 'Limpieza',
  'jabon': 'Limpieza',
  'lavandina': 'Limpieza',
  'bebida': 'Bebidas',
  'bebidas': 'Bebidas',
  'agua': 'Bebidas',
  'gaseosa': 'Bebidas',
  'vino': 'Bebidas',
  'cerveza': 'Bebidas',
  'cafe': 'Bebidas',
  'despensa': 'Despensa',
  'almacen': 'Despensa',
  'arroz': 'Despensa',
  'fideos': 'Despensa',
  'aceite': 'Despensa',
  'congelado': 'Congelados',
  'congelados': 'Congelados',
  'helado': 'Congelados',
  'personal': 'Cuidado Personal',
  'cuidado personal': 'Cuidado Personal',
  'higiene': 'Cuidado Personal',
  'farmacia': 'Cuidado Personal',
  'mascota': 'Mascotas',
  'mascotas': 'Mascotas',
  'perro': 'Mascotas',
  'gato': 'Mascotas',
};

export function resolveCanonicalCategory(input: string): string {
  if (!input) return 'General';
  const clean = input.trim().toLowerCase();
  if (SYNONYM_MAP[clean]) {
    return SYNONYM_MAP[clean];
  }
  for (const key of Object.keys(CATEGORY_ICONS)) {
    if (key.toLowerCase() === clean) {
      return key;
    }
  }
  return input.trim() || 'General';
}

export function getCategoryIcon(categoryName: string): LucideIcon {
  const canonical = resolveCanonicalCategory(categoryName);
  return CATEGORY_ICONS[canonical] || Package;
}
