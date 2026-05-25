/** Static kitchen menu — v1 has no backend ordering; categories and items are FE constants. */
export interface KitchenItem {
  name: string;
  desc: string;
  price: number;
  tag?: string;
}

export interface KitchenCategory {
  cat: string;
  items: KitchenItem[];
}

export const KITCHEN: KitchenCategory[] = [
  {
    cat: 'Закуски',
    items: [
      { name: 'Тартар из говядины', desc: 'Перепелиный желток · бородинские крутоны', price: 890, tag: 'хит' },
      { name: 'Севиче из дорадо', desc: 'Лайм · авокадо · кинза', price: 780 },
      { name: 'Сырная тарелка', desc: '4 сорта · мёд · орехи', price: 1240 },
    ],
  },
  {
    cat: 'Горячее',
    items: [
      { name: 'Стейк Рибай', desc: '300 г · перечный соус', price: 2400, tag: 'шеф' },
      { name: 'Цыплёнок BBQ', desc: 'Печёный картофель · соус барбекю', price: 980 },
      { name: 'Паста с трюфелем', desc: 'Тальятелле · крем-соус · пармезан', price: 1180 },
      { name: 'Бургер NUTS', desc: 'Мраморная говядина · бекон · бриошь', price: 890 },
    ],
  },
  {
    cat: 'Напитки',
    items: [
      { name: 'Эспрессо', desc: 'Свежеобжаренный', price: 220 },
      { name: 'Чай в чайнике 0.7л', desc: 'Сенча · улун · пуэр', price: 480 },
      { name: 'Свежевыжатый сок', desc: 'Апельсин/яблоко/морковь', price: 360 },
    ],
  },
];
