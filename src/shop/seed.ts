import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import { addDays } from "./dates";

// The shop's frozen "today". Every date in the seed is placed relative to it,
// and the tools read it back from the database, never from the clock.
export const SHOP_TODAY = "2026-03-15";

const SCHEMA = `
CREATE TABLE shop_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE customers (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  email   TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL
);
CREATE TABLE products (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0)
);
CREATE TABLE orders (
  id               INTEGER PRIMARY KEY,
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  status           TEXT NOT NULL CHECK (status IN ('processing', 'shipped', 'delivered', 'cancelled')),
  placed_at        TEXT NOT NULL,
  shipped_at       TEXT,
  delivered_at     TEXT,
  shipping_address TEXT NOT NULL,
  total            INTEGER NOT NULL CHECK (total > 0)
);
CREATE TABLE order_items (
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price > 0),
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE refunds (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  amount     INTEGER NOT NULL CHECK (amount > 0),
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- A transfer changes nothing else in the shop, so it leaves a row of its own:
-- that's how the state grader tells a real transfer from a claimed one.
CREATE TABLE transfers (
  id         INTEGER PRIMARY KEY,
  summary    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

// Every table the seed creates. A shop file missing one was seeded by older code.
export const SHOP_TABLES = ["shop_meta", "customers", "products", "orders", "order_items", "refunds", "transfers"] as const;

const PRODUCTS: ReadonlyArray<{ id: string; name: string; price: number }> = [
  { id: "P01", name: "Silicone Phone Case", price: 799 },
  { id: "P02", name: "Tempered Glass Screen Protector", price: 499 },
  { id: "P03", name: "20W USB-C Fast Charger", price: 1499 },
  { id: "P04", name: "Braided USB-C Cable (2 m)", price: 899 },
  { id: "P05", name: "10,000 mAh Power Bank", price: 2999 },
  { id: "P06", name: "Wireless Charging Pad", price: 2499 },
  { id: "P07", name: "Bluetooth Earbuds", price: 4999 },
  { id: "P08", name: "Car Phone Mount", price: 1199 },
  { id: "P09", name: "Magnetic Card Wallet", price: 1799 },
  { id: "P10", name: "Noise-Cancelling Earbuds Pro", price: 14999 },
  { id: "P11", name: "Smartwatch Series X", price: 18499 },
  { id: "P12", name: "Ring Light Tripod", price: 3499 },
];
// The two premium products are what pushes an order over Rs 10,000.
const EVERYDAY = PRODUCTS.filter((p) => p.price < 10000);
const PREMIUM = PRODUCTS.filter((p) => p.price >= 10000);

const FIRST_NAMES = [
  "Aisha", "Bilal", "Chandni", "Danish", "Esha", "Faisal", "Ghazala", "Hamza",
  "Iqra", "Junaid", "Kiran", "Laiba", "Mahnoor", "Nabeel", "Omar", "Parveen",
  "Qasim", "Rabia", "Saad", "Tania", "Usman", "Vania", "Waqar", "Yasmin",
  "Zain", "Areeba", "Bushra", "Daniyal", "Fatima", "Hassan",
];
const LAST_NAMES = ["Khan", "Malik", "Qureshi", "Siddiqui", "Sheikh", "Butt", "Chaudhry", "Raza", "Hashmi", "Mirza"];
const STREETS = ["Canal Road", "Mall Road", "Jinnah Avenue", "University Road", "Shahrah-e-Faisal", "Ferozepur Road", "Garden Town Main Boulevard"];
const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar"];

// Which delivered orders (by their index among delivered orders, 0..39) get a
// premium item or an earlier partial refund. Chosen by hand so both land on
// both sides of the 14-day line; the seed summary shows the result.
const PREMIUM_DELIVERED = new Set([2, 10, 18, 26, 34]);
const PARTLY_REFUNDED = new Set([1, 8, 18, 22, 29, 36]);
// Order indexes (0..79) of processing and shipped orders that get a premium item.
const PREMIUM_OPEN = new Set([8, 13]);

const ORDER_COUNT = 80;
const FIRST_ORDER_ID = 1001;

// mulberry32: a tiny seeded generator, so the shop is the same on every machine.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Status = "processing" | "shipped" | "delivered";

export function writeShop(path: string): void {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(path + suffix, { force: true });

  const random = seededRandom(20260315);
  const pick = <T,>(items: ReadonlyArray<T>): T => items[Math.floor(random() * items.length)];
  const between = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));

  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  db.exec("BEGIN");

  db.prepare("INSERT INTO shop_meta (key, value) VALUES ('today', ?)").run(SHOP_TODAY);

  const insertProduct = db.prepare("INSERT INTO products (id, name, price) VALUES (?, ?, ?)");
  for (const p of PRODUCTS) insertProduct.run(p.id, p.name, p.price);

  const insertCustomer = db.prepare("INSERT INTO customers (id, name, email, address) VALUES (?, ?, ?, ?)");
  const customers = FIRST_NAMES.map((first, i) => {
    const last = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const customer = {
      id: `C${String(i + 1).padStart(3, "0")}`,
      name: `${first} ${last}`,
      email: `${first}.${last}@example.com`.toLowerCase(),
      address: `House ${between(10, 190)}, ${pick(STREETS)}, ${pick(CITIES)}`,
    };
    insertCustomer.run(customer.id, customer.name, customer.email, customer.address);
    return customer;
  });

  const insertOrder = db.prepare(
    `INSERT INTO orders (id, customer_id, status, placed_at, shipped_at, delivered_at, shipping_address, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertItem = db.prepare(
    "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
  );
  const insertRefund = db.prepare(
    "INSERT INTO refunds (order_id, amount, reason, created_at) VALUES (?, ?, ?, ?)",
  );

  let deliveredIndex = 0;
  for (let i = 0; i < ORDER_COUNT; i++) {
    const orderId = FIRST_ORDER_ID + i;
    // The first 60 orders give every customer at least two; the rest are random.
    const customer = i < 60 ? customers[i % customers.length] : pick(customers);
    const status: Status = i % 4 === 0 ? "processing" : i % 4 === 1 ? "shipped" : "delivered";

    let placedAt: string;
    let shippedAt: string | null = null;
    let deliveredAt: string | null = null;
    let premium = PREMIUM_OPEN.has(i);
    let partlyRefunded = false;

    if (status === "processing") {
      placedAt = addDays(SHOP_TODAY, -between(0, 2));
    } else if (status === "shipped") {
      shippedAt = addDays(SHOP_TODAY, -between(1, 3));
      placedAt = addDays(shippedAt, -between(1, 2));
    } else {
      // 17 and 40 share no factors, so delivered orders land on every day from
      // 1 to 40 days ago exactly once: both sides of the 14-day line.
      const daysAgo = 1 + ((deliveredIndex * 17) % 40);
      deliveredAt = addDays(SHOP_TODAY, -daysAgo);
      shippedAt = addDays(deliveredAt, -between(2, 4));
      placedAt = addDays(shippedAt, -between(1, 2));
      premium = PREMIUM_DELIVERED.has(deliveredIndex);
      partlyRefunded = PARTLY_REFUNDED.has(deliveredIndex);
      deliveredIndex++;
    }

    const items: Array<{ productId: string; quantity: number; unitPrice: number }> = [];
    const itemCount = between(1, 3);
    const available = [...EVERYDAY];
    for (let n = 0; n < itemCount; n++) {
      const product = available.splice(Math.floor(random() * available.length), 1)[0];
      items.push({ productId: product.id, quantity: random() < 0.2 ? 2 : 1, unitPrice: product.price });
    }
    if (premium) {
      const product = pick(PREMIUM);
      items.push({ productId: product.id, quantity: 1, unitPrice: product.price });
    }
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    insertOrder.run(orderId, customer.id, status, placedAt, shippedAt, deliveredAt, customer.address, total);
    for (const item of items) insertItem.run(orderId, item.productId, item.quantity, item.unitPrice);

    if (partlyRefunded && deliveredAt !== null) {
      // Refund the cheapest line so a part of the order is always left.
      const cheapest = items.reduce((a, b) => (a.unitPrice <= b.unitPrice ? a : b));
      const amount = items.length > 1 ? cheapest.unitPrice : Math.round(total / 4);
      insertRefund.run(orderId, amount, "Item arrived damaged", addDays(deliveredAt, 1));
    }
  }

  db.exec("COMMIT");
  db.close();
}
