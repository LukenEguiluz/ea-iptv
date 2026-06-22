import { useEffect } from 'react'

/** Selecciona la primera categoría al cargar (modo Smarters, sin pestaña «Todas»). */
export default function useFirstCategory(categories, activeCategory, setActiveCategory) {
  useEffect(() => {
    if (!categories.length || activeCategory) return
    const first = categories[0]
    if (first?.category_id != null) {
      setActiveCategory(String(first.category_id))
    }
  }, [categories, activeCategory, setActiveCategory])
}
