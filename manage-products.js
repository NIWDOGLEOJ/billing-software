import Database from 'better-sqlite3';
import readline from 'readline';

const db = new Database('./store.db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  while (true) {
    console.clear();
    console.log("=========================================");
    console.log("📦 RETAIL POS - DATABASE PRODUCT MANAGER");
    console.log("=========================================");
    console.log("1. 📋 List All Products");
    console.log("2. ➕ Add a New Product");
    console.log("3. ✏️ Edit an Existing Product");
    console.log("4. ❌ Delete a Product");
    console.log("5. 🚪 Exit");
    console.log("=========================================");
    
    const choice = await question("Choose an option (1-5): ");
    
    if (choice === '1') {
      const products = db.prepare("SELECT * FROM products").all();
      console.log("\n📋 PRODUCT CATALOG:\n");
      console.table(products.map(p => ({
        ID: p.id,
        SKU: p.sku,
        Name: p.name,
        Price: `₹${p.price.toFixed(2)}`,
        Category: p.category,
        GST: `${p.gst_rate}%`,
        Stock: p.stock
      })));
      await question("\nPress Enter to continue...");
    } else if (choice === '2') {
      console.log("\n➕ ADD NEW PRODUCT:\n");
      const id = await question("Product ID (e.g. 1011): ");
      if (!id.trim()) {
        console.log("❌ Product ID is required!");
        await question("\nPress Enter to continue...");
        continue;
      }
      const sku = await question("Product SKU (e.g. 1011): ");
      if (!sku.trim()) {
        console.log("❌ SKU is required!");
        await question("\nPress Enter to continue...");
        continue;
      }
      
      const existing = db.prepare("SELECT * FROM products WHERE id = ? OR sku = ?").get(id, sku);
      if (existing) {
        console.log("❌ Error: A product with this ID or SKU already exists!");
        await question("\nPress Enter to continue...");
        continue;
      }
      
      const name = await question("Product Name: ");
      if (!name.trim()) {
        console.log("❌ Product Name is required!");
        await question("\nPress Enter to continue...");
        continue;
      }
      
      const priceStr = await question("Price (₹): ");
      const price = parseFloat(priceStr);
      if (isNaN(price) || price < 0) {
        console.log("❌ Error: Valid price value is required!");
        await question("\nPress Enter to continue...");
        continue;
      }
      
      const category = await question("Category (default: General): ") || "General";
      const gst_rate = parseFloat(await question("GST Rate % (default: 0): ") || "0");
      const stock = parseInt(await question("Initial Stock (default: 0): ") || "0");
      const low_stock_threshold = parseInt(await question("Low Stock Alert Threshold (default: 10): ") || "10");
      
      db.prepare(`
        INSERT INTO products (id, sku, name, price, category, gst_rate, stock, low_stock_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, sku, name, price, category, gst_rate, stock, low_stock_threshold);
      
      console.log("\n✅ Product successfully added!");
      await question("\nPress Enter to continue...");
    } else if (choice === '3') {
      console.log("\n✏️ EDIT PRODUCT:\n");
      const id = await question("Enter Product ID to Edit: ");
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
      if (!product) {
        console.log("❌ Product not found!");
        await question("\nPress Enter to continue...");
        continue;
      }
      
      console.log(`\nCurrent details for [${product.name}]:`);
      console.log(`SKU: ${product.sku}, Price: ₹${product.price}, Category: ${product.category}, Stock: ${product.stock}`);
      
      const name = await question(`New Name (leave blank to keep [${product.name}]): `) || product.name;
      const sku = await question(`New SKU (leave blank to keep [${product.sku}]): `) || product.sku;
      
      if (sku !== product.sku) {
        const existingSku = db.prepare("SELECT * FROM products WHERE sku = ?").get(sku);
        if (existingSku) {
          console.log("❌ Error: This SKU is already taken by another product!");
          await question("\nPress Enter to continue...");
          continue;
        }
      }
      
      const priceStr = await question(`New Price (leave blank to keep [₹${product.price}]): `);
      const price = priceStr ? parseFloat(priceStr) : product.price;
      
      const category = await question(`New Category (leave blank to keep [${product.category}]): `) || product.category;
      
      const gstRateStr = await question(`New GST Rate % (leave blank to keep [${product.gst_rate}%]): `);
      const gst_rate = gstRateStr ? parseFloat(gstRateStr) : product.gst_rate;
      
      const stockStr = await question(`New Stock Count (leave blank to keep [${product.stock}]): `);
      const stock = stockStr ? parseInt(stockStr) : product.stock;
      
      const thresholdStr = await question(`New Low Stock Threshold (leave blank to keep [${product.low_stock_threshold}]): `);
      const low_stock_threshold = thresholdStr ? parseInt(thresholdStr) : product.low_stock_threshold;
      
      db.prepare(`
        UPDATE products
        SET sku = ?, name = ?, price = ?, category = ?, gst_rate = ?, stock = ?, low_stock_threshold = ?
        WHERE id = ?
      `).run(sku, name, price, category, gst_rate, stock, low_stock_threshold, id);
      
      console.log("\n✅ Product successfully updated!");
      await question("\nPress Enter to continue...");
    } else if (choice === '4') {
      console.log("\n❌ DELETE PRODUCT:\n");
      const id = await question("Enter Product ID to Delete: ");
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
      if (!product) {
        console.log("❌ Product not found!");
        await question("\nPress Enter to continue...");
        continue;
      }
      
      const confirmDelete = await question(`Are you sure you want to permanently delete [${product.name}]? (y/n): `);
      if (confirmDelete.toLowerCase() === 'y') {
        db.prepare("DELETE FROM products WHERE id = ?").run(id);
        console.log("\n✅ Product successfully deleted!");
      } else {
        console.log("\nDeletion cancelled.");
      }
      await question("\nPress Enter to continue...");
    } else if (choice === '5') {
      console.log("\n🚪 Exiting. Goodbye!");
      rl.close();
      db.close();
      break;
    }
  }
}

main();
